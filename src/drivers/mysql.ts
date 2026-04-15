import mysql from 'mysql2/promise'
import type { IDriver, QueryResult } from './base'
import type {
  ConnectionConfig, BatchQueryResponse, BatchQueryResult,
  SchemaInfo, SchemaObjects, ColumnInfo, FKInfo, IndexInfo,
  TableInfo, ViewInfo,
  SelectAllParams, DataChangesParams, ExplainResult, ExplainNode,
  SessionRow, LockRow, TableStatRow, DbInfo
} from '../connection/types'
import {
  buildMysqlDDL, buildAlterTableMysqlDDL,
  type CreateTableParams, type AlterTableParams, type CreateIndexParams
} from './ddlBuilder'
import { readMysqlTableDDL } from './mysqlDdlReader'

function buildConfig(conn: ConnectionConfig, password: string): mysql.ConnectionOptions {
  if (conn.inputMode === 'url' && conn.url) {
    const u = new URL(conn.url.replace(/^jdbc:/i, ''))
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      database: u.pathname.slice(1) || undefined,
      user: conn.username ?? undefined,
      password: password || undefined,
    }
  }
  return {
    host: conn.host ?? undefined,
    port: conn.port ?? undefined,
    database: conn.databaseName ?? undefined,
    user: conn.username ?? undefined,
    password: password || undefined,
  }
}

function mysqlTypeToCategory(type: number): string {
  if ([0, 1, 2, 3, 4, 5, 8, 9, 13, 16, 246].includes(type)) return 'numeric'
  if ([7, 10, 11, 12, 14].includes(type)) return 'datetime'
  return 'string'
}

function normalizeMysqlTable(table: Record<string, unknown>): ExplainNode {
  const costInfo = table['cost_info'] as Record<string, unknown> | undefined
  const cost = costInfo ? parseFloat((costInfo['prefix_cost'] as string) ?? '0') : undefined
  return {
    nodeType: ((table['access_type'] as string) ?? 'TABLE').toUpperCase(),
    cost,
    rows: table['rows_examined_per_scan'] as number | undefined,
    relation: table['table_name'] as string | undefined,
    children: [],
    extra: table,
  }
}

function normalizeMysqlBlock(block: Record<string, unknown>): ExplainNode {
  const costInfo = block['cost_info'] as Record<string, unknown> | undefined
  const cost = costInfo ? parseFloat((costInfo['query_cost'] as string) ?? '0') : undefined
  const children: ExplainNode[] = []
  const nestedLoop = block['nested_loop'] as Record<string, unknown>[] | undefined
  if (nestedLoop) {
    for (const item of nestedLoop) {
      if (item['table']) children.push(normalizeMysqlTable(item['table'] as Record<string, unknown>))
    }
  } else if (block['table']) {
    children.push(normalizeMysqlTable(block['table'] as Record<string, unknown>))
  }
  return { nodeType: 'Query Block', cost, children, extra: block }
}

function normalizeMariadbTable(table: Record<string, unknown>): ExplainNode {
  const cost = table['cost'] != null ? Number(table['cost']) : undefined
  return {
    nodeType: ((table['access_type'] as string) ?? 'TABLE').toUpperCase(),
    cost,
    rows: table['rows'] as number | undefined,
    relation: table['table_name'] as string | undefined,
    children: [],
    extra: table,
  }
}

function normalizeMariadbBlock(block: Record<string, unknown>): ExplainNode {
  const cost = block['cost'] != null ? Number(block['cost']) : undefined
  const children: ExplainNode[] = []
  const nestedLoop = block['nested_loop'] as Record<string, unknown>[] | undefined
  if (nestedLoop) {
    for (const item of nestedLoop) {
      if (item['table']) children.push(normalizeMariadbTable(item['table'] as Record<string, unknown>))
    }
  } else if (block['table']) {
    children.push(normalizeMariadbTable(block['table'] as Record<string, unknown>))
  }
  return { nodeType: 'Query Block', cost, children, extra: block }
}

/**
 * MySQL / MariaDB 드라이버. connect() 후 persistent Connection을 유지한다.
 */
export class MysqlDriver implements IDriver {
  private connection: mysql.Connection | null = null
  private config: mysql.ConnectionOptions
  private isMariadb: boolean
  private threadId: number | undefined

  constructor(conn: ConnectionConfig, password: string) {
    this.config = buildConfig(conn, password)
    this.isMariadb = conn.dbType === 'mariadb'
  }

  async connect(): Promise<void> {
    this.connection = await mysql.createConnection(this.config)
    this.threadId = this.connection.threadId ?? undefined
  }

  async testConnection(): Promise<void> {
    const conn = await mysql.createConnection(this.config)
    try {
      await conn.query('SELECT 1')
    } finally {
      await conn.end().catch(() => {})
    }
  }

  async disconnect(): Promise<void> {
    await this.connection?.end()
    this.connection = null
  }

  private getConn(): mysql.Connection {
    if (!this.connection) throw new Error('연결되지 않았습니다.')
    return this.connection
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.connection) return { ok: false, message: '연결되지 않았습니다.' }
    try {
      const [rowsOrOk, fields] = await this.connection.query(sql)
      if (Array.isArray(rowsOrOk) && fields) {
        const fieldDefs = fields as mysql.FieldPacket[]
        const columns = fieldDefs.map((f) => f.name)
        const columnTypes: Record<string, string> = {}
        for (const f of fieldDefs) {
          columnTypes[f.name] = mysqlTypeToCategory((f as unknown as { type: number }).type ?? 0)
        }
        return {
          ok: true,
          columns,
          rows: rowsOrOk as Record<string, unknown>[],
          affectedRows: null,
          columnTypes,
        }
      }
      const ok = rowsOrOk as mysql.ResultSetHeader
      return { ok: true, columns: [], rows: [], affectedRows: ok.affectedRows ?? null, columnTypes: {} }
    } catch (err) {
      return { ok: false, message: (err as Error).message }
    }
  }

  async executeQueryBatch(sqls: string[], stopOnError: boolean, useTransaction = false): Promise<BatchQueryResponse> {
    const conn = this.getConn()
    const results: BatchQueryResult[] = []
    let transactionResult: 'committed' | 'rolledback' | undefined
    let errorOccurred = false

    try {
      if (useTransaction) await conn.beginTransaction()
      for (let i = 0; i < sqls.length; i++) {
        const sql = sqls[i]
        const start = Date.now()
        try {
          const [rowsOrOk, fields] = await conn.query(sql)
          const executionTime = Date.now() - start
          if (Array.isArray(rowsOrOk) && fields) {
            const columns = (fields as mysql.FieldPacket[]).map((f) => f.name)
            const columnTypes: Record<string, string> = {}
            for (const f of fields as mysql.FieldPacket[]) {
              columnTypes[f.name] = mysqlTypeToCategory((f as unknown as { type: number }).type ?? 0)
            }
            results.push({ ok: true, columns, rows: rowsOrOk as Record<string, unknown>[], affectedRows: null, executionTime, columnTypes })
          } else {
            const ok = rowsOrOk as mysql.ResultSetHeader
            results.push({ ok: true, columns: [], rows: [], affectedRows: ok.affectedRows ?? null, executionTime, columnTypes: {} })
          }
        } catch (err) {
          const executionTime = Date.now() - start
          results.push({ ok: false, message: (err as Error).message, executionTime })
          errorOccurred = true
          if (stopOnError) {
            for (let j = i + 1; j < sqls.length; j++) {
              results.push({ ok: false, message: '이전 쿼리 실패로 인해 실행되지 않았습니다.', executionTime: 0, skipped: true })
            }
            break
          }
        }
      }
      if (useTransaction) {
        if (errorOccurred) {
          await conn.rollback()
          transactionResult = 'rolledback'
        } else {
          await conn.commit()
          transactionResult = 'committed'
        }
      }
    } catch (err) {
      if (useTransaction) {
        await conn.rollback().catch(() => {})
        transactionResult = 'rolledback'
      }
      throw err
    }

    return { results, transactionResult }
  }

  async cancelQuery(): Promise<{ ok: boolean }> {
    if (this.threadId === undefined) return { ok: false }
    const cancelConn = await mysql.createConnection(this.config)
    try {
      await cancelConn.query('KILL QUERY ?', [this.threadId])
      return { ok: true }
    } catch {
      return { ok: false }
    } finally {
      await cancelConn.end().catch(() => {})
    }
  }

  async explainQuery(sql: string): Promise<ExplainResult> {
    const conn = this.getConn()
    try {
      const [rows] = await conn.query(`EXPLAIN FORMAT=JSON ${sql}`)
      const raw = (rows as Record<string, unknown>[])[0]['EXPLAIN'] as string
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const block = parsed['query_block'] as Record<string, unknown>
      const plan = this.isMariadb ? normalizeMariadbBlock(block) : normalizeMysqlBlock(block)
      return { ok: true, plan }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    const conn = this.getConn()
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT schema_name AS name
       FROM information_schema.schemata
       WHERE schema_name NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
       ORDER BY schema_name`
    )
    return rows.map((r) => ({ name: r.name as string, owned: false }))
  }

  async getErdData(schemaName: string): Promise<TableInfo[]> {
    return (await this.getSchemaObjects(schemaName)).tables
  }

  async getSchemaObjects(schemaName: string): Promise<SchemaObjects> {
    const conn = this.getConn()
    const db = schemaName

    const [[tableRows], [viewRows]] = await Promise.all([
      conn.query<mysql.RowDataPacket[]>(
        `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = ? AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        [db]
      ),
      conn.query<mysql.RowDataPacket[]>(
        `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = ? AND table_type = 'VIEW'
         ORDER BY table_name`,
        [db]
      )
    ])

    const tableNames = tableRows.map((r) => r.name as string)
    const viewNames = viewRows.map((r) => r.name as string)
    const allNames = [...tableNames, ...viewNames]

    if (allNames.length === 0) {
      return { tables: [], views: [], materialized_views: [], functions: [] }
    }

    const inPlaceholders = (arr: string[]): string => arr.map(() => '?').join(',')

    const [[columnsRows], [pkRows], [fkRows], [indexRows]] = await Promise.all([
      conn.query<mysql.RowDataPacket[]>(
        `SELECT table_name AS table_name, column_name AS column_name, column_type AS column_type, is_nullable AS is_nullable, column_default AS column_default
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name IN (${inPlaceholders(allNames)})
         ORDER BY table_name, ordinal_position`,
        [db, ...allNames]
      ),
      conn.query<mysql.RowDataPacket[]>(
        `SELECT table_name AS table_name, column_name AS column_name
         FROM information_schema.key_column_usage
         WHERE table_schema = ? AND table_name IN (${inPlaceholders(tableNames.length > 0 ? tableNames : ['__none__'])}) AND constraint_name = 'PRIMARY'
         ORDER BY table_name, ordinal_position`,
        tableNames.length > 0 ? [db, ...tableNames] : [db, '__none__']
      ),
      conn.query<mysql.RowDataPacket[]>(
        `SELECT
           kcu.table_name AS table_name, kcu.constraint_name AS constraint_name, kcu.column_name AS local_column,
           kcu.referenced_table_schema AS ref_schema,
           kcu.referenced_table_name AS ref_table,
           kcu.referenced_column_name AS ref_column,
           rc.delete_rule AS delete_rule, rc.update_rule AS update_rule
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = kcu.constraint_name
           AND rc.constraint_schema = kcu.table_schema
         WHERE kcu.table_schema = ? AND kcu.table_name IN (${inPlaceholders(tableNames.length > 0 ? tableNames : ['__none__'])})
           AND kcu.referenced_table_name IS NOT NULL
         ORDER BY kcu.table_name, kcu.constraint_name, kcu.ordinal_position`,
        tableNames.length > 0 ? [db, ...tableNames] : [db, '__none__']
      ),
      conn.query<mysql.RowDataPacket[]>(
        `SELECT
           s.table_name AS table_name, s.index_name AS index_name, s.non_unique AS non_unique, s.column_name AS column_name, s.seq_in_index AS seq_in_index
         FROM information_schema.statistics s
         WHERE s.table_schema = ? AND s.table_name IN (${inPlaceholders(tableNames.length > 0 ? tableNames : ['__none__'])})
         ORDER BY s.table_name, s.index_name, s.seq_in_index`,
        tableNames.length > 0 ? [db, ...tableNames] : [db, '__none__']
      )
    ])

    const pkSet = new Set(pkRows.map((r) => `${r.table_name}.${r.column_name}`))

    const columnsByTable = new Map<string, ColumnInfo[]>()
    for (const r of columnsRows) {
      const tbl = r.table_name as string
      if (!columnsByTable.has(tbl)) columnsByTable.set(tbl, [])
      columnsByTable.get(tbl)!.push({
        name: r.column_name as string,
        dataType: r.column_type as string,
        nullable: r.is_nullable === 'YES',
        isPrimaryKey: pkSet.has(`${tbl}.${r.column_name}`),
        defaultValue: r.column_default as string | null
      })
    }

    const fksByTable = new Map<string, FKInfo[]>()
    const fkMap = new Map<string, FKInfo>()
    for (const r of fkRows) {
      const tbl = r.table_name as string
      const key = `${tbl}.${r.constraint_name as string}`
      if (!fkMap.has(key)) {
        const fk: FKInfo = {
          constraintName: r.constraint_name as string,
          localColumns: [],
          refSchema: r.ref_schema as string,
          refTable: r.ref_table as string,
          refColumns: [],
          onDelete: r.delete_rule as string,
          onUpdate: r.update_rule as string
        }
        fkMap.set(key, fk)
        if (!fksByTable.has(tbl)) fksByTable.set(tbl, [])
        fksByTable.get(tbl)!.push(fk)
      }
      fkMap.get(key)!.localColumns.push(r.local_column as string)
      fkMap.get(key)!.refColumns.push(r.ref_column as string)
    }

    const indexesByTable = new Map<string, Map<string, IndexInfo>>()
    for (const r of indexRows) {
      const tbl = r.table_name as string
      const idxName = r.index_name as string
      if (!indexesByTable.has(tbl)) indexesByTable.set(tbl, new Map())
      const tblMap = indexesByTable.get(tbl)!
      if (!tblMap.has(idxName)) {
        tblMap.set(idxName, { name: idxName, unique: r.non_unique === 0, columns: [] })
      }
      tblMap.get(idxName)!.columns.push(r.column_name as string)
    }

    const tables: TableInfo[] = tableNames.map((name) => ({
      name,
      columns: columnsByTable.get(name) ?? [],
      indexes: Array.from(indexesByTable.get(name)?.values() ?? []),
      sequences: [],
      foreignKeys: fksByTable.get(name) ?? []
    }))

    const views: ViewInfo[] = viewNames.map((name) => ({
      name,
      columns: columnsByTable.get(name) ?? []
    }))

    return { tables, views, materialized_views: [], functions: [] }
  }

  async getTableNames(schemaName: string): Promise<string[]> {
    const conn = this.getConn()
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = ? AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schemaName]
    )
    return rows.map((r) => r.name as string)
  }

  async getColumnNames(schemaName: string, tableName: string): Promise<string[]> {
    const conn = this.getConn()
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT column_name AS column_name
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [schemaName, tableName]
    )
    return rows.map((r) => r.column_name as string)
  }

  async selectAll(
    schemaName: string,
    tableName: string,
    params: SelectAllParams
  ): Promise<{
    columns: string[]
    primaryKeys: string[]
    rows: Record<string, unknown>[]
    totalCount: number
    columnDefaults: Record<string, string | null>
    columnTypes: Record<string, string>
  }> {
    const conn = this.getConn()
    const quoteIdent = (s: string): string => '`' + s.replace(/`/g, '``') + '`'
    const tableRef = `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`

    const [[colRows], [pkRows]] = await Promise.all([
      conn.query<mysql.RowDataPacket[]>(
        `SELECT column_name AS col_name, column_default AS col_default, column_type AS col_type
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position`,
        [schemaName, tableName]
      ),
      conn.query<mysql.RowDataPacket[]>(
        `SELECT column_name AS col_name
         FROM information_schema.key_column_usage
         WHERE table_schema = ? AND table_name = ? AND constraint_name = 'PRIMARY'
         ORDER BY ordinal_position`,
        [schemaName, tableName]
      )
    ])

    const columnNames = colRows.map((r) => r['col_name'] as string)
    const columnDefaults: Record<string, string | null> = {}
    const columnTypes: Record<string, string> = {}
    for (const r of colRows) {
      columnDefaults[r['col_name'] as string] = r['col_default'] as string | null
      columnTypes[r['col_name'] as string] = r['col_type'] as string
    }
    const primaryKeys = pkRows.map((r) => r['col_name'] as string)

    const searchPattern = params.search ? `%${params.search}%` : null
    const searchArgs: unknown[] = []
    const whereClause =
      searchPattern && columnNames.length > 0
        ? `WHERE (${columnNames.map((col) => { searchArgs.push(searchPattern); return `CAST(${quoteIdent(col)} AS CHAR) LIKE ?` }).join(' OR ')})`
        : ''

    const [countRows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM ${tableRef} ${whereClause}`,
      searchArgs
    )
    const totalCount = Number(countRows[0]?.count ?? 0)

    const orderClause =
      params.orderBy.length > 0
        ? `ORDER BY ${params.orderBy.map(({ col, dir }) => `${quoteIdent(col)} ${dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`
        : ''

    const dataArgs = [...searchArgs]
    let limitClause = ''
    if (params.limit > 0) {
      limitClause = 'LIMIT ? OFFSET ?'
      dataArgs.push(params.limit, params.offset)
    }

    const sql = [`SELECT * FROM ${tableRef}`, whereClause, orderClause, limitClause]
      .filter(Boolean)
      .join(' ')

    const [dataRows] = await conn.query<mysql.RowDataPacket[]>(sql, dataArgs)

    return {
      columns: columnNames,
      primaryKeys,
      rows: dataRows as Record<string, unknown>[],
      totalCount,
      columnDefaults,
      columnTypes,
    }
  }

  async executeDataChanges(params: DataChangesParams): Promise<{ success: true }> {
    const conn = this.getConn()
    const quoteIdent = (s: string): string => '`' + s.replace(/`/g, '``') + '`'
    const isMetaKey = (k: string): boolean => k.startsWith('__')
    const { schemaName, tableName, primaryKeys, inserts, updates, deletes } = params
    const tableRef = `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`

    const buildWhere = (row: Record<string, unknown>): { clause: string; values: unknown[] } => {
      const whereCols = primaryKeys.length > 0 ? primaryKeys : Object.keys(row).filter((k) => !isMetaKey(k))
      const values = whereCols.map((k) => row[k])
      const clause = whereCols.map((k) => `${quoteIdent(k)} = ?`).join(' AND ')
      return { clause, values }
    }

    try {
      await conn.beginTransaction()

      for (const row of deletes) {
        const { clause, values } = buildWhere(row)
        await conn.query(`DELETE FROM ${tableRef} WHERE ${clause}`, values)
      }

      for (const { original, changes } of updates) {
        const setCols = Object.keys(changes).filter((k) => !isMetaKey(k))
        if (setCols.length === 0) continue
        const setClause = setCols.map((col) => `${quoteIdent(col)} = ?`).join(', ')
        const { clause: whereClause, values: whereValues } = buildWhere(original)
        const values = [...setCols.map((col) => changes[col]), ...whereValues]
        await conn.query(`UPDATE ${tableRef} SET ${setClause} WHERE ${whereClause}`, values)
      }

      for (const row of inserts) {
        const cols = Object.keys(row).filter((k) => !isMetaKey(k))
        if (cols.length === 0) continue
        const colClause = cols.map((c) => quoteIdent(c)).join(', ')
        const valClause = cols.map(() => '?').join(', ')
        const values = cols.map((c) => row[c])
        await conn.query(`INSERT INTO ${tableRef} (${colClause}) VALUES (${valClause})`, values)
      }

      await conn.commit()
      return { success: true }
    } catch (err) {
      await conn.rollback().catch(() => {})
      throw err
    }
  }

  async getObjectDDL(
    schemaName: string,
    objectName: string,
    objectType: 'table' | 'view' | 'matview' | 'function'
  ): Promise<string> {
    const conn = this.getConn()
    const quotedRef = `\`${schemaName}\`.\`${objectName}\``

    if (objectType === 'view') {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(`SHOW CREATE VIEW ${quotedRef}`)
      return (rows[0]?.['Create View'] as string) ?? ''
    }

    return readMysqlTableDDL(conn, schemaName, objectName)
  }

  async getSessions(): Promise<SessionRow[]> {
    const conn = this.getConn()
    const [rows] = await conn.query(`
      SELECT ID, USER, DB, COMMAND, TIME, STATE, INFO AS query
      FROM information_schema.PROCESSLIST
      WHERE ID <> CONNECTION_ID()
      ORDER BY TIME DESC
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      id: Number(r['ID']),
      user: String(r['USER'] ?? ''),
      database: String(r['DB'] ?? ''),
      state: String(r['COMMAND'] ?? ''),
      waitEventType: null,
      waitEvent: r['STATE'] ? String(r['STATE']) : null,
      durationSec: r['TIME'] != null ? Number(r['TIME']) : null,
      query: r['query'] ? String(r['query']) : null,
    }))
  }

  async killSession(sessionId: number, mode: 'cancel' | 'terminate'): Promise<{ success: boolean }> {
    const conn = this.getConn()
    try {
      const sql = mode === 'cancel' ? `KILL QUERY ${sessionId}` : `KILL ${sessionId}`
      await conn.query(sql)
      return { success: true }
    } catch {
      return { success: false }
    }
  }

  async getLocks(): Promise<LockRow[]> {
    const conn = this.getConn()
    try {
      const [rows] = await conn.query(`
        SELECT
          r.trx_id AS waiting_id,
          r.trx_mysql_thread_id AS waiting_pid,
          b.trx_id AS blocking_id,
          b.trx_mysql_thread_id AS blocking_pid,
          r.trx_query AS waiting_query,
          b.trx_query AS blocking_query
        FROM information_schema.INNODB_TRX r
        JOIN information_schema.INNODB_TRX b
          ON b.trx_id = (
            SELECT blocking_trx_id FROM performance_schema.data_lock_waits
            WHERE requesting_engine_transaction_id = r.trx_id LIMIT 1
          )
        WHERE r.trx_state = 'LOCK WAIT'
      `)
      return (rows as Record<string, unknown>[]).map((r) => ({
        waitingId: Number(r['waiting_pid']),
        waitingUser: '',
        blockingId: Number(r['blocking_pid']),
        blockingUser: '',
        lockType: 'RECORD',
        tableName: null,
        waitingQuery: r['waiting_query'] ? String(r['waiting_query']) : null,
        blockingQuery: r['blocking_query'] ? String(r['blocking_query']) : null,
      }))
    } catch (err: unknown) {
      const mysqlErr = err as { code?: string }
      if (mysqlErr?.code === 'ER_TABLEACCESS_DENIED_ERROR') {
        return []
      }
      throw err
    }
  }

  async getTableStats(): Promise<TableStatRow[]> {
    const conn = this.getConn()
    const [rows] = await conn.query(`
      SELECT
        TABLE_SCHEMA AS \`schema\`,
        TABLE_NAME AS \`table\`,
        (DATA_LENGTH + INDEX_LENGTH) AS total_bytes,
        DATA_LENGTH AS table_bytes,
        INDEX_LENGTH AS index_bytes,
        TABLE_ROWS AS estimated_rows
      FROM information_schema.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_SCHEMA NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
      ORDER BY total_bytes DESC
    `)
    return (rows as Record<string, unknown>[]).map((r) => ({
      schema: String(r['schema'] ?? ''),
      table: String(r['table'] ?? ''),
      totalBytes: Number(r['total_bytes'] ?? 0),
      tableBytes: Number(r['table_bytes'] ?? 0),
      indexBytes: Number(r['index_bytes'] ?? 0),
      estimatedRows: Number(r['estimated_rows'] ?? 0),
    }))
  }

  async getCompletionSchema(schemaName?: string): Promise<Record<string, string[]>> {
    const conn = this.getConn()
    const database = schemaName ?? (this.config.database as string | undefined)
    if (!database) return {}

    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT t.TABLE_NAME, c.COLUMN_NAME
       FROM information_schema.TABLES t
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
       WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
       ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION`,
      [database]
    )

    const result: Record<string, string[]> = {}
    for (const row of rows) {
      const tbl = row.TABLE_NAME as string
      if (!result[tbl]) result[tbl] = []
      result[tbl].push(row.COLUMN_NAME as string)
    }
    return result
  }

  async getDbInfo(): Promise<DbInfo> {
    const conn = this.getConn()
    const [[versionRow], [connRow], [varRows], [dbRows], [statRows]] = await Promise.all([
      conn.query<mysql.RowDataPacket[]>(`SELECT VERSION() AS version`),
      conn.query<mysql.RowDataPacket[]>(`SELECT @@hostname AS host, @@port AS port, DATABASE() AS database, USER() AS user`),
      conn.query<mysql.RowDataPacket[]>(`
        SHOW VARIABLES WHERE Variable_name IN (
          'max_connections','innodb_buffer_pool_size','innodb_log_file_size',
          'thread_cache_size','query_cache_size','wait_timeout',
          'character_set_server','collation_server','time_zone','sql_mode'
        )
      `),
      conn.query<mysql.RowDataPacket[]>(`
        SELECT schema_name AS name,
               SUM(data_length + index_length) AS size_bytes,
               0 AS connections
        FROM information_schema.SCHEMATA
        LEFT JOIN information_schema.TABLES USING (table_schema)
        WHERE schema_name NOT IN ('information_schema','performance_schema','mysql','sys')
        GROUP BY schema_name
        ORDER BY size_bytes DESC
      `),
      conn.query<mysql.RowDataPacket[]>(`
        SHOW GLOBAL STATUS WHERE Variable_name IN ('Com_commit','Com_rollback','Innodb_buffer_pool_reads','Innodb_buffer_pool_read_requests')
      `),
    ])
    const statMap = Object.fromEntries((statRows as mysql.RowDataPacket[]).map((r) => [r.Variable_name as string, Number(r.Value)]))
    const reads = statMap['Innodb_buffer_pool_read_requests'] ?? 0
    const diskReads = statMap['Innodb_buffer_pool_reads'] ?? 0
    const cacheHitRatio = reads > 0 ? Math.round((1 - diskReads / reads) * 10000) / 100 : null
    return {
      version: String((versionRow as mysql.RowDataPacket).version ?? ''),
      host: String((connRow as mysql.RowDataPacket).host ?? this.config.host ?? ''),
      port: Number((connRow as mysql.RowDataPacket).port ?? this.config.port ?? 3306),
      database: String((connRow as mysql.RowDataPacket).database ?? ''),
      user: String((connRow as mysql.RowDataPacket).user ?? ''),
      settings: (varRows as mysql.RowDataPacket[]).map((r) => ({
        name: String(r.Variable_name),
        value: String(r.Value),
        unit: null,
      })),
      databases: (dbRows as mysql.RowDataPacket[]).map((r) => ({
        name: String(r.name ?? ''),
        sizeBytes: Number(r.size_bytes ?? 0),
        connections: 0,
      })),
      stats: {
        commits: statMap['Com_commit'] ?? 0,
        rollbacks: statMap['Com_rollback'] ?? 0,
        cacheHitRatio,
      },
    }
  }

  async getRoles(): Promise<string[]> {
    throw new Error('MySQL에서는 지원되지 않습니다.')
  }

  async createSchema(schemaName: string, _owner?: string): Promise<void> {
    const conn = this.getConn()
    const q = (s: string) => '`' + s.replace(/`/g, '``') + '`'
    await conn.query(`CREATE DATABASE ${q(schemaName)}`)
  }

  async getSchemaOwner(_schemaName: string): Promise<string> {
    throw new Error('MySQL에서는 지원되지 않습니다.')
  }

  async alterSchema(schemaName: string, newName?: string, _newOwner?: string): Promise<void> {
    if (newName && newName !== schemaName) {
      throw new Error('MySQL에서는 스키마 이름 변경이 지원되지 않습니다.')
    }
  }

  async dropSchema(schemaName: string, _cascade: boolean): Promise<void> {
    const conn = this.getConn()
    const q = (s: string) => '`' + s.replace(/`/g, '``') + '`'
    await conn.query(`DROP DATABASE ${q(schemaName)}`)
  }

  async createTable(params: CreateTableParams): Promise<void> {
    const conn = this.getConn()
    const ddl = buildMysqlDDL(params)
    await conn.query(ddl)
  }

  async alterTable(params: AlterTableParams): Promise<void> {
    const conn = this.getConn()
    const statements = buildAlterTableMysqlDDL(params)
    if (statements.length === 0) return
    await conn.beginTransaction()
    try {
      for (const sql of statements) {
        await conn.query(sql)
      }
      await conn.commit()
    } catch (err) {
      await conn.rollback().catch(() => {})
      throw err
    }
  }

  async createView(schemaName: string, viewName: string, selectQuery: string): Promise<void> {
    const conn = this.getConn()
    const q = (s: string) => '`' + s.replace(/`/g, '``') + '`'
    await conn.query(
      `CREATE OR REPLACE VIEW ${q(schemaName)}.${q(viewName)} AS\n${selectQuery}`
    )
  }

  async alterView(schemaName: string, viewName: string, newViewName?: string, newSelectQuery?: string): Promise<void> {
    const conn = this.getConn()
    const q = (s: string) => '`' + s.replace(/`/g, '``') + '`'
    if (newSelectQuery !== undefined) {
      await conn.query(
        `CREATE OR REPLACE VIEW ${q(schemaName)}.${q(viewName)} AS\n${newSelectQuery}`
      )
    }
    if (newViewName && newViewName !== viewName) {
      await conn.query(`RENAME TABLE ${q(schemaName)}.${q(viewName)} TO ${q(schemaName)}.${q(newViewName)}`)
    }
  }

  async dropView(schemaName: string, viewName: string, _cascade: boolean): Promise<void> {
    const conn = this.getConn()
    const q = (s: string) => '`' + s.replace(/`/g, '``') + '`'
    await conn.query(`DROP VIEW ${q(schemaName)}.${q(viewName)}`)
  }

  async createIndex(_params: CreateIndexParams): Promise<void> {
    throw new Error('MySQL 인덱스 생성은 아직 지원되지 않습니다.')
  }

  async dropIndex(_schemaName: string, _indexName: string): Promise<void> {
    throw new Error('MySQL 인덱스 삭제는 아직 지원되지 않습니다.')
  }
}

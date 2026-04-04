import { Client } from 'pg'
import type { IDriver, QueryResult } from './base'
import type {
  ConnectionConfig, BatchQueryResponse, BatchQueryResult,
  SchemaInfo, SchemaObjects, ColumnInfo, FKInfo, IndexInfo,
  TableInfo, ViewInfo, MatViewInfo,
  SelectAllParams, DataChangesParams, ExplainResult, ExplainNode,
  SessionRow, LockRow, TableStatRow
} from '../connection/types'

function buildConfig(conn: ConnectionConfig, password: string) {
  if (conn.inputMode === 'url' && conn.url) {
    const urlObj = new URL(conn.url.replace(/^jdbc:/i, ''))
    return {
      host: urlObj.hostname,
      port: Number(urlObj.port) || 5432,
      database: urlObj.pathname.slice(1) || undefined,
      user: conn.username ?? undefined,
      password: password || undefined,
      connectionTimeoutMillis: 5000,
    }
  }
  return {
    host: conn.host ?? undefined,
    port: conn.port ?? undefined,
    database: conn.databaseName ?? undefined,
    user: conn.username ?? undefined,
    password: password || undefined,
    connectionTimeoutMillis: 5000,
  }
}

function pgOidToCategory(oid: number): string {
  if ([16].includes(oid)) return 'boolean'
  if ([20, 21, 23, 26, 700, 701, 790, 1700].includes(oid)) return 'numeric'
  if ([1082, 1083, 1114, 1184, 1186].includes(oid)) return 'datetime'
  return 'string'
}

function formatDataType(row: Record<string, unknown>): string {
  const udt = row.udt_name as string
  const charLen = row.character_maximum_length as number | null
  const numPrec = row.numeric_precision as number | null
  const numScale = row.numeric_scale as number | null
  if (charLen) return `${udt}(${charLen})`
  if (numPrec && numScale && numScale > 0) return `numeric(${numPrec},${numScale})`
  return udt
}

function toPgArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[]
  if (typeof val === 'string' && val.startsWith('{'))
    return val.slice(1, -1).split(',').filter(Boolean)
  return []
}

function normalizePgPlan(plan: Record<string, unknown>): ExplainNode {
  const subPlans = (plan['Plans'] as Record<string, unknown>[] | undefined) ?? []
  return {
    nodeType: (plan['Node Type'] as string) ?? 'Unknown',
    cost: plan['Total Cost'] as number | undefined,
    actualTime: plan['Actual Total Time'] as number | undefined,
    rows: plan['Plan Rows'] as number | undefined,
    actualRows: plan['Actual Rows'] as number | undefined,
    loops: plan['Actual Loops'] as number | undefined,
    relation: plan['Relation Name'] as string | undefined,
    children: subPlans.map((p) => normalizePgPlan(p)),
    extra: plan,
  }
}

/**
 * PostgreSQL 드라이버. connect() 후 persistent Client를 유지한다.
 */
export class PostgresDriver implements IDriver {
  private client: Client
  private config: ReturnType<typeof buildConfig>
  private processId: number | undefined

  constructor(conn: ConnectionConfig, password: string) {
    this.config = buildConfig(conn, password)
    this.client = new Client(this.config)
  }

  async connect(): Promise<void> {
    await this.client.connect()
    this.processId = (this.client as unknown as { processID?: number }).processID ?? undefined
  }

  async testConnection(): Promise<void> {
    const tmp = new Client(this.config)
    try {
      await tmp.connect()
      await tmp.query('SELECT 1')
    } finally {
      await tmp.end().catch(() => {})
    }
  }

  async disconnect(): Promise<void> {
    await this.client.end()
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    try {
      const result = await this.client.query(sql)
      const columns = result.fields?.map((f) => f.name) ?? []
      const columnTypes: Record<string, string> = {}
      for (const f of result.fields ?? []) {
        columnTypes[f.name] = pgOidToCategory(f.dataTypeID)
      }
      return {
        ok: true,
        columns,
        rows: result.rows ?? [],
        affectedRows: result.rowCount ?? null,
        columnTypes,
      }
    } catch (err) {
      const e = err as Error & { position?: string }
      return {
        ok: false,
        message: e.message,
        position: e.position ? Number(e.position) : undefined,
      }
    }
  }

  async executeQueryBatch(sqls: string[], stopOnError: boolean, useTransaction = false): Promise<BatchQueryResponse> {
    const results: BatchQueryResult[] = []
    let transactionResult: 'committed' | 'rolledback' | undefined
    let errorOccurred = false

    try {
      if (useTransaction) await this.client.query('BEGIN')
      for (let i = 0; i < sqls.length; i++) {
        const sql = sqls[i]
        const start = Date.now()
        try {
          const result = await this.client.query(sql)
          const executionTime = Date.now() - start
          const columns = result.fields?.map((f) => f.name) ?? []
          const columnTypes: Record<string, string> = {}
          for (const f of result.fields ?? []) {
            columnTypes[f.name] = pgOidToCategory(f.dataTypeID)
          }
          results.push({ ok: true, columns, rows: result.rows ?? [], affectedRows: result.rowCount ?? null, executionTime, columnTypes })
        } catch (err) {
          const executionTime = Date.now() - start
          const e = err as Error & { position?: string }
          results.push({ ok: false, message: e.message, position: e.position ? Number(e.position) : undefined, executionTime })
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
          await this.client.query('ROLLBACK').catch(() => {})
          transactionResult = 'rolledback'
        } else {
          await this.client.query('COMMIT')
          transactionResult = 'committed'
        }
      }
    } catch (err) {
      if (useTransaction) {
        await this.client.query('ROLLBACK').catch(() => {})
        transactionResult = 'rolledback'
      }
      throw err
    }

    return { results, transactionResult }
  }

  async cancelQuery(): Promise<{ ok: boolean }> {
    if (this.processId === undefined) return { ok: false }
    const cancelClient = new Client(this.config)
    try {
      await cancelClient.connect()
      await cancelClient.query('SELECT pg_cancel_backend($1)', [this.processId])
      return { ok: true }
    } catch {
      return { ok: false }
    } finally {
      await cancelClient.end().catch(() => {})
    }
  }

  async explainQuery(sql: string): Promise<ExplainResult> {
    try {
      const result = await this.client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`)
      const raw = result.rows[0]['QUERY PLAN'] as Record<string, unknown>[]
      const root = raw[0]
      const plan = normalizePgPlan(root['Plan'] as Record<string, unknown>)
      const totalTime = root['Execution Time'] as number | undefined
      return { ok: true, plan, totalTime }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getSchemas(): Promise<SchemaInfo[]> {
    const result = await this.client.query(`
      SELECT n.nspname AS name,
             (n.nspowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS owned
      FROM pg_namespace n
      WHERE n.nspname NOT LIKE 'pg_toast%'
        AND n.nspname NOT LIKE 'pg_temp%'
      ORDER BY
        owned DESC,
        CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END,
        n.nspname
    `)
    return result.rows.map((r) => ({ name: r.name as string, owned: r.owned as boolean }))
  }

  async getSchemaObjects(schemaName: string): Promise<SchemaObjects> {
    const [tableNames, viewNames, matViewNames, functions] = await Promise.all([
      this.client.query(
        `SELECT tablename AS name FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
        [schemaName]
      ),
      this.client.query(
        `SELECT viewname AS name FROM pg_views WHERE schemaname = $1 ORDER BY viewname`,
        [schemaName]
      ),
      this.client.query(
        `SELECT matviewname AS name FROM pg_matviews WHERE schemaname = $1 ORDER BY matviewname`,
        [schemaName]
      ),
      this.client.query(
        `SELECT p.proname AS name
         FROM pg_proc p
         JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = $1 AND p.prokind IN ('f', 'p')
         ORDER BY p.proname`,
        [schemaName]
      )
    ])

    const allRelNames = [
      ...tableNames.rows.map((r) => r.name as string),
      ...viewNames.rows.map((r) => r.name as string),
      ...matViewNames.rows.map((r) => r.name as string)
    ]
    const tableRelNames = tableNames.rows.map((r) => r.name as string)

    const [columnsResult, pkResult, indexesResult, sequencesResult, fkResult] = await Promise.all([
      allRelNames.length > 0
        ? this.client.query(
            `SELECT c.table_name, c.column_name, c.data_type, c.udt_name,
                    c.character_maximum_length, c.numeric_precision, c.numeric_scale,
                    c.is_nullable, c.column_default
             FROM information_schema.columns c
             WHERE c.table_schema = $1 AND c.table_name = ANY($2)
             ORDER BY c.table_name, c.ordinal_position`,
            [schemaName, allRelNames]
          )
        : { rows: [] as Record<string, unknown>[] },
      allRelNames.length > 0
        ? this.client.query(
            `SELECT kcu.table_name, kcu.column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = $1
               AND tc.table_name = ANY($2)`,
            [schemaName, allRelNames]
          )
        : { rows: [] as Record<string, unknown>[] },
      this.client.query(
        `SELECT
           i.tablename,
           i.indexname,
           ix.indisunique AS is_unique,
           (
             SELECT array_agg(
               CASE WHEN k.attnum > 0 THEN a.attname ELSE '<expr>' END
               ORDER BY k.ord
             )
             FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
             LEFT JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
           ) AS columns
         FROM pg_indexes i
         JOIN pg_class c ON c.relname = i.indexname AND c.relkind = 'i'
         JOIN pg_namespace ns ON ns.nspname = i.schemaname AND ns.oid = c.relnamespace
         JOIN pg_index ix ON ix.indexrelid = c.oid
         WHERE i.schemaname = $1
         ORDER BY i.tablename, i.indexname`,
        [schemaName]
      ),
      this.client.query(
        `SELECT s.sequencename,
                d.refobjsubid,
                c.relname AS table_name
         FROM pg_sequences s
         JOIN pg_class seq_class ON seq_class.relname = s.sequencename
           AND seq_class.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
         LEFT JOIN pg_depend d ON d.objid = seq_class.oid AND d.deptype = 'a'
         LEFT JOIN pg_class c ON c.oid = d.refobjid
         WHERE s.schemaname = $1
         ORDER BY s.sequencename`,
        [schemaName]
      ),
      tableRelNames.length > 0
        ? this.client.query(
            `SELECT tc.table_name, tc.constraint_name,
                    rc.delete_rule, rc.update_rule,
                    kcu.column_name AS local_column,
                    ccu.table_schema AS ref_schema,
                    ccu.table_name AS ref_table,
                    ccu.column_name AS ref_column
             FROM information_schema.table_constraints tc
             JOIN information_schema.referential_constraints rc
               ON tc.constraint_name = rc.constraint_name
               AND tc.constraint_schema = rc.constraint_schema
             JOIN information_schema.key_column_usage kcu
               ON tc.constraint_name = kcu.constraint_name
               AND tc.constraint_schema = kcu.constraint_schema
             JOIN information_schema.constraint_column_usage ccu
               ON rc.unique_constraint_name = ccu.constraint_name
               AND rc.unique_constraint_schema = ccu.constraint_schema
             WHERE tc.constraint_type = 'FOREIGN KEY'
               AND tc.table_schema = $1
               AND tc.table_name = ANY($2)
             ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position`,
            [schemaName, tableRelNames]
          )
        : { rows: [] as Record<string, unknown>[] }
    ])

    const pkSet = new Set(pkResult.rows.map((r) => `${r.table_name}.${r.column_name}`))

    const fksByTable = new Map<string, FKInfo[]>()
    const fkMap = new Map<string, FKInfo>()
    for (const r of fkResult.rows) {
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

    const columnsByTable = new Map<string, ColumnInfo[]>()
    for (const r of columnsResult.rows) {
      const tableName = r.table_name as string
      if (!columnsByTable.has(tableName)) columnsByTable.set(tableName, [])
      columnsByTable.get(tableName)!.push({
        name: r.column_name as string,
        dataType: formatDataType(r),
        nullable: r.is_nullable === 'YES',
        isPrimaryKey: pkSet.has(`${tableName}.${r.column_name}`),
        defaultValue: r.column_default as string | null
      })
    }

    const indexesByTable = new Map<string, IndexInfo[]>()
    for (const r of indexesResult.rows) {
      const t = r.tablename as string
      if (!indexesByTable.has(t)) indexesByTable.set(t, [])
      indexesByTable.get(t)!.push({
        name: r.indexname as string,
        unique: r.is_unique as boolean,
        columns: toPgArray(r.columns)
      })
    }

    const seqByTable = new Map<string, string[]>()
    for (const r of sequencesResult.rows) {
      const t = (r.table_name as string) || '__unlinked__'
      if (!seqByTable.has(t)) seqByTable.set(t, [])
      seqByTable.get(t)!.push(r.sequencename as string)
    }

    const tables: TableInfo[] = tableNames.rows.map((r) => {
      const name = r.name as string
      return {
        name,
        columns: columnsByTable.get(name) ?? [],
        indexes: indexesByTable.get(name) ?? [],
        sequences: seqByTable.get(name) ?? [],
        foreignKeys: fksByTable.get(name) ?? []
      }
    })

    const views: ViewInfo[] = viewNames.rows.map((r) => {
      const name = r.name as string
      return { name, columns: columnsByTable.get(name) ?? [] }
    })

    const materialized_views: MatViewInfo[] = matViewNames.rows.map((r) => {
      const name = r.name as string
      return {
        name,
        columns: columnsByTable.get(name) ?? [],
        indexes: indexesByTable.get(name) ?? []
      }
    })

    return {
      tables,
      views,
      materialized_views,
      functions: functions.rows.map((r) => r.name as string)
    }
  }

  async getTableNames(schemaName: string): Promise<string[]> {
    const result = await this.client.query(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname = $1 ORDER BY tablename`,
      [schemaName]
    )
    return result.rows.map((r) => r.name as string)
  }

  async getColumnNames(schemaName: string, tableName: string): Promise<string[]> {
    const result = await this.client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schemaName, tableName]
    )
    return result.rows.map((r) => r.column_name as string)
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
    const quoteIdent = (s: string): string => '"' + s.replace(/"/g, '""') + '"'
    const tableRef = `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`

    const [colResult, pkResult] = await Promise.all([
      this.client.query(
        `SELECT column_name, column_default, udt_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schemaName, tableName]
      ),
      this.client.query(
        `SELECT a.attname
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
         WHERE c.contype = 'p'
           AND c.conrelid = (
             SELECT c.oid FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = $1 AND n.nspname = $2
           )
         ORDER BY a.attnum`,
        [tableName, schemaName]
      )
    ])

    const columnNames = colResult.rows.map((r) => r.column_name as string)
    const columnDefaults: Record<string, string | null> = {}
    const columnTypes: Record<string, string> = {}
    for (const r of colResult.rows) {
      columnDefaults[r.column_name as string] = r.column_default as string | null
      columnTypes[r.column_name as string] = r.udt_name as string
    }
    const primaryKeys = pkResult.rows.map((r) => r.attname as string)

    const searchPattern = params.search ? `%${params.search}%` : null
    const whereClause =
      searchPattern && columnNames.length > 0
        ? `WHERE (${columnNames.map((col) => `CAST(${quoteIdent(col)} AS TEXT) ILIKE $1`).join(' OR ')})`
        : ''
    const baseParams: unknown[] = searchPattern ? [searchPattern] : []

    const countResult = await this.client.query(
      `SELECT COUNT(*) AS count FROM ${tableRef} ${whereClause}`,
      baseParams
    )
    const totalCount = Number(countResult.rows[0].count)

    const orderClause =
      params.orderBy.length > 0
        ? `ORDER BY ${params.orderBy.map(({ col, dir }) => `${quoteIdent(col)} ${dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`
        : ''

    const dataParams = [...baseParams]
    let limitClause = ''
    if (params.limit > 0) {
      limitClause = `LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`
      dataParams.push(params.limit, params.offset)
    }

    const sql = [`SELECT * FROM ${tableRef}`, whereClause, orderClause, limitClause]
      .filter(Boolean)
      .join(' ')

    const dataResult = await this.client.query(sql, dataParams)

    return {
      columns: columnNames,
      primaryKeys,
      rows: dataResult.rows,
      totalCount,
      columnDefaults,
      columnTypes,
    }
  }

  async executeDataChanges(params: DataChangesParams): Promise<{ success: true }> {
    const quoteIdent = (s: string): string => '"' + s.replace(/"/g, '""') + '"'
    const isMetaKey = (k: string): boolean => k.startsWith('__')
    const { schemaName, tableName, primaryKeys, inserts, updates, deletes } = params
    const tableRef = `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`

    const buildWhere = (row: Record<string, unknown>, offset: number): { clause: string; values: unknown[] } => {
      const whereCols = primaryKeys.length > 0
        ? primaryKeys
        : Object.keys(row).filter((k) => !isMetaKey(k))
      const values = whereCols.map((k) => row[k])
      const clause = whereCols.map((k, i) => `${quoteIdent(k)} = $${offset + i + 1}`).join(' AND ')
      return { clause, values }
    }

    try {
      await this.client.query('BEGIN')

      for (const row of deletes) {
        const { clause, values } = buildWhere(row, 0)
        await this.client.query(`DELETE FROM ${tableRef} WHERE ${clause}`, values)
      }

      for (const { original, changes } of updates) {
        const setCols = Object.keys(changes).filter((k) => !isMetaKey(k))
        if (setCols.length === 0) continue
        const setClause = setCols.map((col, i) => `${quoteIdent(col)} = $${i + 1}`).join(', ')
        const { clause: whereClause, values: whereValues } = buildWhere(original, setCols.length)
        const values = [...setCols.map((col) => changes[col]), ...whereValues]
        await this.client.query(`UPDATE ${tableRef} SET ${setClause} WHERE ${whereClause}`, values)
      }

      for (const row of inserts) {
        const cols = Object.keys(row).filter((k) => !isMetaKey(k))
        if (cols.length === 0) continue
        const colClause = cols.map((c) => quoteIdent(c)).join(', ')
        const valClause = cols.map((_, i) => `$${i + 1}`).join(', ')
        const values = cols.map((c) => row[c])
        await this.client.query(`INSERT INTO ${tableRef} (${colClause}) VALUES (${valClause})`, values)
      }

      await this.client.query('COMMIT')
      return { success: true }
    } catch (err) {
      await this.client.query('ROLLBACK').catch(() => {})
      throw err
    }
  }

  async getObjectDDL(
    schemaName: string,
    objectName: string,
    objectType: 'table' | 'view' | 'matview' | 'function'
  ): Promise<string> {
    if (objectType === 'view') {
      const result = await this.client.query(
        `SELECT pg_get_viewdef(c.oid, true) AS def
         FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE n.nspname = $1 AND c.relname = $2`,
        [schemaName, objectName]
      )
      const def = (result.rows[0]?.def as string ?? '').trim()
      return `CREATE OR REPLACE VIEW "${schemaName}"."${objectName}" AS\n${def}`
    }

    if (objectType === 'matview') {
      const result = await this.client.query(
        `SELECT definition FROM pg_matviews WHERE schemaname = $1 AND matviewname = $2`,
        [schemaName, objectName]
      )
      const def = (result.rows[0]?.definition as string ?? '').trim()
      return `CREATE MATERIALIZED VIEW "${schemaName}"."${objectName}" AS\n${def}`
    }

    if (objectType === 'function') {
      const result = await this.client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
         WHERE n.nspname = $1 AND p.proname = $2
         LIMIT 1`,
        [schemaName, objectName]
      )
      return (result.rows[0]?.def as string ?? '').trim()
    }

    const result = await this.client.query(
      `SELECT
         'CREATE TABLE ' || quote_ident($1) || '.' || quote_ident($2) || E' (\n' ||
         string_agg(
           '  ' || quote_ident(column_name) ||
           ' ' || udt_name ||
           CASE WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')' ELSE '' END ||
           CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
           CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
           E',\n' ORDER BY ordinal_position
         ) || E'\n)' AS ddl
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       GROUP BY table_schema, table_name`,
      [schemaName, objectName]
    )
    return (result.rows[0]?.ddl as string ?? '').trim()
  }

  async getSessions(): Promise<SessionRow[]> {
    const res = await this.client.query(`
      SELECT pid, usename, datname, state, wait_event_type, wait_event,
             EXTRACT(EPOCH FROM (now() - query_start))::int AS duration_sec,
             query
      FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
      ORDER BY query_start ASC NULLS LAST
    `)
    return res.rows.map((r) => ({
      id: r.pid,
      user: r.usename ?? '',
      database: r.datname ?? '',
      state: r.state ?? '',
      waitEventType: r.wait_event_type ?? null,
      waitEvent: r.wait_event ?? null,
      durationSec: r.duration_sec != null ? Number(r.duration_sec) : null,
      query: r.query ?? null,
    }))
  }

  async killSession(sessionId: number, mode: 'cancel' | 'terminate'): Promise<{ success: boolean }> {
    try {
      const fn = mode === 'cancel' ? 'pg_cancel_backend' : 'pg_terminate_backend'
      await this.client.query(`SELECT ${fn}($1)`, [sessionId])
      return { success: true }
    } catch {
      return { success: false }
    }
  }

  async getLocks(): Promise<LockRow[]> {
    const res = await this.client.query(`
      SELECT
        blocked_locks.pid AS waiting_pid,
        blocked_activity.usename AS waiting_user,
        blocking_locks.pid AS blocking_pid,
        blocking_activity.usename AS blocking_user,
        blocked_locks.locktype,
        blocked_activity.query AS waiting_query,
        blocking_activity.query AS blocking_query,
        CASE WHEN blocked_locks.relation IS NOT NULL THEN blocked_locks.relation::regclass::text ELSE NULL END AS table_name
      FROM pg_catalog.pg_locks blocked_locks
      JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
      JOIN pg_catalog.pg_locks blocking_locks
        ON blocking_locks.locktype = blocked_locks.locktype
        AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
        AND blocking_locks.granted
        AND blocking_locks.pid != blocked_locks.pid
      JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
      WHERE NOT blocked_locks.granted
    `)
    return res.rows.map((r) => ({
      waitingId: r.waiting_pid,
      waitingUser: r.waiting_user ?? '',
      blockingId: r.blocking_pid,
      blockingUser: r.blocking_user ?? '',
      lockType: r.locktype ?? '',
      tableName: r.table_name ?? null,
      waitingQuery: r.waiting_query ?? null,
      blockingQuery: r.blocking_query ?? null,
    }))
  }

  async getTableStats(): Promise<TableStatRow[]> {
    const res = await this.client.query(`
      SELECT
        n.nspname AS schema,
        c.relname AS table,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_relation_size(c.oid) AS table_bytes,
        pg_indexes_size(c.oid) AS index_bytes,
        c.reltuples::bigint AS estimated_rows,
        s.n_dead_tup AS dead_tuples,
        s.last_vacuum,
        s.last_autovacuum
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY total_bytes DESC
    `)
    return res.rows.map((r) => ({
      schema: r.schema,
      table: r.table,
      totalBytes: Number(r.total_bytes),
      tableBytes: Number(r.table_bytes),
      indexBytes: Number(r.index_bytes),
      estimatedRows: Number(r.estimated_rows),
      deadTuples: r.dead_tuples != null ? Number(r.dead_tuples) : undefined,
      lastVacuum: r.last_vacuum ? String(r.last_vacuum) : null,
      lastAutovacuum: r.last_autovacuum ? String(r.last_autovacuum) : null,
    }))
  }

  async getCompletionSchema(schemaName?: string): Promise<Record<string, string[]>> {
    const tablesResult = schemaName
      ? await this.client.query(
          `SELECT t.table_schema, t.table_name, c.column_name
           FROM information_schema.tables t
           JOIN information_schema.columns c
             ON c.table_schema = t.table_schema AND c.table_name = t.table_name
           WHERE t.table_schema = $1 AND t.table_type IN ('BASE TABLE', 'VIEW')
           ORDER BY t.table_name, c.ordinal_position`,
          [schemaName]
        )
      : await this.client.query(
          `SELECT t.table_schema, t.table_name, c.column_name
           FROM information_schema.tables t
           JOIN information_schema.columns c
             ON c.table_schema = t.table_schema AND c.table_name = t.table_name
           WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
             AND t.table_type IN ('BASE TABLE', 'VIEW')
           ORDER BY t.table_schema, t.table_name, c.ordinal_position`
        )

    const result: Record<string, string[]> = {}
    for (const row of tablesResult.rows) {
      const schema = row.table_schema as string
      const tbl = row.table_name as string
      const qualified = `${schema}.${tbl}`
      if (!result[tbl]) result[tbl] = []
      result[tbl].push(row.column_name as string)
      if (!result[qualified]) result[qualified] = []
      result[qualified].push(row.column_name as string)
    }
    return result
  }
}

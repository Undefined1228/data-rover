import type {
  QueryResult, BatchQueryResponse, SchemaInfo, SchemaObjects, TableInfo,
  SelectAllParams, DataChangesParams, ExplainResult,
  SessionRow, LockRow, TableStatRow, DbInfo
} from '../connection/types'
import type { CreateTableParams, AlterTableParams, CreateIndexParams } from './ddlBuilder'

export type { QueryResult }

export interface IDriver {
  connect(): Promise<void>
  testConnection(): Promise<void>
  disconnect(): Promise<void>

  getSchemas(): Promise<SchemaInfo[]>
  getSchemaObjects(schemaName: string): Promise<SchemaObjects>
  getTableNames(schemaName: string): Promise<string[]>
  getColumnNames(schemaName: string, tableName: string): Promise<string[]>

  executeQuery(sql: string): Promise<QueryResult>
  executeQueryBatch(sqls: string[], stopOnError: boolean, useTransaction?: boolean): Promise<BatchQueryResponse>
  cancelQuery(): Promise<{ ok: boolean }>

  explainQuery(sql: string): Promise<ExplainResult>

  selectAll(
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
  }>
  executeDataChanges(params: DataChangesParams): Promise<{ success: true }>

  getObjectDDL(
    schemaName: string,
    objectName: string,
    objectType: 'table' | 'view' | 'matview' | 'function'
  ): Promise<string>

  getSessions(): Promise<SessionRow[]>
  killSession(sessionId: number, mode: 'cancel' | 'terminate'): Promise<{ success: boolean }>
  getLocks(): Promise<LockRow[]>
  getTableStats(): Promise<TableStatRow[]>
  getDbInfo(): Promise<DbInfo>

  getErdData(schemaName: string): Promise<TableInfo[]>

  getCompletionSchema(schemaName?: string): Promise<Record<string, string[]>>

  getRoles(): Promise<string[]>
  createSchema(schemaName: string, owner?: string): Promise<void>
  getSchemaOwner(schemaName: string): Promise<string>
  alterSchema(schemaName: string, newName?: string, newOwner?: string): Promise<void>
  dropSchema(schemaName: string, cascade: boolean): Promise<void>

  createTable(params: CreateTableParams): Promise<void>
  alterTable(params: AlterTableParams): Promise<void>

  createView(schemaName: string, viewName: string, selectQuery: string): Promise<void>
  alterView(schemaName: string, viewName: string, newViewName?: string, newSelectQuery?: string): Promise<void>
  dropView(schemaName: string, viewName: string, cascade: boolean): Promise<void>

  createIndex(params: CreateIndexParams): Promise<void>
  dropIndex(schemaName: string, indexName: string): Promise<void>
}

import type {
  QueryResult, BatchQueryResponse, SchemaInfo, SchemaObjects,
  SelectAllParams, DataChangesParams, ExplainResult,
  SessionRow, LockRow, TableStatRow
} from '../connection/types'

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

  getCompletionSchema(schemaName?: string): Promise<Record<string, string[]>>
}

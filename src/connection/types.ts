// ── 연결 설정 ──────────────────────────────────────────────────────────────

export type DbType = 'postgresql' | 'mysql' | 'mariadb'
export type InputMode = 'hostPort' | 'url'
export type SshAuthMethod = 'password' | 'key'

export interface ConnectionConfig {
  id: string
  name: string
  dbType: DbType
  inputMode: InputMode
  host: string | null
  port: number | null
  databaseName: string | null
  username: string | null
  url: string | null
  color: string | null
  sshEnabled: boolean
  sshHost: string | null
  sshPort: number | null
  sshUsername: string | null
  sshAuthMethod: SshAuthMethod
  sshKeyPath: string | null
  createdAt: string
  updatedAt: string
}

export interface ConnectionFormData {
  name: string
  dbType: DbType
  inputMode: InputMode
  host: string
  port: string
  databaseName: string
  username: string
  password: string
  url: string
  color: string
  sshEnabled: boolean
  sshHost: string
  sshPort: string
  sshUsername: string
  sshAuthMethod: SshAuthMethod
  sshPassword: string
  sshKeyPath: string
  sshPassphrase: string
}

// ── 쿼리 결과 ─────────────────────────────────────────────────────────────

export type QueryResult =
  | {
      ok: true
      columns: string[]
      rows: Record<string, unknown>[]
      affectedRows: number | null
      columnTypes: Record<string, string>
    }
  | { ok: false; message: string; position?: number }

export type BatchQueryResult =
  | {
      ok: true
      columns: string[]
      rows: Record<string, unknown>[]
      affectedRows: number | null
      executionTime: number
      columnTypes: Record<string, string>
    }
  | { ok: false; message: string; position?: number; executionTime: number; skipped?: true }

export interface BatchQueryResponse {
  results: BatchQueryResult[]
  transactionResult?: 'committed' | 'rolledback'
}

// ── 스키마 ────────────────────────────────────────────────────────────────

export interface SchemaInfo {
  name: string
  owned: boolean
}

// ── 테이블 / 컬럼 ─────────────────────────────────────────────────────────

export interface ColumnInfo {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
}

export interface FKInfo {
  constraintName: string
  localColumns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
  onDelete: string
  onUpdate: string
}

export interface IndexInfo {
  name: string
  unique: boolean
  columns: string[]
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  sequences: string[]
  foreignKeys: FKInfo[]
}

export interface ViewInfo {
  name: string
  columns: ColumnInfo[]
}

export interface MatViewInfo {
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
}

export interface SchemaObjects {
  tables: TableInfo[]
  views: ViewInfo[]
  materialized_views: MatViewInfo[]
  functions: string[]
}

// ── 데이터 뷰어 ───────────────────────────────────────────────────────────

export interface SelectAllParams {
  limit: number
  offset: number
  orderBy: { col: string; dir: 'asc' | 'desc' }[]
  search: string
}

export interface DataChangeRow {
  original: Record<string, unknown>
  changes: Record<string, unknown>
}

export interface DataChangesParams {
  schemaName: string
  tableName: string
  primaryKeys: string[]
  inserts: Record<string, unknown>[]
  updates: DataChangeRow[]
  deletes: Record<string, unknown>[]
}

// ── Explain ───────────────────────────────────────────────────────────────

export interface ExplainNode {
  nodeType: string
  cost?: number
  actualTime?: number
  rows?: number
  actualRows?: number
  loops?: number
  relation?: string
  children: ExplainNode[]
  extra: Record<string, unknown>
}

export type ExplainResult =
  | { ok: true; plan: ExplainNode; totalTime?: number }
  | { ok: false; message: string }

// ── 세션 모니터 ───────────────────────────────────────────────────────────

export interface SessionRow {
  id: number
  user: string
  database: string
  state: string
  waitEventType: string | null
  waitEvent: string | null
  durationSec: number | null
  query: string | null
}

export interface LockRow {
  waitingId: number
  waitingUser: string
  blockingId: number
  blockingUser: string
  lockType: string
  tableName: string | null
  waitingQuery: string | null
  blockingQuery: string | null
}

export interface TableStatRow {
  schema: string
  table: string
  totalBytes: number
  tableBytes: number
  indexBytes: number
  estimatedRows: number
  deadTuples?: number
  lastVacuum?: string | null
  lastAutovacuum?: string | null
}

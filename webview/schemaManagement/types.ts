export interface ColumnDef {
  id: string
  name: string
  type: string
  size: string
  nullable: boolean
  primaryKey: boolean
  defaultValue: string
  originalName?: string | null
  originalType?: string | null
  originalNullable?: boolean | null
  originalDefaultValue?: string | null
}

export interface ColumnInfo {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue: string | null
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
}

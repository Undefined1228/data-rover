export interface CreateTableColumnDef {
  name: string
  type: string
  size: string
  nullable: boolean
  primaryKey: boolean
  defaultValue: string
}

export interface AlterColumnDef {
  name: string
  originalName: string | null
  type: string
  size: string
  nullable: boolean
  primaryKey: boolean
  defaultValue: string
  originalType: string | null
  originalNullable: boolean | null
  originalDefaultValue: string | null
}

export interface AlterFKDef {
  originalConstraintName: string | null
  constraintName: string
  localColumns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
  onDelete: string
  onUpdate: string
}

export interface AlterTableParams {
  schemaName: string
  tableName: string
  originalTableName: string
  columns: AlterColumnDef[]
  droppedColumns: string[]
  originalPkColumns: string[]
  foreignKeys: AlterFKDef[]
  droppedFkNames: string[]
}

export interface CreateTableFKDef {
  constraintName: string
  localColumns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
  onDelete: string
  onUpdate: string
}

export interface CreateTableParams {
  schemaName: string
  tableName: string
  columns: CreateTableColumnDef[]
  foreignKeys: CreateTableFKDef[]
}

export interface CreateIndexParams {
  schemaName: string
  tableName: string
  indexName: string
  columns: { name: string; order: 'ASC' | 'DESC' }[]
  unique: boolean
  method: string
}

function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"'
}

function quoteBacktick(s: string): string {
  return '`' + s.replace(/`/g, '``') + '`'
}

function buildColumnType(col: { type: string; size: string }): string {
  if ((col.type === 'varchar' || col.type === 'char') && col.size) {
    return `${col.type}(${col.size})`
  }
  if (col.type === 'numeric' && col.size) {
    return `numeric(${col.size})`
  }
  return col.type
}

export function buildPostgresDDL(params: CreateTableParams): string {
  const { schemaName, tableName, columns, foreignKeys } = params
  const parts: string[] = []

  for (const col of columns) {
    let def = `  ${quoteIdent(col.name)} ${buildColumnType(col)}`
    if (!col.nullable) def += ' NOT NULL'
    if (col.defaultValue.trim()) def += ` DEFAULT ${col.defaultValue.trim()}`
    parts.push(def)
  }

  const pkCols = columns.filter((c) => c.primaryKey)
  if (pkCols.length > 0) {
    const pkName = quoteIdent(`pk_${tableName}`)
    const pkColList = pkCols.map((c) => quoteIdent(c.name)).join(', ')
    parts.push(`  CONSTRAINT ${pkName} PRIMARY KEY (${pkColList})`)
  }

  for (const fk of foreignKeys) {
    if (!fk.localColumns.length || !fk.refTable.trim() || !fk.refColumns.length) continue
    const name = fk.constraintName.trim() || `fk_${tableName}_${fk.localColumns.join('_')}`
    const localCols = fk.localColumns.map(quoteIdent).join(', ')
    const refCols = fk.refColumns.map(quoteIdent).join(', ')
    const refTable = `${quoteIdent(fk.refSchema)}.${quoteIdent(fk.refTable.trim())}`
    let fkDef = `  CONSTRAINT ${quoteIdent(name)} FOREIGN KEY (${localCols}) REFERENCES ${refTable} (${refCols})`
    if (fk.onDelete !== 'NO ACTION') fkDef += ` ON DELETE ${fk.onDelete}`
    if (fk.onUpdate !== 'NO ACTION') fkDef += ` ON UPDATE ${fk.onUpdate}`
    parts.push(fkDef)
  }

  return `CREATE TABLE ${quoteIdent(schemaName)}.${quoteIdent(tableName)} (\n${parts.join(',\n')}\n);`
}

function buildMysqlColumnType(col: { type: string; size: string }): string {
  const t = col.type.toLowerCase()
  if ((t === 'varchar' || t === 'char') && col.size) return `${col.type}(${col.size})`
  if ((t === 'decimal' || t === 'numeric') && col.size) return `${col.type}(${col.size})`
  return col.type
}

function buildMysqlColDef(col: { name: string; type: string; size: string; nullable: boolean; defaultValue: string }): string {
  const q = quoteBacktick
  const rawType = buildMysqlColumnType(col)
  if (/auto_increment/i.test(rawType)) {
    const baseType = rawType.replace(/\s*auto_increment\s*/i, '').trim()
    return `${q(col.name)} ${baseType} NOT NULL AUTO_INCREMENT`
  }
  let def = `${q(col.name)} ${rawType}`
  if (!col.nullable) def += ' NOT NULL'
  if (col.defaultValue.trim()) def += ` DEFAULT ${col.defaultValue.trim()}`
  return def
}

export function buildMysqlDDL(params: CreateTableParams): string {
  const { schemaName, tableName, columns, foreignKeys } = params
  const q = quoteBacktick
  const parts: string[] = []

  for (const col of columns) {
    parts.push(`  ${buildMysqlColDef(col)}`)
  }

  const pkCols = columns.filter((c) => c.primaryKey)
  if (pkCols.length > 0) {
    parts.push(`  PRIMARY KEY (${pkCols.map((c) => q(c.name)).join(', ')})`)
  }

  for (const fk of foreignKeys) {
    if (!fk.localColumns.length || !fk.refTable.trim() || !fk.refColumns.length) continue
    const name = fk.constraintName.trim() || `fk_${tableName}_${fk.localColumns.join('_')}`
    const localCols = fk.localColumns.map(q).join(', ')
    const refCols = fk.refColumns.map(q).join(', ')
    const refTable = `${q(fk.refSchema)}.${q(fk.refTable.trim())}`
    let fkDef = `  CONSTRAINT ${q(name)} FOREIGN KEY (${localCols}) REFERENCES ${refTable} (${refCols})`
    if (fk.onDelete !== 'NO ACTION') fkDef += ` ON DELETE ${fk.onDelete}`
    if (fk.onUpdate !== 'NO ACTION') fkDef += ` ON UPDATE ${fk.onUpdate}`
    parts.push(fkDef)
  }

  const engine = foreignKeys.some((fk) => fk.localColumns.length && fk.refTable.trim()) ? ' ENGINE=InnoDB' : ''
  return `CREATE TABLE ${q(schemaName)}.${q(tableName)} (\n${parts.join(',\n')}\n)${engine};`
}

export function buildAlterTableMysqlDDL(params: AlterTableParams): string[] {
  const { schemaName, tableName, originalTableName, columns, droppedColumns, originalPkColumns, foreignKeys, droppedFkNames } = params
  const statements: string[] = []
  const q = quoteBacktick
  const tbl = `${q(schemaName)}.${q(originalTableName)}`

  for (const colName of droppedColumns) {
    statements.push(`ALTER TABLE ${tbl} DROP COLUMN ${q(colName)};`)
  }

  for (const col of columns) {
    if (col.originalName === null) {
      statements.push(`ALTER TABLE ${tbl} ADD COLUMN ${buildMysqlColDef(col)};`)
    }
  }

  for (const col of columns) {
    if (col.originalName !== null && col.originalName !== col.name) {
      statements.push(`ALTER TABLE ${tbl} RENAME COLUMN ${q(col.originalName)} TO ${q(col.name)};`)
    }
  }

  for (const col of columns) {
    if (col.originalName === null) continue
    const currentType = buildMysqlColumnType(col)
    const typeChanged = currentType !== col.originalType
    const nullableChanged = col.originalNullable !== null && col.nullable !== col.originalNullable
    const defaultChanged = col.defaultValue.trim() !== (col.originalDefaultValue ?? '').trim()
    if (typeChanged || nullableChanged || defaultChanged) {
      statements.push(`ALTER TABLE ${tbl} MODIFY COLUMN ${buildMysqlColDef(col)};`)
    }
  }

  const currentPkCols = columns.filter((c) => c.primaryKey).map((c) => c.name)
  const sortedCurrent = [...currentPkCols].sort().join(',')
  const sortedOriginal = [...originalPkColumns].sort().join(',')

  if (sortedCurrent !== sortedOriginal) {
    if (originalPkColumns.length > 0) {
      statements.push(`ALTER TABLE ${tbl} DROP PRIMARY KEY;`)
    }
    if (currentPkCols.length > 0) {
      statements.push(`ALTER TABLE ${tbl} ADD PRIMARY KEY (${currentPkCols.map(q).join(', ')});`)
    }
  }

  for (const fkName of droppedFkNames) {
    statements.push(`ALTER TABLE ${tbl} DROP FOREIGN KEY ${q(fkName)};`)
  }

  for (const fk of foreignKeys) {
    if (fk.originalConstraintName !== null) {
      statements.push(`ALTER TABLE ${tbl} DROP FOREIGN KEY ${q(fk.originalConstraintName)};`)
    }
    if (!fk.localColumns.length || !fk.refTable.trim() || !fk.refColumns.length) continue
    const name = fk.constraintName.trim() || `fk_${originalTableName}_${fk.localColumns.join('_')}`
    const localCols = fk.localColumns.map(q).join(', ')
    const refCols = fk.refColumns.map(q).join(', ')
    const refTable = `${q(fk.refSchema)}.${q(fk.refTable.trim())}`
    let fkDef = `CONSTRAINT ${q(name)} FOREIGN KEY (${localCols}) REFERENCES ${refTable} (${refCols})`
    if (fk.onDelete !== 'NO ACTION') fkDef += ` ON DELETE ${fk.onDelete}`
    if (fk.onUpdate !== 'NO ACTION') fkDef += ` ON UPDATE ${fk.onUpdate}`
    statements.push(`ALTER TABLE ${tbl} ADD ${fkDef};`)
  }

  if (tableName !== originalTableName) {
    statements.push(`ALTER TABLE ${tbl} RENAME TO ${q(tableName)};`)
  }

  return statements
}

export function buildAlterTableDDL(params: AlterTableParams): string[] {
  const { schemaName, tableName, originalTableName, columns, droppedColumns, originalPkColumns, foreignKeys, droppedFkNames } = params
  const statements: string[] = []

  const tbl = `${quoteIdent(schemaName)}.${quoteIdent(originalTableName)}`

  for (const colName of droppedColumns) {
    statements.push(`ALTER TABLE ${tbl} DROP COLUMN ${quoteIdent(colName)};`)
  }

  for (const col of columns) {
    if (col.originalName === null) {
      let def = `${quoteIdent(col.name)} ${buildColumnType(col)}`
      if (!col.nullable) def += ' NOT NULL'
      if (col.defaultValue.trim()) def += ` DEFAULT ${col.defaultValue.trim()}`
      statements.push(`ALTER TABLE ${tbl} ADD COLUMN ${def};`)
    }
  }

  for (const col of columns) {
    if (col.originalName !== null && col.originalName !== col.name) {
      statements.push(
        `ALTER TABLE ${tbl} RENAME COLUMN ${quoteIdent(col.originalName)} TO ${quoteIdent(col.name)};`
      )
    }
  }

  for (const col of columns) {
    if (col.originalName === null) continue

    const currentType = buildColumnType(col)
    if (currentType !== col.originalType) {
      statements.push(
        `ALTER TABLE ${tbl} ALTER COLUMN ${quoteIdent(col.name)} TYPE ${currentType} USING ${quoteIdent(col.name)}::${currentType};`
      )
    }

    if (col.originalNullable !== null && col.nullable !== col.originalNullable) {
      if (col.nullable) {
        statements.push(`ALTER TABLE ${tbl} ALTER COLUMN ${quoteIdent(col.name)} DROP NOT NULL;`)
      } else {
        statements.push(`ALTER TABLE ${tbl} ALTER COLUMN ${quoteIdent(col.name)} SET NOT NULL;`)
      }
    }

    const currentDefault = col.defaultValue.trim()
    const originalDefault = (col.originalDefaultValue ?? '').trim()
    if (currentDefault !== originalDefault) {
      if (currentDefault) {
        statements.push(
          `ALTER TABLE ${tbl} ALTER COLUMN ${quoteIdent(col.name)} SET DEFAULT ${currentDefault};`
        )
      } else {
        statements.push(`ALTER TABLE ${tbl} ALTER COLUMN ${quoteIdent(col.name)} DROP DEFAULT;`)
      }
    }
  }

  const currentPkCols = columns.filter((c) => c.primaryKey).map((c) => c.name)
  const sortedCurrent = [...currentPkCols].sort().join(',')
  const sortedOriginal = [...originalPkColumns].sort().join(',')

  if (sortedCurrent !== sortedOriginal) {
    if (originalPkColumns.length > 0) {
      statements.push(
        `ALTER TABLE ${tbl} DROP CONSTRAINT ${quoteIdent(`pk_${originalTableName}`)};`
      )
    }
    if (currentPkCols.length > 0) {
      const pkColList = currentPkCols.map(quoteIdent).join(', ')
      statements.push(
        `ALTER TABLE ${tbl} ADD CONSTRAINT ${quoteIdent(`pk_${tableName}`)} PRIMARY KEY (${pkColList});`
      )
    }
  }

  for (const fkName of droppedFkNames) {
    statements.push(`ALTER TABLE ${tbl} DROP CONSTRAINT ${quoteIdent(fkName)};`)
  }

  for (const fk of foreignKeys) {
    if (fk.originalConstraintName !== null) {
      statements.push(
        `ALTER TABLE ${tbl} DROP CONSTRAINT ${quoteIdent(fk.originalConstraintName)};`
      )
    }

    if (!fk.localColumns.length || !fk.refTable.trim() || !fk.refColumns.length) continue

    const name = fk.constraintName.trim() || `fk_${originalTableName}_${fk.localColumns.join('_')}`
    const localCols = fk.localColumns.map(quoteIdent).join(', ')
    const refCols = fk.refColumns.map(quoteIdent).join(', ')
    const refTable = `${quoteIdent(fk.refSchema)}.${quoteIdent(fk.refTable.trim())}`
    let fkDef = `CONSTRAINT ${quoteIdent(name)} FOREIGN KEY (${localCols}) REFERENCES ${refTable} (${refCols})`
    if (fk.onDelete !== 'NO ACTION') fkDef += ` ON DELETE ${fk.onDelete}`
    if (fk.onUpdate !== 'NO ACTION') fkDef += ` ON UPDATE ${fk.onUpdate}`
    statements.push(`ALTER TABLE ${tbl} ADD ${fkDef};`)
  }

  if (tableName !== originalTableName) {
    statements.push(
      `ALTER TABLE ${tbl} RENAME TO ${quoteIdent(tableName)};`
    )
  }

  return statements
}

import { Client } from 'pg'

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

export async function readTableDDL(
  client: Client,
  schemaName: string,
  objectName: string
): Promise<string> {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const tableRef = `${q(schemaName)}.${q(objectName)}`

  const fkRuleLabel: Record<string, string> = {
    a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT',
  }

  const colsResult = await client.query(
    `SELECT column_name, udt_name, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schemaName, objectName]
  )
  const pkUniqueResult = await client.query(
    `SELECT c.conname AS constraint_name, c.contype AS constraint_type,
            a.attname AS column_name, la.ord AS col_pos
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS la(attnum, ord) ON true
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = la.attnum
     WHERE c.contype IN ('p', 'u') AND n.nspname = $1 AND t.relname = $2
     ORDER BY c.contype, c.conname, la.ord`,
    [schemaName, objectName]
  )
  const fkResult = await client.query(
    `SELECT c.conname AS constraint_name,
            a.attname AS local_column, la.ord AS local_pos,
            n2.nspname AS ref_schema, c2.relname AS ref_table,
            a2.attname AS ref_column,
            c.confdeltype AS delete_rule, c.confupdtype AS update_rule
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_class c2 ON c2.oid = c.confrelid
     JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
     JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS la(attnum, ord) ON true
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = la.attnum
     JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS ra(attnum, ord) ON la.ord = ra.ord
     JOIN pg_attribute a2 ON a2.attrelid = c.confrelid AND a2.attnum = ra.attnum
     WHERE c.contype = 'f' AND n.nspname = $1 AND t.relname = $2
     ORDER BY c.conname, la.ord`,
    [schemaName, objectName]
  )
  const indexResult = await client.query(
    `SELECT i.indexname, ix.indisunique,
            (SELECT array_agg(
               CASE WHEN k.attnum > 0 THEN a.attname ELSE '<expr>' END
               ORDER BY k.ord
             )
             FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
             LEFT JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
            ) AS columns
     FROM pg_indexes i
     JOIN pg_class c ON c.relname = i.indexname AND c.relkind = 'i'
     JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = i.schemaname
     JOIN pg_index ix ON ix.indexrelid = c.oid
     WHERE i.schemaname = $1 AND i.tablename = $2
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.table_constraints tc
         WHERE tc.table_schema = $1 AND tc.table_name = $2
           AND tc.constraint_name = i.indexname
       )
     ORDER BY i.indexname`,
    [schemaName, objectName]
  )

  const colDefs = colsResult.rows.map((r) => {
    let def = `    ${q(r.column_name as string)} ${formatDataType(r)}`
    if (r.is_nullable === 'NO') def += ' NOT NULL'
    if (r.column_default !== null) def += ` DEFAULT ${r.column_default as string}`
    return def
  })

  const pkUniqueMap = new Map<string, { type: string; columns: string[] }>()
  for (const r of pkUniqueResult.rows) {
    const name = r.constraint_name as string
    if (!pkUniqueMap.has(name)) pkUniqueMap.set(name, { type: r.constraint_type as string, columns: [] })
    pkUniqueMap.get(name)!.columns.push(r.column_name as string)
  }
  const pkUniqueDefs = Array.from(pkUniqueMap.entries()).map(([name, { type, columns }]) => {
    const keyword = type === 'p' ? 'PRIMARY KEY' : 'UNIQUE'
    return `    CONSTRAINT ${q(name)}\n        ${keyword} (${columns.map(q).join(', ')})`
  })

  const fkMap = new Map<string, { localCols: string[]; refSchema: string; refTable: string; refCols: string[]; onDelete: string; onUpdate: string }>()
  for (const r of fkResult.rows) {
    const name = r.constraint_name as string
    if (!fkMap.has(name)) {
      fkMap.set(name, {
        localCols: [], refSchema: r.ref_schema as string, refTable: r.ref_table as string, refCols: [],
        onDelete: fkRuleLabel[r.delete_rule as string] ?? 'NO ACTION',
        onUpdate: fkRuleLabel[r.update_rule as string] ?? 'NO ACTION',
      })
    }
    fkMap.get(name)!.localCols.push(r.local_column as string)
    fkMap.get(name)!.refCols.push(r.ref_column as string)
  }
  const fkDefs = Array.from(fkMap.entries()).map(([name, fk]) => {
    let def = `    CONSTRAINT ${q(name)}\n        FOREIGN KEY (${fk.localCols.map(q).join(', ')})\n        REFERENCES ${q(fk.refSchema)}.${q(fk.refTable)} (${fk.refCols.map(q).join(', ')})`
    if (fk.onDelete !== 'NO ACTION') def += `\n        ON DELETE ${fk.onDelete}`
    if (fk.onUpdate !== 'NO ACTION') def += `\n        ON UPDATE ${fk.onUpdate}`
    return def
  })

  const allDefs = [...colDefs, ...pkUniqueDefs, ...fkDefs]
  let ddl = `CREATE TABLE ${tableRef} (\n${allDefs.join(',\n')}\n);`

  for (const r of indexResult.rows) {
    const cols = toPgArray(r.columns).map(q).join(', ')
    const unique = (r.indisunique as boolean) ? 'UNIQUE ' : ''
    ddl += `\n\nCREATE ${unique}INDEX ${q(r.indexname as string)}\n    ON ${tableRef} (${cols});`
  }

  return ddl
}

import * as fs from 'fs'
import Papa from 'papaparse'
import type { IDriver } from './drivers/base'

export interface CsvPreviewResult {
  headers: string[]
  preview: Record<string, string>[]
  totalEstimated: number
}

export interface CsvImportParams {
  schemaName: string
  tableName: string
  filePath: string
  columnMapping: Record<string, string | null>
  columnTypes: Record<string, string>
  dbType: string
  batchSize?: number
}

export function previewCsv(filePath: string): CsvPreviewResult {
  const stats = fs.statSync(filePath)

  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(65536)
  const bytesRead = fs.readSync(fd, buf, 0, 65536, 0)
  fs.closeSync(fd)
  const sample = buf.slice(0, bytesRead).toString('utf-8')

  const result = Papa.parse<Record<string, string>>(sample, {
    header: true,
    skipEmptyLines: true,
    preview: 101,
  })

  const headers = (result.meta.fields ?? []) as string[]
  const preview = result.data.slice(0, 5)

  const lines = sample.split('\n').length
  const avgLineBytes = bytesRead / Math.max(lines, 1)
  const totalEstimated = Math.max(result.data.length, Math.round(stats.size / avgLineBytes) - 1)

  return { headers, preview, totalEstimated }
}

function quoteIdentifier(name: string, dbType: string): string {
  if (dbType === 'mysql' || dbType === 'mariadb') return '`' + name.replace(/`/g, '``') + '`'
  return '"' + name.replace(/"/g, '""') + '"'
}

function isDateType(colType: string): boolean {
  const lower = colType.toLowerCase()
  return ['timestamp', 'date', 'time', 'datetime'].some((t) => lower.includes(t))
}

function isNumericType(colType: string): boolean {
  const lower = colType.toLowerCase()
  return ['int', 'float', 'double', 'decimal', 'numeric', 'real', 'bigint', 'smallint', 'serial'].some((t) =>
    lower.includes(t)
  )
}

function escapeValue(val: string, colType: string, dbType: string): string {
  if (val === '' || val === null || val === undefined) return 'NULL'

  if (isDateType(colType)) {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      if (dbType === 'mysql' || dbType === 'mariadb') {
        return "'" + d.toISOString().replace('T', ' ').slice(0, -1) + "'"
      }
      return "'" + d.toISOString() + "'"
    }
  }

  if (isNumericType(colType) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(val.trim())) {
    return val.trim()
  }

  const lower = colType.toLowerCase()
  if (lower === 'boolean' || lower === 'bool') {
    const v = val.toLowerCase()
    if (['true', '1', 'yes', 't'].includes(v)) return 'TRUE'
    if (['false', '0', 'no', 'f'].includes(v)) return 'FALSE'
  }

  return "'" + val.replace(/'/g, "''") + "'"
}

function buildInsertSql(params: CsvImportParams, rows: Record<string, string>[]): string {
  const { schemaName, tableName, columnMapping, columnTypes, dbType } = params
  const q = (n: string) => quoteIdentifier(n, dbType)

  const pairs = Object.entries(columnMapping).filter(([, col]) => col !== null) as [string, string][]
  const csvHeaders = pairs.map(([csv]) => csv)
  const tableCols = pairs.map(([, col]) => col)

  const tableRef = `${q(schemaName)}.${q(tableName)}`
  const colList = tableCols.map(q).join(', ')

  const valueRows = rows.map((row) => {
    const vals = csvHeaders.map((h, i) => {
      const val = row[h] ?? ''
      return escapeValue(val, columnTypes[tableCols[i]] ?? '', dbType)
    })
    return `(${vals.join(', ')})`
  })

  return `INSERT INTO ${tableRef} (${colList}) VALUES ${valueRows.join(',\n')}`
}

export async function importCsvToTable(
  params: CsvImportParams,
  driver: IDriver,
  onProgress: (done: number) => void
): Promise<number> {
  const content = fs.readFileSync(params.filePath, 'utf-8')
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  })

  const allRows = parsed.data
  if (allRows.length === 0) return 0

  const batchSize = params.batchSize ?? 500
  const isMySQL = params.dbType === 'mysql' || params.dbType === 'mariadb'

  await driver.executeQuery(isMySQL ? 'START TRANSACTION' : 'BEGIN')
  try {
    let inserted = 0
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize)
      const sql = buildInsertSql(params, batch)
      await driver.executeQuery(sql)
      inserted += batch.length
      onProgress(inserted)
    }
    await driver.executeQuery('COMMIT')
    return inserted
  } catch (err) {
    try { await driver.executeQuery('ROLLBACK') } catch {}
    throw err
  }
}

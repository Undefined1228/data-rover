import mysql from 'mysql2/promise'

export async function readMysqlTableDDL(
  connection: mysql.Connection,
  schemaName: string,
  objectName: string
): Promise<string> {
  const quotedRef = `\`${schemaName}\`.\`${objectName}\``
  const [rows] = await connection.query<mysql.RowDataPacket[]>(`SHOW CREATE TABLE ${quotedRef}`)
  return (rows[0]?.['Create Table'] as string) ?? ''
}

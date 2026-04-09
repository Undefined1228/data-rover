import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'
import type { ConnectionManager } from '../connection/connectionManager'
import type { CreateTableParams, AlterTableParams, CreateIndexParams } from '../drivers/ddlBuilder'
import { buildPostgresDDL, buildMysqlDDL } from '../drivers/ddlBuilder'

export type SchemaDialogType =
  | 'createSchema'
  | 'alterSchema'
  | 'dropSchema'
  | 'createTable'
  | 'alterTable'
  | 'createView'
  | 'alterView'
  | 'dropView'
  | 'createIndex'
  | 'showDDL'

const DIALOG_TITLES: Record<SchemaDialogType, string> = {
  createSchema: '스키마 생성',
  alterSchema: '스키마 수정',
  dropSchema: '스키마 삭제',
  createTable: '테이블 생성',
  alterTable: '테이블 수정',
  createView: '뷰 생성',
  alterView: '뷰 수정',
  dropView: '뷰 삭제',
  createIndex: '인덱스 생성',
  showDDL: 'DDL 보기',
}

type DdlObject = { schema: string; name: string; type: 'table' | 'view' | 'matview' | 'function' }

export class SchemaManagementPanel extends PanelBase {
  private ddlObjects?: DdlObject[]

  static open(
    extensionUri: vscode.Uri,
    connectionId: string,
    connectionManager: ConnectionManager,
    dialogType: SchemaDialogType,
    dialogData: unknown,
    ddlObjects?: DdlObject[]
  ): SchemaManagementPanel {
    return new SchemaManagementPanel(extensionUri, connectionId, connectionManager, dialogType, dialogData, ddlObjects)
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly connectionId: string,
    private readonly connectionManager: ConnectionManager,
    private readonly dialogType: SchemaDialogType,
    private readonly dialogData: unknown,
    ddlObjects?: DdlObject[]
  ) {
    super('data-rover.schemaManagement', DIALOG_TITLES[dialogType], extensionUri, 'schemaManagement')
    this.ddlObjects = ddlObjects
  }

  protected onMessage(message: { type: string; payload?: unknown }): void {
    switch (message.type) {
      case 'webview:ready':
        this.post('webview:ready:response', { dialogType: this.dialogType, dialogData: this.dialogData })
        break
      case 'db:roles':
        this.handleRoles()
        break
      case 'schema:create':
        this.handleSchemaCreate(message.payload as { name: string; owner?: string })
        break
      case 'schema:alter':
        this.handleSchemaAlter(message.payload as { schema: string; newName?: string; newOwner?: string })
        break
      case 'schema:drop':
        this.handleSchemaDrop(message.payload as { schema: string; cascade: boolean })
        break
      case 'table:preview-ddl':
        this.handleTablePreviewDDL(message.payload as { dbType: string; params: CreateTableParams })
        break
      case 'table:create':
        this.handleTableCreate(message.payload as CreateTableParams)
        break
      case 'table:alter':
        this.handleTableAlter(message.payload as AlterTableParams)
        break
      case 'view:create':
        this.handleViewCreate(message.payload as { schema: string; name: string; query: string })
        break
      case 'view:alter':
        this.handleViewAlter(message.payload as { schema: string; name: string; newName?: string; newQuery?: string })
        break
      case 'view:drop':
        this.handleViewDrop(message.payload as { schema: string; name: string; cascade: boolean })
        break
      case 'index:create':
        this.handleIndexCreate(message.payload as CreateIndexParams)
        break
      case 'index:drop':
        this.handleIndexDrop(message.payload as { schema: string; indexName: string })
        break
      case 'db:object-ddl':
        this.handleObjectDDL(
          message.payload as { schema: string; name: string; type: 'table' | 'view' | 'matview' | 'function' }
        )
        break
      case 'db:objects-ddl':
        this.handleObjectsDDL()
        break
    }
  }

  private async handleRoles(): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const roles = await driver.getRoles()
      this.post('db:roles:response', { roles })
    } catch (err) {
      this.post('db:roles:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleSchemaCreate(payload: { name: string; owner?: string }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.createSchema(payload.name, payload.owner)
      this.post('schema:create:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('schema:create:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleSchemaAlter(payload: { schema: string; newName?: string; newOwner?: string }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.alterSchema(payload.schema, payload.newName, payload.newOwner)
      this.post('schema:alter:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('schema:alter:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleSchemaDrop(payload: { schema: string; cascade: boolean }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.dropSchema(payload.schema, payload.cascade)
      this.post('schema:drop:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('schema:drop:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private handleTablePreviewDDL(payload: { dbType: string; params: CreateTableParams }): void {
    try {
      const ddl = (payload.dbType === 'mysql' || payload.dbType === 'mariadb')
        ? buildMysqlDDL(payload.params)
        : buildPostgresDDL(payload.params)
      this.post('table:preview-ddl:response', { ddl })
    } catch {
      this.post('table:preview-ddl:response', { ddl: '' })
    }
  }

  private async handleTableCreate(payload: CreateTableParams): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.createTable(payload)
      this.post('table:create:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('table:create:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleTableAlter(payload: AlterTableParams): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.alterTable(payload)
      this.post('table:alter:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('table:alter:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleViewCreate(payload: { schema: string; name: string; query: string }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.createView(payload.schema, payload.name, payload.query)
      this.post('view:create:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('view:create:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleViewAlter(payload: { schema: string; name: string; newName?: string; newQuery?: string }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.alterView(payload.schema, payload.name, payload.newName, payload.newQuery)
      this.post('view:alter:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('view:alter:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleViewDrop(payload: { schema: string; name: string; cascade: boolean }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.dropView(payload.schema, payload.name, payload.cascade)
      this.post('view:drop:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('view:drop:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleIndexCreate(payload: CreateIndexParams): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.createIndex(payload)
      this.post('index:create:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('index:create:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleIndexDrop(payload: { schema: string; indexName: string }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      await driver.dropIndex(payload.schema, payload.indexName)
      this.post('index:drop:response', { ok: true })
      vscode.commands.executeCommand('data-rover.refreshSchema')
      this.panel.dispose()
    } catch (err) {
      this.post('index:drop:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleObjectsDDL(): Promise<void> {
    if (!this.ddlObjects?.length) {
      this.post('db:objects-ddl:response', { results: [] })
      return
    }
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const results = await Promise.all(
        this.ddlObjects.map(async (obj) => {
          try {
            const ddl = await driver.getObjectDDL(obj.schema, obj.name, obj.type)
            return { schema: obj.schema, name: obj.name, type: obj.type, ddl }
          } catch (err) {
            return { schema: obj.schema, name: obj.name, type: obj.type, error: err instanceof Error ? err.message : String(err) }
          }
        })
      )
      this.post('db:objects-ddl:response', { results })
    } catch (err) {
      this.post('db:objects-ddl:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleObjectDDL(payload: {
    schema: string
    name: string
    type: 'table' | 'view' | 'matview' | 'function'
  }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const ddl = await driver.getObjectDDL(payload.schema, payload.name, payload.type)
      this.post('db:object-ddl:response', { ddl })
    } catch (err) {
      this.post('db:object-ddl:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }
}

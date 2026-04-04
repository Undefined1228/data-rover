import * as vscode from 'vscode'
import { format } from 'sql-formatter'
import { ConnectionsProvider, ConnectionItem } from './providers/connectionsProvider'
import { SchemaProvider, ConnectionTreeItem, SchemaTreeItem, TableTreeItem, ViewTreeItem, MatViewTreeItem, FunctionTreeItem } from './providers/schemaProvider'
import { DdlContentProvider } from './providers/ddlContentProvider'
import { ConnectionManager } from './connection/connectionManager'
import { ConnectionFormPanel } from './panels/connectionFormPanel'
import { QueryEditorPanel } from './panels/queryEditorPanel'
import { DataViewerPanel } from './panels/dataViewerPanel'
import { SessionMonitorPanel } from './panels/sessionMonitorPanel'
import { ErdPanel } from './panels/erdPanel'
import { closeAllSshTunnels } from './tunnel/sshTunnel'

type DdlTarget = {
  connectionId: string
  schemaName: string
  objectName: string
  objectType: 'table' | 'view' | 'matview' | 'function'
}

function toDdlTarget(item: unknown): DdlTarget | undefined {
  if (item instanceof TableTreeItem)
    return { connectionId: item.connectionId, schemaName: item.schemaName, objectName: item.tableInfo.name, objectType: 'table' }
  if (item instanceof ViewTreeItem)
    return { connectionId: item.connectionId, schemaName: item.schemaName, objectName: item.viewInfo.name, objectType: 'view' }
  if (item instanceof MatViewTreeItem)
    return { connectionId: item.connectionId, schemaName: item.schemaName, objectName: item.matViewInfo.name, objectType: 'matview' }
  if (item instanceof FunctionTreeItem)
    return { connectionId: item.connectionId, schemaName: item.schemaName, objectName: item.functionName, objectType: 'function' }
  return undefined
}

export function activate(context: vscode.ExtensionContext) {
  const connectionManager = new ConnectionManager(context)
  const connectionsProvider = new ConnectionsProvider(connectionManager)
  const schemaProvider = new SchemaProvider(connectionManager, () => connectionsProvider.refresh())
  const ddlContentProvider = new DdlContentProvider()

  vscode.window.registerTreeDataProvider('datapilot.connections', connectionsProvider)
  vscode.window.registerTreeDataProvider('datapilot.schema', schemaProvider)
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DdlContentProvider.scheme, ddlContentProvider)
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('datapilot.addConnection', () => {
      ConnectionFormPanel.open(context.extensionUri, connectionManager)
    }),

    vscode.commands.registerCommand('datapilot.refreshConnections', () => {
      connectionsProvider.refresh()
    }),

    vscode.commands.registerCommand('datapilot.editConnection', (item?: ConnectionItem) => {
      ConnectionFormPanel.open(context.extensionUri, connectionManager, item?.id)
    }),

    vscode.commands.registerCommand('datapilot.deleteConnection', async (item?: ConnectionItem) => {
      if (!item) return
      const confirm = await vscode.window.showWarningMessage(
        '연결을 삭제하시겠습니까?',
        { modal: true },
        '삭제'
      )
      if (confirm === '삭제') {
        await connectionManager.delete(item.id)
        connectionsProvider.refresh()
      }
    }),

    vscode.commands.registerCommand('datapilot.disconnectConnection', async (item?: ConnectionItem) => {
      if (!item) return
      await connectionManager.disconnect(item.id)
      connectionsProvider.refresh()
    }),

    vscode.commands.registerCommand('datapilot.openQueryEditor', async (item?: ConnectionItem) => {
      let connectionId: string | undefined = item?.id
      if (!connectionId) {
        const connections = connectionManager.getAll()
        if (connections.length === 0) {
          vscode.window.showWarningMessage('연결을 먼저 추가해 주세요.')
          return
        }
        const picked = await vscode.window.showQuickPick(
          connections.map((c) => ({ label: c.name, id: c.id })),
          { placeHolder: '쿼리를 실행할 연결을 선택하세요' }
        )
        if (!picked) return
        connectionId = picked.id
      }
      const conn = connectionManager.getById(connectionId)
      if (!conn) return
      QueryEditorPanel.open(context.extensionUri, connectionId, conn.name, connectionManager, context)
    }),

    vscode.commands.registerCommand('datapilot.openDataViewer', async (item?: ConnectionItem) => {
      let connectionId: string | undefined = item?.id
      if (!connectionId) {
        const connections = connectionManager.getAll()
        if (connections.length === 0) {
          vscode.window.showWarningMessage('연결을 먼저 추가해 주세요.')
          return
        }
        const picked = await vscode.window.showQuickPick(
          connections.map((c) => ({ label: c.name, id: c.id })),
          { placeHolder: '연결을 선택하세요' }
        )
        if (!picked) return
        connectionId = picked.id
      }
      const conn = connectionManager.getById(connectionId)
      if (!conn) return
      const tableName = await vscode.window.showInputBox({ prompt: '테이블명 입력' })
      if (!tableName) return
      DataViewerPanel.open(context.extensionUri, connectionId, conn.name, 'public', tableName, 'table', connectionManager)
    }),

    vscode.commands.registerCommand('datapilot.openERD', (_item?: ConnectionItem) => {
      ErdPanel.open(context.extensionUri)
    }),

    vscode.commands.registerCommand('datapilot.openSessionMonitor', () => {
      SessionMonitorPanel.open(context.extensionUri)
    }),

    vscode.commands.registerCommand('datapilot.schema.openQueryEditor', (item?: ConnectionTreeItem) => {
      if (!item) return
      const conn = connectionManager.getById(item.connectionId)
      if (!conn) return
      QueryEditorPanel.open(context.extensionUri, item.connectionId, conn.name, connectionManager, context)
    }),

    vscode.commands.registerCommand('datapilot.refreshSchema', () => {
      schemaProvider.refresh()
    }),

    // ── 스키마 노드 (Phase 6에서 구현) ─────────────────────────────────────
    vscode.commands.registerCommand('datapilot.schema.createSchema', (_item?: SchemaTreeItem) => {
      vscode.window.showInformationMessage('스키마 생성은 Phase 6에서 구현됩니다.')
    }),

    vscode.commands.registerCommand('datapilot.schema.alterSchema', (_item?: SchemaTreeItem) => {
      vscode.window.showInformationMessage('스키마 수정은 Phase 6에서 구현됩니다.')
    }),

    vscode.commands.registerCommand('datapilot.schema.dropSchema', (_item?: SchemaTreeItem) => {
      vscode.window.showInformationMessage('스키마 삭제는 Phase 6에서 구현됩니다.')
    }),

    // ── 테이블/뷰 노드 ──────────────────────────────────────────────────────
    vscode.commands.registerCommand('datapilot.schema.openDataViewer', (item?: TableTreeItem | ViewTreeItem | MatViewTreeItem) => {
      if (!item) return
      const conn = connectionManager.getById(item.connectionId)
      if (!conn) return
      let tableName: string
      let tableType: 'table' | 'view' | 'matview'
      if (item instanceof TableTreeItem) {
        tableName = item.tableInfo.name
        tableType = 'table'
      } else if (item instanceof ViewTreeItem) {
        tableName = item.viewInfo.name
        tableType = 'view'
      } else {
        tableName = (item as MatViewTreeItem).matViewInfo.name
        tableType = 'matview'
      }
      DataViewerPanel.open(context.extensionUri, item.connectionId, conn.name, item.schemaName, tableName, tableType, connectionManager)
    }),

    vscode.commands.registerCommand('datapilot.schema.viewDDL', async (item?: TableTreeItem | ViewTreeItem | MatViewTreeItem | FunctionTreeItem) => {
      const target = toDdlTarget(item)
      if (!target) return
      try {
        const driver = await connectionManager.connect(target.connectionId)
        const raw = await driver.getObjectDDL(target.schemaName, target.objectName, target.objectType)
        const ddl = target.objectType === 'table'
          ? raw
          : format(raw, { language: connectionManager.getById(target.connectionId)?.dbType === 'postgresql' ? 'postgresql' : 'mysql' })
        await ddlContentProvider.show(target.connectionId, target.schemaName, target.objectName, ddl)
      } catch (err) {
        vscode.window.showErrorMessage(`DDL 조회 실패: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),

    vscode.commands.registerCommand('datapilot.schema.copyDDL', async (item?: TableTreeItem | ViewTreeItem) => {
      const target = toDdlTarget(item)
      if (!target) return
      try {
        const driver = await connectionManager.connect(target.connectionId)
        const raw = await driver.getObjectDDL(target.schemaName, target.objectName, target.objectType)
        const ddl = target.objectType === 'table'
          ? raw
          : format(raw, { language: connectionManager.getById(target.connectionId)?.dbType === 'postgresql' ? 'postgresql' : 'mysql' })
        await vscode.env.clipboard.writeText(ddl)
        vscode.window.showInformationMessage('DDL이 클립보드에 복사되었습니다.')
      } catch (err) {
        vscode.window.showErrorMessage(`DDL 조회 실패: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),

    vscode.commands.registerCommand('datapilot.schema.alterTable', (_item?: TableTreeItem) => {
      vscode.window.showInformationMessage('테이블 수정은 Phase 6에서 구현됩니다.')
    }),

    vscode.commands.registerCommand('datapilot.schema.dropTable', (_item?: TableTreeItem) => {
      vscode.window.showInformationMessage('테이블 삭제는 Phase 6에서 구현됩니다.')
    }),

    vscode.commands.registerCommand('datapilot.schema.alterView', (_item?: ViewTreeItem) => {
      vscode.window.showInformationMessage('뷰 수정은 Phase 6에서 구현됩니다.')
    }),

    vscode.commands.registerCommand('datapilot.schema.dropView', (_item?: ViewTreeItem) => {
      vscode.window.showInformationMessage('뷰 삭제는 Phase 6에서 구현됩니다.')
    })
  )
}

export function deactivate() {
  closeAllSshTunnels()
}

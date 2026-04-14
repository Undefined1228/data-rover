import * as vscode from 'vscode'
import { format } from 'sql-formatter'
import { ConnectionsProvider, ConnectionItem } from './providers/connectionsProvider'
import { SchemaProvider, ConnectionTreeItem, SchemaTreeItem, CategoryTreeItem, TableTreeItem, ViewTreeItem, MatViewTreeItem, FunctionTreeItem } from './providers/schemaProvider'
import { DdlContentProvider } from './providers/ddlContentProvider'
import { ConnectionManager } from './connection/connectionManager'
import { ConnectionFormPanel } from './panels/connectionFormPanel'
import { QueryEditorPanel } from './panels/queryEditorPanel'
import { DataViewerPanel } from './panels/dataViewerPanel'
import { SessionMonitorPanel } from './panels/sessionMonitorPanel'
import { ErdPanel } from './panels/erdPanel'
import { SchemaManagementPanel } from './panels/schemaManagementPanel'
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

  const connectionsTreeView = vscode.window.createTreeView('data-rover.connections', {
    treeDataProvider: connectionsProvider,
  })
  connectionsTreeView.description = `v${context.extension.packageJSON.version}`
  context.subscriptions.push(connectionsTreeView)

  const schemaTreeView = vscode.window.createTreeView('data-rover.schema', {
    treeDataProvider: schemaProvider,
    canSelectMany: true,
  })
  context.subscriptions.push(schemaTreeView)
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DdlContentProvider.scheme, ddlContentProvider)
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('data-rover.addConnection', () => {
      ConnectionFormPanel.open(context.extensionUri, connectionManager)
    }),

    vscode.commands.registerCommand('data-rover.refreshConnections', () => {
      connectionsProvider.refresh()
    }),

    vscode.commands.registerCommand('data-rover.editConnection', (item?: ConnectionItem) => {
      ConnectionFormPanel.open(context.extensionUri, connectionManager, item?.id)
    }),

    vscode.commands.registerCommand('data-rover.deleteConnection', async (item?: ConnectionItem) => {
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

    vscode.commands.registerCommand('data-rover.disconnectConnection', async (item?: ConnectionItem) => {
      if (!item) return
      await connectionManager.disconnect(item.id)
      connectionsProvider.refresh()
    }),

    vscode.commands.registerCommand('data-rover.openQueryEditor', async (item?: ConnectionItem) => {
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

    vscode.commands.registerCommand('data-rover.openDataViewer', async (item?: ConnectionItem) => {
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

    vscode.commands.registerCommand('data-rover.openERD', async () => {
      const connections = connectionManager.getAll()
      if (connections.length === 0) {
        vscode.window.showWarningMessage('연결을 먼저 추가해 주세요.')
        return
      }
      const picked = await vscode.window.showQuickPick(
        connections.map((c) => ({ label: c.name, id: c.id })),
        { placeHolder: 'ERD를 열 연결을 선택하세요' }
      )
      if (!picked) return
      const schemaName = await vscode.window.showInputBox({ prompt: '스키마명 입력', value: 'public' })
      if (!schemaName) return
      ErdPanel.open(context.extensionUri, picked.id, schemaName, picked.label, connectionManager)
    }),

    vscode.commands.registerCommand('data-rover.schema.openERD', (item?: SchemaTreeItem) => {
      if (!item) return
      const conn = connectionManager.getById(item.connectionId)
      if (!conn) return
      ErdPanel.open(context.extensionUri, item.connectionId, item.schemaName, conn.name, connectionManager)
    }),

    vscode.commands.registerCommand('data-rover.openSessionMonitor', async (item?: ConnectionItem | ConnectionTreeItem) => {
      let connectionId: string | undefined = item instanceof ConnectionTreeItem ? item.connectionId : item?.id
      if (!connectionId) {
        const connections = connectionManager.getAll()
        if (connections.length === 0) {
          vscode.window.showWarningMessage('연결을 먼저 추가해 주세요.')
          return
        }
        const picked = await vscode.window.showQuickPick(
          connections.map((c) => ({ label: c.name, id: c.id })),
          { placeHolder: '세션을 모니터링할 연결을 선택하세요' }
        )
        if (!picked) return
        connectionId = picked.id
      }
      const conn = connectionManager.getById(connectionId)
      if (!conn) return
      SessionMonitorPanel.open(context.extensionUri, connectionId, conn.name, connectionManager)
    }),

    vscode.commands.registerCommand('data-rover.schema.openQueryEditor', (item?: ConnectionTreeItem) => {
      if (!item) return
      const conn = connectionManager.getById(item.connectionId)
      if (!conn) return
      QueryEditorPanel.open(context.extensionUri, item.connectionId, conn.name, connectionManager, context)
    }),

    vscode.commands.registerCommand('data-rover.refreshSchema', () => {
      schemaProvider.refresh()
    }),

    // ── 스키마 노드 ──────────────────────────────────────────────────────────
    vscode.commands.registerCommand('data-rover.schema.createSchema', (item?: ConnectionTreeItem) => {
      if (!item) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'createSchema', {})
    }),

    vscode.commands.registerCommand('data-rover.schema.alterSchema', async (item?: SchemaTreeItem) => {
      if (!item) return
      try {
        const driver = await connectionManager.connect(item.connectionId)
        const currentOwner = await driver.getSchemaOwner(item.schemaName)
        SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'alterSchema', {
          schemaName: item.schemaName,
          currentOwner,
        })
      } catch (err) {
        vscode.window.showErrorMessage(`스키마 정보 조회 실패: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),

    vscode.commands.registerCommand('data-rover.schema.dropSchema', (item?: SchemaTreeItem) => {
      if (!item) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'dropSchema', {
        schemaName: item.schemaName,
      })
    }),

    // ── 테이블/뷰 노드 ──────────────────────────────────────────────────────
    vscode.commands.registerCommand('data-rover.schema.openDataViewer', (item?: TableTreeItem | ViewTreeItem | MatViewTreeItem) => {
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

    vscode.commands.registerCommand('data-rover.schema.viewDDL', async (item?: TableTreeItem | ViewTreeItem | MatViewTreeItem | FunctionTreeItem) => {
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

    vscode.commands.registerCommand('data-rover.schema.copyDDL', async (item?: TableTreeItem | ViewTreeItem, allSelected?: (TableTreeItem | ViewTreeItem)[]) => {
      const targets = (allSelected?.length ? allSelected : item ? [item] : [])
        .map(toDdlTarget)
        .filter((t): t is DdlTarget => t !== undefined)
      if (!targets.length) return
      try {
        const driver = await connectionManager.connect(targets[0].connectionId)
        const ddls = await Promise.all(targets.map(async (target) => {
          const raw = await driver.getObjectDDL(target.schemaName, target.objectName, target.objectType)
          return target.objectType === 'table'
            ? raw
            : format(raw, { language: connectionManager.getById(target.connectionId)?.dbType === 'postgresql' ? 'postgresql' : 'mysql' })
        }))
        await vscode.env.clipboard.writeText(ddls.join('\n\n'))
        vscode.window.showInformationMessage(`DDL ${ddls.length}개가 클립보드에 복사되었습니다.`)
      } catch (err) {
        vscode.window.showErrorMessage(`DDL 조회 실패: ${err instanceof Error ? err.message : String(err)}`)
      }
    }),

    vscode.commands.registerCommand('data-rover.schema.createTable', (item?: CategoryTreeItem | SchemaTreeItem) => {
      if (!item) return
      const conn = connectionManager.getById(item.connectionId)
      if (!conn) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'createTable', {
        schemaName: item.schemaName,
        dbType: conn.dbType,
      })
    }),

    vscode.commands.registerCommand('data-rover.schema.alterTable', (item?: TableTreeItem) => {
      if (!item) return
      const conn = connectionManager.getById(item.connectionId)
      if (!conn) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'alterTable', {
        schemaName: item.schemaName,
        tableInfo: item.tableInfo,
        dbType: conn.dbType,
      })
    }),

    vscode.commands.registerCommand('data-rover.schema.dropTable', (_item?: TableTreeItem) => {
      vscode.window.showInformationMessage('테이블 삭제는 Phase 6에서 구현됩니다.')
    }),

    vscode.commands.registerCommand('data-rover.schema.createView', (item?: SchemaTreeItem) => {
      if (!item) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'createView', {
        schemaName: item.schemaName,
      })
    }),

    vscode.commands.registerCommand('data-rover.schema.alterView', (item?: ViewTreeItem) => {
      if (!item) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'alterView', {
        schemaName: item.schemaName,
        editViewName: item.viewInfo.name,
      })
    }),

    vscode.commands.registerCommand('data-rover.schema.dropView', (item?: ViewTreeItem) => {
      if (!item) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'dropView', {
        schemaName: item.schemaName,
        viewName: item.viewInfo.name,
      })
    }),

    vscode.commands.registerCommand(
      'data-rover.schema.showDDL',
      (item?: TableTreeItem | ViewTreeItem, allSelected?: (TableTreeItem | ViewTreeItem)[]) => {
        const targets = (allSelected?.length ? allSelected : item ? [item] : []).filter(
          (i): i is TableTreeItem | ViewTreeItem =>
            i instanceof TableTreeItem || i instanceof ViewTreeItem
        )
        if (!targets.length) return
        const connectionId = targets[0].connectionId
        const conn = connectionManager.getById(connectionId)
        if (!conn) return
        const ddlObjects = targets.map((t) =>
          t instanceof TableTreeItem
            ? { schema: t.schemaName, name: t.tableInfo.name, type: 'table' as const }
            : { schema: t.schemaName, name: t.viewInfo.name, type: 'view' as const }
        )
        SchemaManagementPanel.open(context.extensionUri, connectionId, connectionManager, 'showDDL', {}, ddlObjects)
      }
    ),

    vscode.commands.registerCommand('data-rover.schema.importCsv', (item?: TableTreeItem) => {
      if (!item) return
      const conn = connectionManager.getById(item.connectionId)
      if (!conn) return
      SchemaManagementPanel.open(context.extensionUri, item.connectionId, connectionManager, 'csvImport', {
        schemaName: item.schemaName,
        tableName: item.tableInfo.name,
        tableColumns: item.tableInfo.columns,
        dbType: conn.dbType,
      })
    })
  )
}

export function deactivate() {
  closeAllSshTunnels()
}

import * as vscode from 'vscode'
import { ConnectionsProvider, ConnectionItem } from './providers/connectionsProvider'
import { SchemaProvider } from './providers/schemaProvider'
import { ConnectionManager } from './connection/connectionManager'
import { ConnectionFormPanel } from './panels/connectionFormPanel'
import { QueryEditorPanel } from './panels/queryEditorPanel'
import { DataViewerPanel } from './panels/dataViewerPanel'
import { SessionMonitorPanel } from './panels/sessionMonitorPanel'
import { ErdPanel } from './panels/erdPanel'
import { closeAllSshTunnels } from './tunnel/sshTunnel'

export function activate(context: vscode.ExtensionContext) {
  const connectionManager = new ConnectionManager(context)
  const connectionsProvider = new ConnectionsProvider(connectionManager)
  const schemaProvider = new SchemaProvider()

  vscode.window.registerTreeDataProvider('datapilot.connections', connectionsProvider)
  vscode.window.registerTreeDataProvider('datapilot.schema', schemaProvider)

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

    vscode.commands.registerCommand('datapilot.openQueryEditor', (_item?: ConnectionItem) => {
      QueryEditorPanel.open(context.extensionUri)
    }),

    vscode.commands.registerCommand('datapilot.openDataViewer', (_item?: ConnectionItem) => {
      DataViewerPanel.open(context.extensionUri)
    }),

    vscode.commands.registerCommand('datapilot.openERD', (_item?: ConnectionItem) => {
      ErdPanel.open(context.extensionUri)
    }),

    vscode.commands.registerCommand('datapilot.openSessionMonitor', () => {
      SessionMonitorPanel.open(context.extensionUri)
    }),

    vscode.commands.registerCommand('datapilot.refreshSchema', () => {
      schemaProvider.refresh()
    })
  )
}

export function deactivate() {
  closeAllSshTunnels()
}

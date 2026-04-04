import * as vscode from 'vscode'
import type { ConnectionManager } from '../connection/connectionManager'

export class ConnectionItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly dbType: string,
    public readonly description: string,
    public readonly isConnected: boolean
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)
    this.description = description

    if (isConnected) {
      this.contextValue = 'connection-active'
      this.iconPath = new vscode.ThemeIcon('database', new vscode.ThemeColor('charts.green'))
      this.tooltip = `${dbType} — ${description} (연결됨)`
    } else {
      this.contextValue = 'connection'
      this.iconPath = new vscode.ThemeIcon('database')
      this.tooltip = `${dbType} — ${description} (끊김)`
    }
  }
}

export class ConnectionsProvider implements vscode.TreeDataProvider<ConnectionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionItem | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private connectionManager: ConnectionManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: ConnectionItem): vscode.TreeItem {
    return element
  }

  getChildren(): ConnectionItem[] {
    return this.connectionManager.getAll().map((conn) => {
      const desc = conn.host ? `${conn.host}:${conn.port ?? ''}` : (conn.url ?? '')
      return new ConnectionItem(conn.id, conn.name, conn.dbType, desc, this.connectionManager.isConnected(conn.id))
    })
  }
}

import * as vscode from 'vscode'
import type { ConnectionManager } from '../connection/connectionManager'
import type { SchemaInfo, SchemaObjects, TableInfo, ViewInfo, MatViewInfo } from '../connection/types'

// ── TreeItem 클래스 ───────────────────────────────────────────────────────

export class ConnectionTreeItem extends vscode.TreeItem {
  readonly nodeType = 'connection' as const
  constructor(
    public readonly connectionId: string,
    label: string,
    public readonly dbType: string,
    isConnected: boolean
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed)
    const dbSuffix = dbType === 'postgresql' ? '-pg' : '-mysql'
    this.contextValue = isConnected ? `schema-connection${dbSuffix}-active` : `schema-connection${dbSuffix}`
    this.iconPath = new vscode.ThemeIcon(
      'database',
      isConnected ? new vscode.ThemeColor('charts.green') : undefined
    )
    this.tooltip = `${dbType} (${isConnected ? '연결됨' : '끊김'})`
  }
}

export class SchemaTreeItem extends vscode.TreeItem {
  readonly nodeType = 'schema' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    dbType: string
  ) {
    super(schemaName, vscode.TreeItemCollapsibleState.Collapsed)
    this.contextValue = dbType === 'postgresql' ? 'schema-pg' : 'schema-mysql'
    this.iconPath = new vscode.ThemeIcon('symbol-namespace')
  }
}

export class CategoryTreeItem extends vscode.TreeItem {
  readonly nodeType = 'category' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly category: 'tables' | 'views' | 'matviews' | 'functions',
    public readonly objects: SchemaObjects,
    count: number
  ) {
    const labels: Record<string, string> = {
      tables: 'Tables',
      views: 'Views',
      matviews: 'Materialized Views',
      functions: 'Functions',
    }
    super(labels[category], vscode.TreeItemCollapsibleState.Collapsed)
    this.description = String(count)
    this.contextValue = `schema-category-${category}`
    const icons: Record<string, string> = {
      tables: 'symbol-class',
      views: 'symbol-interface',
      matviews: 'symbol-module',
      functions: 'symbol-method',
    }
    this.iconPath = new vscode.ThemeIcon(icons[category])
  }
}

export class TableTreeItem extends vscode.TreeItem {
  readonly nodeType = 'table' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly tableInfo: TableInfo
  ) {
    super(tableInfo.name, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'schema-table'
    this.iconPath = new vscode.ThemeIcon('symbol-class')
    this.description = tableInfo.columns.length > 0 ? `${tableInfo.columns.length}열` : undefined
  }
}

export class ViewTreeItem extends vscode.TreeItem {
  readonly nodeType = 'view' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly viewInfo: ViewInfo
  ) {
    super(viewInfo.name, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'schema-view'
    this.iconPath = new vscode.ThemeIcon('symbol-interface')
  }
}

export class MatViewTreeItem extends vscode.TreeItem {
  readonly nodeType = 'matview' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly matViewInfo: MatViewInfo
  ) {
    super(matViewInfo.name, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'schema-matview'
    this.iconPath = new vscode.ThemeIcon('symbol-module')
  }
}

export class FunctionTreeItem extends vscode.TreeItem {
  readonly nodeType = 'function' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly functionName: string
  ) {
    super(functionName, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'schema-function'
    this.iconPath = new vscode.ThemeIcon('symbol-method')
  }
}


class LoadingItem extends vscode.TreeItem {
  readonly nodeType = 'loading' as const
  constructor() {
    super('로딩 중...', vscode.TreeItemCollapsibleState.None)
    this.iconPath = new vscode.ThemeIcon('loading~spin')
    this.contextValue = 'loading'
  }
}

class ErrorItem extends vscode.TreeItem {
  readonly nodeType = 'error' as const
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None)
    this.iconPath = new vscode.ThemeIcon('error')
    this.contextValue = 'error'
    this.tooltip = message
  }
}

// ── SchemaProvider ────────────────────────────────────────────────────────

type SchemaNode =
  | ConnectionTreeItem
  | SchemaTreeItem
  | CategoryTreeItem
  | TableTreeItem
  | ViewTreeItem
  | MatViewTreeItem
  | FunctionTreeItem
  | LoadingItem
  | ErrorItem

export class SchemaProvider implements vscode.TreeDataProvider<SchemaNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SchemaNode | undefined | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private schemaCache = new Map<string, SchemaInfo[] | Error>()
  private objectsCache = new Map<string, SchemaObjects | Error>()
  private loadingNodes = new Set<string>()

  constructor(
    private connectionManager: ConnectionManager,
    private onConnected: () => void
  ) {}

  refresh(connectionId?: string): void {
    if (connectionId) {
      this.schemaCache.delete(connectionId)
      for (const key of this.objectsCache.keys()) {
        if (key.startsWith(`${connectionId}/`)) this.objectsCache.delete(key)
      }
      this.loadingNodes.delete(connectionId)
    } else {
      this.schemaCache.clear()
      this.objectsCache.clear()
      this.loadingNodes.clear()
    }
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: SchemaNode): vscode.TreeItem {
    return element
  }

  getChildren(element?: SchemaNode): SchemaNode[] {
    if (!element) return this.getRootNodes()
    if (element.nodeType === 'connection') return this.fetchSchemas(element)
    if (element.nodeType === 'schema') return this.fetchObjects(element)
    if (element.nodeType === 'category') return this.getObjectNodes(element)
    return []
  }

  private getRootNodes(): SchemaNode[] {
    const connections = this.connectionManager.getAll()
    if (connections.length === 0) return [new ErrorItem('연결이 없습니다. 연결을 추가하세요.')]
    return connections.map(
      (conn) => new ConnectionTreeItem(conn.id, conn.name, conn.dbType, this.connectionManager.isConnected(conn.id))
    )
  }

  private fetchSchemas(node: ConnectionTreeItem): SchemaNode[] {
    const key = node.connectionId
    const cached = this.schemaCache.get(key)

    if (cached !== undefined) {
      if (cached instanceof Error) return [new ErrorItem(cached.message)]
      return cached.map((s) => new SchemaTreeItem(node.connectionId, s.name, node.dbType))
    }

    if (!this.loadingNodes.has(key)) {
      this.loadingNodes.add(key)
      this.connectionManager
        .connect(node.connectionId)
        .then((driver) => driver.getSchemas())
        .then((schemas) => {
          this.schemaCache.set(key, schemas)
          this.onConnected()
        })
        .catch((err) => { this.schemaCache.set(key, err instanceof Error ? err : new Error(String(err))) })
        .finally(() => {
          this.loadingNodes.delete(key)
          this._onDidChangeTreeData.fire()
        })
    }

    return [new LoadingItem()]
  }

  private fetchObjects(node: SchemaTreeItem): SchemaNode[] {
    const key = `${node.connectionId}/${node.schemaName}`
    const cached = this.objectsCache.get(key)

    if (cached !== undefined) {
      if (cached instanceof Error) return [new ErrorItem(cached.message)]
      return this.buildCategoryNodes(node.connectionId, node.schemaName, cached)
    }

    if (!this.loadingNodes.has(key)) {
      this.loadingNodes.add(key)
      this.connectionManager
        .connect(node.connectionId)
        .then((driver) => driver.getSchemaObjects(node.schemaName))
        .then((objects) => { this.objectsCache.set(key, objects) })
        .catch((err) => { this.objectsCache.set(key, err instanceof Error ? err : new Error(String(err))) })
        .finally(() => {
          this.loadingNodes.delete(key)
          this._onDidChangeTreeData.fire(node)
        })
    }

    return [new LoadingItem()]
  }

  private buildCategoryNodes(connectionId: string, schemaName: string, objects: SchemaObjects): SchemaNode[] {
    const nodes: SchemaNode[] = []
    if (objects.tables.length > 0)
      nodes.push(new CategoryTreeItem(connectionId, schemaName, 'tables', objects, objects.tables.length))
    if (objects.views.length > 0)
      nodes.push(new CategoryTreeItem(connectionId, schemaName, 'views', objects, objects.views.length))
    if (objects.materialized_views.length > 0)
      nodes.push(new CategoryTreeItem(connectionId, schemaName, 'matviews', objects, objects.materialized_views.length))
    if (objects.functions.length > 0)
      nodes.push(new CategoryTreeItem(connectionId, schemaName, 'functions', objects, objects.functions.length))
    if (nodes.length === 0) return [new ErrorItem('오브젝트가 없습니다')]
    return nodes
  }

  private getObjectNodes(node: CategoryTreeItem): SchemaNode[] {
    const { connectionId, schemaName, category, objects } = node
    if (category === 'tables') return objects.tables.map((t) => new TableTreeItem(connectionId, schemaName, t))
    if (category === 'views') return objects.views.map((v) => new ViewTreeItem(connectionId, schemaName, v))
    if (category === 'matviews') return objects.materialized_views.map((mv) => new MatViewTreeItem(connectionId, schemaName, mv))
    if (category === 'functions') return objects.functions.map((f) => new FunctionTreeItem(connectionId, schemaName, f))
    return []
  }

}

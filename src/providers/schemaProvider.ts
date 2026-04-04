import * as vscode from 'vscode'
import type { ConnectionManager } from '../connection/connectionManager'
import type { SchemaInfo, SchemaObjects, ColumnInfo, FKInfo, IndexInfo, TableInfo, ViewInfo, MatViewInfo } from '../connection/types'

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
    this.contextValue = isConnected ? 'schema-connection-active' : 'schema-connection'
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
    super(tableInfo.name, vscode.TreeItemCollapsibleState.Collapsed)
    this.contextValue = 'schema-table'
    this.iconPath = new vscode.ThemeIcon('symbol-class')
  }
}

export class ViewTreeItem extends vscode.TreeItem {
  readonly nodeType = 'view' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly viewInfo: ViewInfo
  ) {
    super(viewInfo.name, vscode.TreeItemCollapsibleState.Collapsed)
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
    super(matViewInfo.name, vscode.TreeItemCollapsibleState.Collapsed)
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

export class ColumnGroupItem extends vscode.TreeItem {
  readonly nodeType = 'column-group' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly tableName: string,
    public readonly columns: ColumnInfo[]
  ) {
    super('Columns', vscode.TreeItemCollapsibleState.Expanded)
    this.description = String(columns.length)
    this.contextValue = 'schema-column-group'
    this.iconPath = new vscode.ThemeIcon('symbol-field')
  }
}

export class FKGroupItem extends vscode.TreeItem {
  readonly nodeType = 'fk-group' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly tableName: string,
    public readonly fks: FKInfo[]
  ) {
    super('Foreign Keys', vscode.TreeItemCollapsibleState.Collapsed)
    this.description = String(fks.length)
    this.contextValue = 'schema-fk-group'
    this.iconPath = new vscode.ThemeIcon('references')
  }
}

export class IndexGroupItem extends vscode.TreeItem {
  readonly nodeType = 'index-group' as const
  constructor(
    public readonly connectionId: string,
    public readonly schemaName: string,
    public readonly tableName: string,
    public readonly indexes: IndexInfo[]
  ) {
    super('Indexes', vscode.TreeItemCollapsibleState.Collapsed)
    this.description = String(indexes.length)
    this.contextValue = 'schema-index-group'
    this.iconPath = new vscode.ThemeIcon('list-ordered')
  }
}

export class ColumnItem extends vscode.TreeItem {
  readonly nodeType = 'column' as const
  constructor(public readonly column: ColumnInfo) {
    super(column.name, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'schema-column'
    const badges: string[] = []
    if (column.isPrimaryKey) badges.push('PK')
    if (!column.nullable) badges.push('NOT NULL')
    this.description = [column.dataType, ...badges].join(' · ')
    this.iconPath = new vscode.ThemeIcon(column.isPrimaryKey ? 'key' : 'symbol-field')
    this.tooltip = [
      `${column.name}: ${column.dataType}`,
      column.isPrimaryKey ? 'Primary Key' : '',
      column.nullable ? 'Nullable' : 'NOT NULL',
      column.defaultValue ? `Default: ${column.defaultValue}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
}

export class FKItem extends vscode.TreeItem {
  readonly nodeType = 'fk' as const
  constructor(public readonly fk: FKInfo) {
    super(fk.constraintName, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'schema-fk'
    this.iconPath = new vscode.ThemeIcon('references')
    this.description = `${fk.localColumns.join(', ')} → ${fk.refTable}(${fk.refColumns.join(', ')})`
    this.tooltip = [
      `제약명: ${fk.constraintName}`,
      `${fk.localColumns.join(', ')} → ${fk.refSchema}.${fk.refTable}(${fk.refColumns.join(', ')})`,
      `ON DELETE: ${fk.onDelete}`,
      `ON UPDATE: ${fk.onUpdate}`,
    ].join('\n')
  }
}

export class IndexItem extends vscode.TreeItem {
  readonly nodeType = 'index' as const
  constructor(public readonly index: IndexInfo) {
    super(index.name, vscode.TreeItemCollapsibleState.None)
    this.contextValue = 'schema-index'
    this.iconPath = new vscode.ThemeIcon('list-ordered')
    this.description = [index.unique ? 'UNIQUE' : '', index.columns.join(', ')]
      .filter(Boolean)
      .join(' · ')
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
  | ColumnGroupItem
  | FKGroupItem
  | IndexGroupItem
  | ColumnItem
  | FKItem
  | IndexItem
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
    if (element.nodeType === 'table') return this.getTableChildNodes(element)
    if (element.nodeType === 'view') {
      return [new ColumnGroupItem(element.connectionId, element.schemaName, element.viewInfo.name, element.viewInfo.columns)]
    }
    if (element.nodeType === 'matview') {
      const children: SchemaNode[] = [
        new ColumnGroupItem(element.connectionId, element.schemaName, element.matViewInfo.name, element.matViewInfo.columns),
      ]
      if (element.matViewInfo.indexes.length > 0) {
        children.push(new IndexGroupItem(element.connectionId, element.schemaName, element.matViewInfo.name, element.matViewInfo.indexes))
      }
      return children
    }
    if (element.nodeType === 'column-group') return element.columns.map((c) => new ColumnItem(c))
    if (element.nodeType === 'fk-group') return element.fks.map((f) => new FKItem(f))
    if (element.nodeType === 'index-group') return element.indexes.map((i) => new IndexItem(i))
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
          this._onDidChangeTreeData.fire(node)
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

  private getTableChildNodes(node: TableTreeItem): SchemaNode[] {
    const { connectionId, schemaName, tableInfo } = node
    const children: SchemaNode[] = [
      new ColumnGroupItem(connectionId, schemaName, tableInfo.name, tableInfo.columns),
    ]
    if (tableInfo.foreignKeys.length > 0)
      children.push(new FKGroupItem(connectionId, schemaName, tableInfo.name, tableInfo.foreignKeys))
    if (tableInfo.indexes.length > 0)
      children.push(new IndexGroupItem(connectionId, schemaName, tableInfo.name, tableInfo.indexes))
    return children
  }
}

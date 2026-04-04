import * as vscode from 'vscode';

export class SchemaPlaceholderItem extends vscode.TreeItem {
  constructor() {
    super('연결을 선택하면 스키마가 표시됩니다', vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'placeholder';
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

export class SchemaProvider implements vscode.TreeDataProvider<SchemaPlaceholderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SchemaPlaceholderItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SchemaPlaceholderItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SchemaPlaceholderItem[] {
    return [new SchemaPlaceholderItem()];
  }
}

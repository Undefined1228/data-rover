import * as vscode from 'vscode'

export class DdlContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'datapilot-ddl'

  private content = new Map<string, string>()
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChange = this._onDidChange.event

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? ''
  }

  async show(connectionId: string, schema: string, objectName: string, ddl: string): Promise<void> {
    const uri = vscode.Uri.from({
      scheme: DdlContentProvider.scheme,
      path: `/${encodeURIComponent(connectionId)}/${encodeURIComponent(schema)}/${encodeURIComponent(objectName)}.sql`,
    })
    this.content.set(uri.toString(), ddl)
    this._onDidChange.fire(uri)
    const doc = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(doc, { preview: false })
  }
}

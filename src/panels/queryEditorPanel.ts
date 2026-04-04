import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'

export class QueryEditorPanel extends PanelBase {
  static open(extensionUri: vscode.Uri): QueryEditorPanel {
    return new QueryEditorPanel(extensionUri)
  }

  private constructor(extensionUri: vscode.Uri) {
    super('datapilot.queryEditor', 'Query Editor', extensionUri, 'queryEditor')
  }

  protected onMessage(_message: { type: string; payload?: unknown }): void {}
}

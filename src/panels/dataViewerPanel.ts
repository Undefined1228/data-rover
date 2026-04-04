import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'

export class DataViewerPanel extends PanelBase {
  static open(extensionUri: vscode.Uri): DataViewerPanel {
    return new DataViewerPanel(extensionUri)
  }

  private constructor(extensionUri: vscode.Uri) {
    super('datapilot.dataViewer', 'Data Viewer', extensionUri, 'dataViewer')
  }

  protected onMessage(_message: { type: string; payload?: unknown }): void {}
}

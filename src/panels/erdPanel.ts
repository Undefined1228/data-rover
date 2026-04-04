import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'

export class ErdPanel extends PanelBase {
  private static instance: ErdPanel | undefined

  static open(extensionUri: vscode.Uri): ErdPanel {
    if (ErdPanel.instance) {
      ErdPanel.instance.panel.reveal()
      return ErdPanel.instance
    }
    const panel = new ErdPanel(extensionUri)
    ErdPanel.instance = panel
    return panel
  }

  private constructor(extensionUri: vscode.Uri) {
    super('datapilot.erd', 'ER Diagram', extensionUri, 'erd')
  }

  protected onMessage(_message: { type: string; payload?: unknown }): void {}

  protected override onDispose(): void {
    ErdPanel.instance = undefined
  }
}

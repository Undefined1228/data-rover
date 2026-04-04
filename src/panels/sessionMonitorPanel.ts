import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'

export class SessionMonitorPanel extends PanelBase {
  private static instance: SessionMonitorPanel | undefined

  static open(extensionUri: vscode.Uri): SessionMonitorPanel {
    if (SessionMonitorPanel.instance) {
      SessionMonitorPanel.instance.panel.reveal()
      return SessionMonitorPanel.instance
    }
    const panel = new SessionMonitorPanel(extensionUri)
    SessionMonitorPanel.instance = panel
    return panel
  }

  private constructor(extensionUri: vscode.Uri) {
    super('datapilot.sessionMonitor', 'Session Monitor', extensionUri, 'sessionMonitor')
  }

  protected onMessage(_message: { type: string; payload?: unknown }): void {}

  protected override onDispose(): void {
    SessionMonitorPanel.instance = undefined
  }
}

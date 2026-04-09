import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'
import type { ConnectionManager } from '../connection/connectionManager'

export class ErdPanel extends PanelBase {
  private static instances = new Map<string, ErdPanel>()

  static open(
    extensionUri: vscode.Uri,
    connectionId: string,
    schemaName: string,
    connectionName: string,
    connectionManager: ConnectionManager
  ): ErdPanel {
    const key = `${connectionId}:${schemaName}`
    const existing = ErdPanel.instances.get(key)
    if (existing) {
      existing.panel.reveal()
      return existing
    }
    const panel = new ErdPanel(extensionUri, connectionId, schemaName, connectionName, connectionManager)
    ErdPanel.instances.set(key, panel)
    return panel
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly connectionId: string,
    private readonly schemaName: string,
    connectionName: string,
    private readonly connectionManager: ConnectionManager
  ) {
    super('data-rover.erd', `ERD — ${connectionName}/${schemaName}`, extensionUri, 'erd')
  }

  protected onMessage(message: { type: string; payload?: unknown }): void {
    if (message.type === 'erd:fetch') {
      void this.handleFetch()
    }
  }

  private async handleFetch(): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const tables = await driver.getErdData(this.schemaName)
      this.post('erd:fetch:response', tables)
    } catch (err) {
      this.post('erd:fetch:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  protected override onDispose(): void {
    ErdPanel.instances.forEach((panel, key) => {
      if (panel === this) ErdPanel.instances.delete(key)
    })
  }
}

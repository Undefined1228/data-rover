import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'
import type { ConnectionManager } from '../connection/connectionManager'

export class SessionMonitorPanel extends PanelBase {
  private static instances = new Map<string, SessionMonitorPanel>()
  private refreshTimer: ReturnType<typeof setInterval> | undefined
  private refreshIntervalMs = 10000

  static open(
    extensionUri: vscode.Uri,
    connectionId: string,
    connectionName: string,
    connectionManager: ConnectionManager
  ): SessionMonitorPanel {
    const existing = SessionMonitorPanel.instances.get(connectionId)
    if (existing) {
      existing.panel.reveal()
      return existing
    }
    const panel = new SessionMonitorPanel(extensionUri, connectionId, connectionName, connectionManager)
    SessionMonitorPanel.instances.set(connectionId, panel)
    return panel
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly connectionId: string,
    connectionName: string,
    private readonly connectionManager: ConnectionManager
  ) {
    super('data-rover.sessionMonitor', `Monitor — ${connectionName}`, extensionUri, 'sessionMonitor')

    this.panel.onDidChangeViewState((e) => {
      if (e.webviewPanel.visible) {
        this.startRefresh()
      } else {
        this.stopRefresh()
      }
    })
  }

  protected onMessage(message: { type: string; payload?: unknown }): void {
    switch (message.type) {
      case 'webview:ready': {
        const conn = this.connectionManager.getById(this.connectionId)
        this.post('webview:ready:response', { dbType: conn?.dbType ?? 'postgresql' })
        this.startRefresh()
        break
      }
      case 'monitor:sessions':
        void this.handleSessions()
        break
      case 'monitor:kill-session':
        void this.handleKillSession(message.payload as { sessionId: number; mode: 'cancel' | 'terminate' })
        break
      case 'monitor:locks':
        void this.handleLocks()
        break
      case 'monitor:table-stats':
        void this.handleTableStats()
        break
      case 'monitor:set-interval': {
        const { interval } = message.payload as { interval: number }
        this.refreshIntervalMs = interval
        if (this.refreshTimer) {
          this.stopRefresh()
          this.startRefresh()
        }
        break
      }
    }
  }

  private startRefresh(): void {
    this.stopRefresh()
    this.refreshTimer = setInterval(() => {
      this.post('monitor:auto-refresh', {})
    }, this.refreshIntervalMs)
  }

  private stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = undefined
    }
  }

  private async handleSessions(): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const sessions = await driver.getSessions()
      this.post('monitor:sessions:response', sessions)
    } catch (err) {
      this.post('monitor:sessions:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleKillSession(payload: { sessionId: number; mode: 'cancel' | 'terminate' }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const result = await driver.killSession(payload.sessionId, payload.mode)
      this.post('monitor:kill-session:response', result)
    } catch (err) {
      this.post('monitor:kill-session:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleLocks(): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const locks = await driver.getLocks()
      this.post('monitor:locks:response', locks)
    } catch (err) {
      this.post('monitor:locks:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleTableStats(): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const stats = await driver.getTableStats()
      this.post('monitor:table-stats:response', stats)
    } catch (err) {
      this.post('monitor:table-stats:response', { error: err instanceof Error ? err.message : String(err) })
    }
  }

  protected override onDispose(): void {
    this.stopRefresh()
    SessionMonitorPanel.instances.delete(this.connectionId)
  }
}

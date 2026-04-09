import * as vscode from 'vscode'
import * as fs from 'fs'
import { PanelBase } from './PanelBase'
import type { ConnectionManager } from '../connection/connectionManager'
import type { ConnectionFormData } from '../connection/types'
import { PostgresDriver } from '../drivers/postgres'
import { MysqlDriver } from '../drivers/mysql'
import { openSshTunnel, closeSshTunnel } from '../tunnel/sshTunnel'

const TEST_TUNNEL_ID = '__test__'

export class ConnectionFormPanel extends PanelBase {
  private static instance: ConnectionFormPanel | undefined

  static open(
    extensionUri: vscode.Uri,
    connectionManager: ConnectionManager,
    connectionId?: string
  ): ConnectionFormPanel {
    if (ConnectionFormPanel.instance) {
      ConnectionFormPanel.instance.panel.reveal()
      return ConnectionFormPanel.instance
    }
    const panel = new ConnectionFormPanel(extensionUri, connectionManager, connectionId)
    ConnectionFormPanel.instance = panel
    return panel
  }

  private constructor(
    extensionUri: vscode.Uri,
    private connectionManager: ConnectionManager,
    private connectionId?: string
  ) {
    super(
      'data-rover.connectionForm',
      connectionId ? '연결 편집' : '연결 추가',
      extensionUri,
      'connectionForm'
    )
  }

  protected async onMessage(message: { type: string; payload?: unknown }): Promise<void> {
    switch (message.type) {
      case 'conn:get':
        await this.handleGet()
        break
      case 'conn:save':
        await this.handleSave(message.payload as ConnectionFormData)
        break
      case 'db:test-connection':
        await this.handleTestConnection(message.payload as ConnectionFormData)
        break
      case 'conn:cancel':
        this.panel.dispose()
        break
    }
  }

  protected override onDispose(): void {
    ConnectionFormPanel.instance = undefined
  }

  private async handleGet(): Promise<void> {
    if (!this.connectionId) {
      this.post('conn:get:response', null)
      return
    }
    const conn = this.connectionManager.getById(this.connectionId)
    if (!conn) {
      this.post('conn:get:response', null)
      return
    }
    const { password, sshPassword, sshPassphrase } = await this.connectionManager.getSecrets(conn.id)
    this.post('conn:get:response', {
      ...conn,
      password,
      sshPassword,
      sshPassphrase,
      port: conn.port != null ? String(conn.port) : '',
      sshPort: conn.sshPort != null ? String(conn.sshPort) : '',
    })
  }

  private async handleSave(data: ConnectionFormData): Promise<void> {
    try {
      const conn = this.connectionId
        ? await this.connectionManager.update(this.connectionId, data)
        : await this.connectionManager.add(data)
      this.post('conn:save:response', { ok: true, conn })
      vscode.commands.executeCommand('data-rover.refreshConnections')
      this.panel.dispose()
    } catch (err) {
      this.post('conn:save:response', { ok: false, message: (err as Error).message })
    }
  }

  private async handleTestConnection(data: ConnectionFormData): Promise<void> {
    const start = Date.now()
    try {
      let host = data.host || null
      let port = data.port ? Number(data.port) : null

      if (data.sshEnabled && data.sshHost && data.sshUsername) {
        let privateKey: string | undefined
        if (data.sshAuthMethod === 'key' && data.sshKeyPath) {
          try {
            privateKey = fs.readFileSync(data.sshKeyPath, 'utf-8')
          } catch {
            this.post('db:test-connection:response', {
              ok: false,
              message: `SSH 키 파일을 읽을 수 없습니다: ${data.sshKeyPath}`,
            })
            return
          }
        }
        const remoteHost = data.host || '127.0.0.1'
        const remotePort = data.port
          ? Number(data.port)
          : data.dbType === 'postgresql'
            ? 5432
            : 3306
        const { localPort } = await openSshTunnel(
          TEST_TUNNEL_ID,
          {
            host: data.sshHost,
            port: data.sshPort ? Number(data.sshPort) : 22,
            username: data.sshUsername,
            authMethod: data.sshAuthMethod,
            password: data.sshPassword || undefined,
            privateKey,
            passphrase: data.sshPassphrase || undefined,
          },
          remoteHost,
          remotePort
        )
        host = '127.0.0.1'
        port = localPort
      }

      const tempConfig = {
        id: '__test__',
        name: '',
        dbType: data.dbType,
        inputMode: data.inputMode,
        host,
        port,
        databaseName: data.databaseName || null,
        username: data.username || null,
        url: data.url || null,
        color: null,
        sshEnabled: false,
        sshHost: null,
        sshPort: null,
        sshUsername: null,
        sshAuthMethod: data.sshAuthMethod,
        sshKeyPath: null,
        createdAt: '',
        updatedAt: '',
      } as const

      const driver =
        data.dbType === 'postgresql'
          ? new PostgresDriver(tempConfig, data.password)
          : new MysqlDriver(tempConfig, data.password)

      await driver.testConnection()
      const elapsed = Date.now() - start
      this.post('db:test-connection:response', { ok: true, message: `연결 성공 (${elapsed}ms)` })
    } catch (err) {
      this.post('db:test-connection:response', { ok: false, message: (err as Error).message })
    } finally {
      closeSshTunnel(TEST_TUNNEL_ID)
    }
  }
}

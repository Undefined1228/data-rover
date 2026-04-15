import * as vscode from 'vscode'
import * as fs from 'fs'
import { randomUUID } from 'crypto'
import type { ConnectionConfig, ConnectionFormData } from './types'
import { SecretStore } from './secretStore'
import { openSshTunnel, closeSshTunnel } from '../tunnel/sshTunnel'
import type { SshConfig } from '../tunnel/sshTunnel'
import type { IDriver } from '../drivers/base'
import { PostgresDriver } from '../drivers/postgres'
import { MysqlDriver } from '../drivers/mysql'

const STATE_KEY = 'data-rover.connections'

export class ConnectionManager {
  private secretStore: SecretStore
  private activeDrivers = new Map<string, IDriver>()

  constructor(private context: vscode.ExtensionContext) {
    this.secretStore = new SecretStore(context.secrets)
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  getAll(): ConnectionConfig[] {
    return this.context.globalState.get<ConnectionConfig[]>(STATE_KEY, [])
  }

  getById(id: string): ConnectionConfig | undefined {
    return this.getAll().find((c) => c.id === id)
  }

  async add(data: ConnectionFormData): Promise<ConnectionConfig> {
    console.log(`[ConnectionManager] add — name="${data.name}", dbType=${data.dbType}, inputMode=${data.inputMode}`)
    const now = new Date().toISOString()
    const conn: ConnectionConfig = {
      id: randomUUID(),
      name: data.name,
      dbType: data.dbType,
      inputMode: data.inputMode,
      host: data.host || null,
      port: data.port ? Number(data.port) : null,
      databaseName: data.databaseName || null,
      username: data.username || null,
      url: data.url || null,
      color: data.color || null,
      sshEnabled: data.sshEnabled,
      sshHost: data.sshHost || null,
      sshPort: data.sshPort ? Number(data.sshPort) : null,
      sshUsername: data.sshUsername || null,
      sshAuthMethod: data.sshAuthMethod,
      sshKeyPath: data.sshKeyPath || null,
      createdAt: now,
      updatedAt: now,
    }
    console.log(`[ConnectionManager] add — saving secrets for id=${conn.id}`)
    await this.saveSecrets(conn.id, data)
    console.log(`[ConnectionManager] add — updating globalState`)
    await this.context.globalState.update(STATE_KEY, [...this.getAll(), conn])
    console.log(`[ConnectionManager] add — done, total=${this.getAll().length}`)
    return conn
  }

  async update(id: string, data: ConnectionFormData): Promise<ConnectionConfig> {
    const connections = this.getAll()
    const index = connections.findIndex((c) => c.id === id)
    if (index === -1) throw new Error(`연결을 찾을 수 없습니다: ${id}`)
    const updated: ConnectionConfig = {
      ...connections[index],
      name: data.name,
      dbType: data.dbType,
      inputMode: data.inputMode,
      host: data.host || null,
      port: data.port ? Number(data.port) : null,
      databaseName: data.databaseName || null,
      username: data.username || null,
      url: data.url || null,
      color: data.color || null,
      sshEnabled: data.sshEnabled,
      sshHost: data.sshHost || null,
      sshPort: data.sshPort ? Number(data.sshPort) : null,
      sshUsername: data.sshUsername || null,
      sshAuthMethod: data.sshAuthMethod,
      sshKeyPath: data.sshKeyPath || null,
      updatedAt: new Date().toISOString(),
    }
    await this.saveSecrets(id, data)
    connections[index] = updated
    await this.context.globalState.update(STATE_KEY, connections)
    return updated
  }

  async delete(id: string): Promise<void> {
    await this.disconnect(id)
    await this.context.globalState.update(STATE_KEY, this.getAll().filter((c) => c.id !== id))
    await this.secretStore.deleteAll(id)
  }

  // ── 연결 / 해제 ──────────────────────────────────────────────────────────

  async connect(id: string): Promise<IDriver> {
    const cached = this.activeDrivers.get(id)
    if (cached) return cached

    const conn = this.getById(id)
    if (!conn) throw new Error(`연결을 찾을 수 없습니다: ${id}`)

    const password = await this.secretStore.getPassword(id)

    let effectiveHost = conn.host
    let effectivePort = conn.port

    if (conn.sshEnabled && conn.sshHost && conn.sshUsername) {
      let privateKey: string | undefined
      if (conn.sshAuthMethod === 'key' && conn.sshKeyPath) {
        try {
          privateKey = fs.readFileSync(conn.sshKeyPath, 'utf-8')
        } catch {
          throw new Error(`SSH 키 파일을 읽을 수 없습니다: ${conn.sshKeyPath}`)
        }
      }
      const sshConfig: SshConfig = {
        host: conn.sshHost,
        port: conn.sshPort ?? 22,
        username: conn.sshUsername,
        authMethod: conn.sshAuthMethod,
        password: (await this.secretStore.getSshPassword(id)) || undefined,
        privateKey,
        passphrase: (await this.secretStore.getSshPassphrase(id)) || undefined,
      }
      const remoteHost = conn.host ?? '127.0.0.1'
      const remotePort = conn.port ?? (conn.dbType === 'postgresql' ? 5432 : 3306)
      const { localPort } = await openSshTunnel(id, sshConfig, remoteHost, remotePort)
      effectiveHost = '127.0.0.1'
      effectivePort = localPort
    }

    const tunneled: ConnectionConfig = { ...conn, host: effectiveHost, port: effectivePort }
    const driver: IDriver =
      conn.dbType === 'postgresql'
        ? new PostgresDriver(tunneled, password)
        : new MysqlDriver(tunneled, password)

    await driver.connect()
    this.activeDrivers.set(id, driver)
    return driver
  }

  async disconnect(id: string): Promise<void> {
    const driver = this.activeDrivers.get(id)
    if (driver) {
      await driver.disconnect().catch(() => {})
      this.activeDrivers.delete(id)
    }
    closeSshTunnel(id)
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.activeDrivers.keys()].map((id) => this.disconnect(id)))
  }

  getActiveDriver(id: string): IDriver | undefined {
    return this.activeDrivers.get(id)
  }

  isConnected(id: string): boolean {
    return this.activeDrivers.has(id)
  }

  async getSecrets(id: string): Promise<{ password: string; sshPassword: string; sshPassphrase: string }> {
    const [password, sshPassword, sshPassphrase] = await Promise.all([
      this.secretStore.getPassword(id),
      this.secretStore.getSshPassword(id),
      this.secretStore.getSshPassphrase(id),
    ])
    return { password, sshPassword, sshPassphrase }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────

  private async saveSecrets(id: string, data: ConnectionFormData): Promise<void> {
    if (data.password) await this.secretStore.setPassword(id, data.password)
    if (data.sshPassword) await this.secretStore.setSshPassword(id, data.sshPassword)
    if (data.sshPassphrase) await this.secretStore.setSshPassphrase(id, data.sshPassphrase)
  }
}

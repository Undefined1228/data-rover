import { Client } from 'ssh2'
import * as net from 'net'

export interface SshConfig {
  host: string
  port: number
  username: string
  authMethod: 'password' | 'key'
  password?: string
  privateKey?: string
  passphrase?: string
}

interface TunnelEntry {
  client: Client
  server: net.Server
  localPort: number
}

const tunnelMap = new Map<string, TunnelEntry>()

export function openSshTunnel(
  connectionId: string,
  sshConfig: SshConfig,
  remoteHost: string,
  remotePort: number
): Promise<{ localPort: number }> {
  const existing = tunnelMap.get(connectionId)
  if (existing) {
    return Promise.resolve({ localPort: existing.localPort })
  }

  return new Promise((resolve, reject) => {
    const conn = new Client()

    const server = net.createServer((sock) => {
      conn.forwardOut(
        '127.0.0.1',
        (server.address() as net.AddressInfo).port,
        remoteHost,
        remotePort,
        (err, stream) => {
          if (err) {
            sock.destroy()
            return
          }
          sock.pipe(stream).pipe(sock)
        }
      )
    })

    server.listen(0, '127.0.0.1', () => {
      const localPort = (server.address() as net.AddressInfo).port

      const connectConfig: Parameters<Client['connect']>[0] = {
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        readyTimeout: 10000,
      }

      if (sshConfig.authMethod === 'key') {
        connectConfig.privateKey = sshConfig.privateKey
        if (sshConfig.passphrase) connectConfig.passphrase = sshConfig.passphrase
      } else {
        connectConfig.password = sshConfig.password
      }

      conn.on('ready', () => {
        tunnelMap.set(connectionId, { client: conn, server, localPort })
        resolve({ localPort })
      })

      conn.on('error', (err) => {
        server.close()
        reject(new Error(`SSH 연결 실패: ${err.message}`))
      })

      conn.connect(connectConfig)
    })

    server.on('error', (err) => {
      conn.end()
      reject(new Error(`SSH 터널 로컬 서버 오류: ${err.message}`))
    })
  })
}

export function closeSshTunnel(connectionId: string): void {
  const entry = tunnelMap.get(connectionId)
  if (!entry) return
  entry.server.close()
  entry.client.end()
  tunnelMap.delete(connectionId)
}

export function closeAllSshTunnels(): void {
  for (const [id] of tunnelMap) {
    closeSshTunnel(id)
  }
}

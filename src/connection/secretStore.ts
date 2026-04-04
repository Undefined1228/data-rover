import * as vscode from 'vscode'

export class SecretStore {
  constructor(private secrets: vscode.SecretStorage) {}

  async getPassword(id: string): Promise<string> {
    return (await this.secrets.get(`conn:${id}:password`)) ?? ''
  }

  async setPassword(id: string, password: string): Promise<void> {
    await this.secrets.store(`conn:${id}:password`, password)
  }

  async getSshPassword(id: string): Promise<string> {
    return (await this.secrets.get(`conn:${id}:sshPassword`)) ?? ''
  }

  async setSshPassword(id: string, password: string): Promise<void> {
    await this.secrets.store(`conn:${id}:sshPassword`, password)
  }

  async getSshPrivateKey(id: string): Promise<string> {
    return (await this.secrets.get(`conn:${id}:sshPrivateKey`)) ?? ''
  }

  async setSshPrivateKey(id: string, key: string): Promise<void> {
    await this.secrets.store(`conn:${id}:sshPrivateKey`, key)
  }

  async getSshPassphrase(id: string): Promise<string> {
    return (await this.secrets.get(`conn:${id}:sshPassphrase`)) ?? ''
  }

  async setSshPassphrase(id: string, passphrase: string): Promise<void> {
    await this.secrets.store(`conn:${id}:sshPassphrase`, passphrase)
  }

  async deleteAll(id: string): Promise<void> {
    await Promise.all([
      this.secrets.delete(`conn:${id}:password`),
      this.secrets.delete(`conn:${id}:sshPassword`),
      this.secrets.delete(`conn:${id}:sshPrivateKey`),
      this.secrets.delete(`conn:${id}:sshPassphrase`),
    ])
  }
}

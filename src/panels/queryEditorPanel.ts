import * as vscode from 'vscode'
import { randomUUID } from 'crypto'
import { PanelBase } from './PanelBase'
import type { ConnectionManager } from '../connection/connectionManager'

const HISTORY_MAX = 100

interface HistoryEntry {
  id: string
  sql: string
  executedAt: string
  executionTime?: number
  success?: boolean
}

function historyKey(connectionId: string): string {
  return `datapilot.queryHistory.${connectionId}`
}

export class QueryEditorPanel extends PanelBase {
  static open(
    extensionUri: vscode.Uri,
    connectionId: string,
    connectionName: string,
    connectionManager: ConnectionManager,
    context: vscode.ExtensionContext
  ): QueryEditorPanel {
    return new QueryEditorPanel(extensionUri, connectionId, connectionName, connectionManager, context)
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly connectionId: string,
    connectionName: string,
    private readonly connectionManager: ConnectionManager,
    private readonly context: vscode.ExtensionContext
  ) {
    super('datapilot.queryEditor', `Query — ${connectionName}`, extensionUri, 'queryEditor')
  }

  protected onMessage(message: { type: string; payload?: unknown }): void {
    switch (message.type) {
      case 'webview:ready': {
        const conn = this.connectionManager.getById(this.connectionId)
        this.post('webview:ready:response', { dbType: conn?.dbType ?? 'postgresql' })
        break
      }
      case 'db:execute-query':
        this.handleExecuteQuery(message.payload as { sql: string })
        break
      case 'db:execute-query-batch':
        this.handleExecuteQueryBatch(
          message.payload as { sqls: string[]; stopOnError: boolean; useTransaction?: boolean }
        )
        break
      case 'query:cancel':
        this.handleCancelQuery()
        break
      case 'query:explain':
        this.handleExplainQuery(message.payload as { sql: string })
        break
      case 'history:add':
        this.handleHistoryAdd(message.payload as { sql: string; executionTime?: number; success?: boolean })
        break
      case 'history:list':
        this.handleHistoryList()
        break
      case 'db:completion-schema':
        this.handleCompletionSchema(message.payload as { schemaName?: string } | undefined)
        break
    }
  }

  private async handleExecuteQuery(payload: { sql: string }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const result = await driver.executeQuery(payload.sql)
      this.post('db:execute-query:response', result)
    } catch (err) {
      this.post('db:execute-query:response', {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async handleExecuteQueryBatch(payload: {
    sqls: string[]
    stopOnError: boolean
    useTransaction?: boolean
  }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const result = await driver.executeQueryBatch(
        payload.sqls,
        payload.stopOnError,
        payload.useTransaction
      )
      this.post('db:execute-query-batch:response', result)
    } catch (err) {
      this.post('db:execute-query-batch:response', {
        results: [{ ok: false, message: err instanceof Error ? err.message : String(err), executionTime: 0 }],
      })
    }
  }

  private async handleCancelQuery(): Promise<void> {
    try {
      const driver = this.connectionManager.getActiveDriver(this.connectionId)
      if (!driver) {
        this.post('query:cancel:response', { ok: false })
        return
      }
      const result = await driver.cancelQuery()
      this.post('query:cancel:response', result)
    } catch (err) {
      this.post('query:cancel:response', { ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  private async handleExplainQuery(payload: { sql: string }): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const result = await driver.explainQuery(payload.sql)
      this.post('query:explain:response', result)
    } catch (err) {
      this.post('query:explain:response', {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async handleHistoryAdd(payload: { sql: string; executionTime?: number; success?: boolean }): Promise<void> {
    const key = historyKey(this.connectionId)
    const history = this.context.globalState.get<HistoryEntry[]>(key, [])
    const entry: HistoryEntry = {
      id: randomUUID(),
      sql: payload.sql,
      executedAt: new Date().toISOString(),
      executionTime: payload.executionTime,
      success: payload.success,
    }
    const updated = [entry, ...history].slice(0, HISTORY_MAX)
    await this.context.globalState.update(key, updated)
    this.post('history:add:response', {})
  }

  private handleHistoryList(): void {
    const key = historyKey(this.connectionId)
    const history = this.context.globalState.get<HistoryEntry[]>(key, [])
    this.post('history:list:response', history)
  }

  private async handleCompletionSchema(payload: { schemaName?: string } | undefined): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const schema = await driver.getCompletionSchema(payload?.schemaName)
      this.post('db:completion-schema:response', schema)
    } catch (err) {
      this.post('db:completion-schema:response', {})
    }
  }
}

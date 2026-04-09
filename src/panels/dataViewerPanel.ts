import * as vscode from 'vscode'
import { PanelBase } from './PanelBase'
import type { ConnectionManager } from '../connection/connectionManager'
import type { SelectAllParams, DataChangesParams } from '../connection/types'

export class DataViewerPanel extends PanelBase {
  static open(
    extensionUri: vscode.Uri,
    connectionId: string,
    connectionName: string,
    schemaName: string,
    tableName: string,
    tableType: 'table' | 'view' | 'matview',
    connectionManager: ConnectionManager
  ): DataViewerPanel {
    return new DataViewerPanel(
      extensionUri,
      connectionId,
      connectionName,
      schemaName,
      tableName,
      tableType,
      connectionManager
    )
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly connectionId: string,
    connectionName: string,
    private readonly schemaName: string,
    private readonly tableName: string,
    private readonly tableType: 'table' | 'view' | 'matview',
    private readonly connectionManager: ConnectionManager
  ) {
    super('data-rover.dataViewer', `${tableName} — ${connectionName}`, extensionUri, 'dataViewer')
  }

  protected onMessage(message: { type: string; payload?: unknown }): void {
    switch (message.type) {
      case 'webview:ready':
        this.post('webview:ready:response', {
          schemaName: this.schemaName,
          tableName: this.tableName,
          tableType: this.tableType,
        })
        break
      case 'db:select-all':
        this.handleSelectAll(message.payload as SelectAllParams & { schemaName?: string; tableName?: string })
        break
      case 'db:data-changes':
        this.handleDataChanges(message.payload as DataChangesParams)
        break
    }
  }

  private async handleSelectAll(
    payload: SelectAllParams & { schemaName?: string; tableName?: string }
  ): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const result = await driver.selectAll(
        payload.schemaName ?? this.schemaName,
        payload.tableName ?? this.tableName,
        {
          limit: payload.limit,
          offset: payload.offset,
          orderBy: payload.orderBy,
          search: payload.search,
        }
      )
      this.post('db:select-all:response', result)
    } catch (err) {
      this.post('db:select-all:response', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async handleDataChanges(payload: DataChangesParams): Promise<void> {
    try {
      const driver = await this.connectionManager.connect(this.connectionId)
      const result = await driver.executeDataChanges(payload)
      this.post('db:data-changes:response', result)
    } catch (err) {
      this.post('db:data-changes:response', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

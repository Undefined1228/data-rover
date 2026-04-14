<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { api } from '$shared/api'
  import type { ColumnInfo } from './types'

  let {
    schemaName,
    tableName,
    tableColumns,
    dbType,
  }: {
    schemaName: string
    tableName: string
    tableColumns: ColumnInfo[]
    dbType: string
  } = $props()

  type Step = 'idle' | 'preview' | 'mapping' | 'importing' | 'done' | 'error'

  let step = $state<Step>('idle')
  let filePath = $state<string | null>(null)
  let headers = $state<string[]>([])
  let previewRows = $state<Record<string, string>[]>([])
  let totalEstimated = $state(0)
  let columnMapping = $state<Record<string, string | null>>({})
  let done = $state(0)
  let insertedCount = $state(0)
  let errorMsg = $state<string | null>(null)

  const columnTypes = $derived(
    Object.fromEntries(tableColumns.map((c) => [c.name, c.dataType]))
  )

  const unmappedRequired = $derived(
    tableColumns
      .filter((c) => !c.nullable && c.defaultValue === null && !c.isPrimaryKey)
      .filter((c) => !Object.values(columnMapping).includes(c.name))
  )

  const canImport = $derived(unmappedRequired.length === 0)

  let offProgress: (() => void) | null = null

  onMount(async () => {
    try {
      const res = await api.request<{ filePath: string | null }>('csv:pick-file')
      if (!res.filePath) {
        window.close()
        return
      }
      filePath = res.filePath
      step = 'preview'

      const prev = await api.request<{
        headers?: string[]
        preview?: Record<string, string>[]
        totalEstimated?: number
        error?: string
      }>('csv:preview', res.filePath)

      if (prev.error) {
        errorMsg = prev.error
        step = 'error'
        return
      }

      headers = prev.headers ?? []
      previewRows = prev.preview ?? []
      totalEstimated = prev.totalEstimated ?? 0

      // 이름 일치 자동 매핑
      const mapping: Record<string, string | null> = {}
      for (const h of headers) {
        const match = tableColumns.find((c) => c.name.toLowerCase() === h.toLowerCase())
        mapping[h] = match?.name ?? null
      }
      columnMapping = mapping
      step = 'mapping'
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err)
      step = 'error'
    }
  })

  onDestroy(() => {
    offProgress?.()
  })

  async function handleImport(): Promise<void> {
    if (!filePath) return
    step = 'importing'
    done = 0

    offProgress = api.on('csv:progress', (payload) => {
      const p = payload as { done: number }
      done = p.done
    })

    try {
      const res = await api.request<{ inserted?: number; error?: string }>('csv:import', {
        schemaName,
        tableName,
        filePath,
        columnMapping: { ...columnMapping },
        columnTypes: { ...columnTypes },
        dbType,
      })

      offProgress?.()
      offProgress = null

      if (res.error) {
        errorMsg = res.error
        step = 'error'
      } else {
        insertedCount = res.inserted ?? done
        step = 'done'
      }
    } catch (err) {
      offProgress?.()
      offProgress = null
      errorMsg = err instanceof Error ? err.message : String(err)
      step = 'error'
    }
  }

  function handleRetry(): void {
    errorMsg = null
    step = 'mapping'
  }

  const progressPercent = $derived(
    totalEstimated > 0 ? Math.min(100, Math.round((done / totalEstimated) * 100)) : 0
  )
</script>

<div class="dialog-root">
  <div class="dialog-header">
    <h2>CSV 가져오기</h2>
    <p><span class="mono">{schemaName}.{tableName}</span> 테이블로 CSV 데이터를 가져옵니다.</p>
  </div>

  <div class="dialog-body">
    {#if step === 'idle' || step === 'preview'}
      <div class="loading-wrap">
        <span class="loading-icon">⋯</span>
        <span>{step === 'idle' ? '파일 선택 중...' : '미리보기 로딩 중...'}</span>
      </div>
    {:else if step === 'mapping'}
      {#if previewRows.length > 0}
        <div class="section-title">미리보기 (상위 {previewRows.length}행)</div>
        <div class="preview-table-wrap">
          <table class="preview-table">
            <thead>
              <tr>
                {#each headers as h}
                  <th>{h}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each previewRows as row}
                <tr>
                  {#each headers as h}
                    <td>{row[h] ?? ''}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="section-title">컬럼 매핑</div>
      <div class="mapping-table">
        <div class="mapping-header">
          <span>CSV 헤더</span>
          <span>테이블 컬럼</span>
        </div>
        {#each headers as h}
          <div class="mapping-row">
            <span class="mono-sm">{h}</span>
            <select
              class="form-select"
              value={columnMapping[h] ?? ''}
              onchange={(e) => {
                columnMapping[h] = (e.target as HTMLSelectElement).value || null
              }}
            >
              <option value="">(무시)</option>
              {#each tableColumns as col}
                <option value={col.name}>
                  {col.name} · {col.dataType}{col.nullable ? '' : ' *'}
                </option>
              {/each}
            </select>
          </div>
        {/each}
      </div>

      {#if unmappedRequired.length > 0}
        <div class="warning-box">
          필수 컬럼이 매핑되지 않았습니다:
          {unmappedRequired.map((c) => c.name).join(', ')}
        </div>
      {/if}
    {:else if step === 'importing'}
      <div class="importing-wrap">
        <div class="progress-label">
          {done.toLocaleString()}행 삽입 중
          {#if totalEstimated > 0}/ 약 {totalEstimated.toLocaleString()}행{/if}
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: {progressPercent}%"></div>
        </div>
        <div class="progress-pct">{progressPercent}%</div>
      </div>
    {:else if step === 'done'}
      <div class="done-wrap">
        <div class="done-icon">✓</div>
        <div class="done-text">{insertedCount.toLocaleString()}행을 삽입했습니다.</div>
      </div>
    {:else if step === 'error'}
      <div class="error-box">{errorMsg}</div>
    {/if}
  </div>

  <div class="dialog-footer">
    {#if step === 'mapping'}
      <button class="btn btn-primary" onclick={handleImport} disabled={!canImport}>
        가져오기
      </button>
    {:else if step === 'error'}
      <button class="btn btn-secondary" onclick={handleRetry}>다시 시도</button>
    {/if}
  </div>
</div>

<style>
  .dialog-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 560px;
    margin: 0 auto;
    padding: 0 16px;
    font-size: 13px;
    color: var(--vscode-foreground);
  }

  .dialog-header {
    flex-shrink: 0;
    padding: 16px 0 12px;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  }

  .dialog-header h2 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
  }

  .dialog-header p {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .mono {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
  }

  .mono-sm {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog-body {
    flex: 1;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    letter-spacing: 0.05em;
  }

  .loading-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    padding: 16px 0;
  }

  .loading-icon {
    font-size: 18px;
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.3 }
    50% { opacity: 1 }
  }

  .preview-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 2px;
    max-height: 140px;
    overflow-y: auto;
  }

  .preview-table {
    border-collapse: collapse;
    font-size: 11px;
    width: max-content;
    min-width: 100%;
  }

  .preview-table th,
  .preview-table td {
    padding: 3px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.15));
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preview-table th {
    background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.1));
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    position: sticky;
    top: 0;
  }

  .preview-table tr:last-child td {
    border-bottom: none;
  }

  .mapping-table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 2px;
    overflow: hidden;
  }

  .mapping-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 5px 8px;
    background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.1));
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }

  .mapping-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
    font-size: 12px;
  }

  .mapping-row:last-child {
    border-bottom: none;
  }

  .form-select {
    height: 24px;
    padding: 0 6px;
    font-size: 11px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
    cursor: pointer;
  }

  .form-select:focus {
    border-color: var(--vscode-focusBorder);
  }

  .warning-box {
    padding: 8px 10px;
    font-size: 12px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #f0ad4e) 12%, transparent);
    color: var(--vscode-editorWarning-foreground, #f0ad4e);
    border: 1px solid color-mix(in srgb, var(--vscode-editorWarning-foreground, #f0ad4e) 40%, transparent);
  }

  .error-box {
    padding: 8px 10px;
    font-size: 12px;
    border-radius: 3px;
    background: var(--vscode-inputValidation-errorBackground, rgba(220, 53, 69, 0.1));
    color: var(--vscode-errorForeground, #dc3545);
    border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(220, 53, 69, 0.4));
  }

  .importing-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 0;
  }

  .progress-label {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .progress-bar-bg {
    height: 6px;
    background: var(--vscode-progressBar-background, rgba(128,128,128,0.2));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: var(--vscode-button-background);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .progress-pct {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  .done-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 0;
  }

  .done-icon {
    font-size: 32px;
    color: var(--vscode-testing-iconPassed, #4caf50);
  }

  .done-text {
    font-size: 13px;
    font-weight: 500;
  }

  .dialog-footer {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 10px 0 16px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    gap: 8px;
  }

  .btn {
    height: 26px;
    padding: 0 14px;
    font-size: 12px;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }

  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }
</style>

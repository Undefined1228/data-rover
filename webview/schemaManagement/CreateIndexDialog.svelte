<script lang="ts">
  import { api } from '$shared/api'
  import type { ColumnInfo } from './types'

  let {
    schemaName,
    tableName,
    tableColumns,
  }: {
    schemaName: string
    tableName: string
    tableColumns: ColumnInfo[]
  } = $props()

  const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/
  const METHODS = ['btree', 'hash', 'gin', 'gist', 'brin']

  interface IndexColumn {
    name: string
    order: 'ASC' | 'DESC'
    selected: boolean
  }

  let indexName = $state('')
  let unique = $state(false)
  let method = $state('btree')
  let indexColumns = $state<IndexColumn[]>(
    tableColumns.map((c) => ({ name: c.name, order: 'ASC' as const, selected: false }))
  )
  let indexNameError = $state(false)
  let columnsError = $state(false)
  let saving = $state(false)
  let error = $state<string | null>(null)

  function moveUp(i: number): void {
    if (i === 0) return
    const arr = [...indexColumns]
    ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
    indexColumns = arr
  }

  function moveDown(i: number): void {
    if (i === indexColumns.length - 1) return
    const arr = [...indexColumns]
    ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
    indexColumns = arr
  }

  function validate(): boolean {
    let valid = true
    if (!indexName.trim() || !IDENT_RE.test(indexName.trim())) {
      indexNameError = true
      valid = false
    }
    if (!indexColumns.some((c) => c.selected)) {
      columnsError = true
      valid = false
    }
    return valid
  }

  async function handleCreate(): Promise<void> {
    if (!validate()) return
    saving = true
    error = null
    try {
      const selectedCols = indexColumns
        .filter((c) => c.selected)
        .map((c) => ({ name: c.name, order: c.order }))
      const data = await api.request<{ ok: boolean; message?: string }>('index:create', {
        schemaName,
        tableName,
        indexName: indexName.trim(),
        columns: selectedCols,
        unique,
        method,
      })
      if (!data.ok) error = data.message ?? '생성 실패'
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      saving = false
    }
  }
</script>

<div class="dialog-root">
  <div class="dialog-header">
    <h2>인덱스 생성</h2>
    <p><span class="mono">{schemaName}.{tableName}</span> 테이블에 인덱스를 생성합니다.</p>
  </div>

  <div class="dialog-body">
    <div class="form-row">
      <label class="form-label" for="index-name">인덱스 이름 *</label>
      <div class="form-control">
        <input
          id="index-name"
          class="form-input {indexNameError ? 'input-error' : ''}"
          bind:value={indexName}
          oninput={() => (indexNameError = false)}
          placeholder="idx_table_column"
        />
        {#if indexNameError}
          <p class="error-text">영문자/밑줄로 시작하고 영문자·숫자·밑줄·$만 사용 가능합니다.</p>
        {/if}
      </div>
    </div>

    <div class="form-row">
      <label class="form-label" for="index-method">메서드</label>
      <select id="index-method" class="form-select" bind:value={method}>
        {#each METHODS as m}
          <option value={m}>{m}</option>
        {/each}
      </select>
    </div>

    <div class="form-row form-row-center">
      <label class="form-label" for="index-unique">UNIQUE</label>
      <input id="index-unique" type="checkbox" class="form-checkbox" bind:checked={unique} />
    </div>

    <div class="column-section">
      <div class="column-label-row">
        <span class="form-label-inline">컬럼 선택 *</span>
        {#if columnsError}
          <span class="error-text">컬럼을 하나 이상 선택하세요.</span>
        {/if}
      </div>
      <div class="column-table">
        <div class="column-header">
          <span></span>
          <span>컬럼</span>
          <span>정렬</span>
          <span class="text-center">순서</span>
        </div>
        <div class="column-body">
          {#each indexColumns as col, i}
            <div class="column-row {col.selected ? 'row-selected' : ''}">
              <input
                type="checkbox"
                class="form-checkbox"
                checked={col.selected}
                onchange={(e) => {
                  indexColumns[i].selected = (e.target as HTMLInputElement).checked
                  columnsError = false
                }}
              />
              <span class="col-name">{col.name}</span>
              {#if col.selected}
                <select
                  class="form-select form-select-sm"
                  value={col.order}
                  onchange={(e) => { indexColumns[i].order = (e.target as HTMLSelectElement).value as 'ASC' | 'DESC' }}
                >
                  <option value="ASC">ASC</option>
                  <option value="DESC">DESC</option>
                </select>
              {:else}
                <span></span>
              {/if}
              <div class="order-btns">
                <button
                  class="order-btn"
                  disabled={i === 0}
                  onclick={() => moveUp(i)}
                  title="위로"
                >▲</button>
                <button
                  class="order-btn"
                  disabled={i === indexColumns.length - 1}
                  onclick={() => moveDown(i)}
                  title="아래로"
                >▼</button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  <div class="dialog-footer">
    <button class="btn btn-primary" onclick={handleCreate} disabled={saving}>
      {saving ? '생성 중...' : '생성'}
    </button>
  </div>
</div>

<style>
  .dialog-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 420px;
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

  .dialog-body {
    flex: 1;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .form-row {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: start;
    gap: 8px;
  }

  .form-row-center {
    align-items: center;
  }

  .form-label {
    text-align: right;
    font-size: 12px;
    padding-top: 5px;
    color: var(--vscode-foreground);
    white-space: nowrap;
  }

  .form-control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-input,
  .form-select {
    height: 26px;
    padding: 0 8px;
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .form-input:focus,
  .form-select:focus {
    border-color: var(--vscode-focusBorder);
  }

  .form-input.input-error {
    border-color: var(--vscode-inputValidation-errorBorder);
  }

  .form-select {
    cursor: pointer;
  }

  .form-select-sm {
    height: 22px;
    font-size: 11px;
    padding: 0 4px;
    width: auto;
  }

  .form-checkbox {
    margin: 0;
    cursor: pointer;
    accent-color: var(--vscode-focusBorder);
  }

  .column-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .column-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-label-inline {
    font-size: 12px;
    color: var(--vscode-foreground);
  }

  .column-table {
    border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));
    border-radius: 2px;
    overflow: hidden;
  }

  .column-header {
    display: grid;
    grid-template-columns: 1.5rem 1fr 5rem 3.5rem;
    gap: 4px;
    padding: 5px 8px;
    background: var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.1));
    font-size: 11px;
    font-weight: 600;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
  }

  .text-center {
    text-align: center;
  }

  .column-body {
    max-height: 200px;
    overflow-y: auto;
  }

  .column-row {
    display: grid;
    grid-template-columns: 1.5rem 1fr 5rem 3.5rem;
    gap: 4px;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.1));
    font-size: 12px;
  }

  .column-row:last-child {
    border-bottom: none;
  }

  .column-row:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .column-row.row-selected {
    background: color-mix(in srgb, var(--vscode-focusBorder) 8%, transparent);
  }

  .col-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .order-btns {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }

  .order-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    font-size: 9px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .order-btn:hover:not(:disabled) {
    background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.2));
    color: var(--vscode-foreground);
  }

  .order-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .error-text {
    font-size: 11px;
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground));
  }

  .error-box {
    padding: 8px 10px;
    font-size: 12px;
    border-radius: 3px;
    background: var(--vscode-inputValidation-errorBackground, rgba(220, 53, 69, 0.1));
    color: var(--vscode-errorForeground, #dc3545);
    border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(220, 53, 69, 0.4));
    margin-bottom: 8px;
  }

  .dialog-footer {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 10px 0 16px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
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
</style>

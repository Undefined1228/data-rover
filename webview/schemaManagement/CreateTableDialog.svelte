<script lang="ts">
  import { api } from '$shared/api'
  import ColumnEditor from './ColumnEditor.svelte'
  import type { ColumnDef } from './types'

  let { schemaName, dbType }: { schemaName: string; dbType: string } = $props()

  const isMysql = dbType === 'mysql' || dbType === 'mariadb'

  const PG_TYPE_GROUPS = [
    { group: '정수', types: ['integer', 'bigint', 'smallint', 'serial', 'bigserial'] },
    { group: '실수', types: ['numeric', 'real', 'double precision'] },
    { group: '문자', types: ['text', 'varchar', 'char'] },
    { group: '날짜/시간', types: ['date', 'time', 'timestamp', 'timestamptz', 'interval'] },
    { group: '기타', types: ['boolean', 'uuid', 'json', 'jsonb', 'bytea'] },
  ]
  const MYSQL_TYPE_GROUPS = [
    { group: '정수', types: ['int', 'bigint', 'smallint', 'tinyint', 'int auto_increment', 'bigint auto_increment'] },
    { group: '실수', types: ['decimal', 'float', 'double'] },
    { group: '문자', types: ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'] },
    { group: '날짜/시간', types: ['date', 'time', 'datetime', 'timestamp'] },
    { group: '기타', types: ['tinyint(1)', 'json', 'blob'] },
  ]
  const TYPE_GROUPS = isMysql ? MYSQL_TYPE_GROUPS : PG_TYPE_GROUPS
  const SIZE_TYPES = isMysql ? new Set(['varchar', 'char', 'decimal']) : new Set(['varchar', 'char', 'numeric'])

  const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/

  let tableName = $state('')
  let columns = $state<ColumnDef[]>([makeColumn()])
  let tableNameError = $state(false)
  let columnErrors = $state<Set<number>>(new Set())
  let activeTab = $state<'columns' | 'ddl'>('columns')
  let ddlPreview = $state('')
  let loadingDDL = $state(false)
  let saving = $state(false)
  let error = $state<string | null>(null)

  function makeColumn(): ColumnDef {
    return {
      id: crypto.randomUUID(),
      name: '',
      type: isMysql ? 'varchar' : 'varchar',
      size: '255',
      nullable: true,
      primaryKey: false,
      defaultValue: '',
    }
  }

  function addColumn(): void {
    columns = [...columns, makeColumn()]
  }

  function removeColumn(idx: number): void {
    columns = columns.filter((_, i) => i !== idx)
    columnErrors.delete(idx)
    columnErrors = new Set(columnErrors)
  }

  function togglePrimaryKey(idx: number): void {
    columns[idx].primaryKey = !columns[idx].primaryKey
    if (columns[idx].primaryKey) columns[idx].nullable = false
  }

  function onTypeChange(idx: number, type: string): void {
    columns[idx].type = type
    if (type === 'varchar') columns[idx].size = '255'
    else if (type === 'char') columns[idx].size = '1'
    else if (type === 'numeric' || type === 'decimal') columns[idx].size = '10,2'
    else columns[idx].size = ''
    columnErrors.delete(idx)
    columnErrors = new Set(columnErrors)
  }

  async function onTabChange(tab: 'columns' | 'ddl'): Promise<void> {
    activeTab = tab
    if (tab === 'ddl') await fetchDDL()
  }

  async function fetchDDL(): Promise<void> {
    loadingDDL = true
    try {
      const data = await api.request<{ ddl: string }>('table:preview-ddl', {
        dbType,
        params: {
          schemaName,
          tableName: tableName.trim() || 'my_table',
          columns: columns.map((c) => ({
            name: c.name || 'column',
            type: c.type,
            size: c.size,
            nullable: c.nullable,
            primaryKey: c.primaryKey,
            defaultValue: c.defaultValue,
          })),
          foreignKeys: [],
        },
      })
      ddlPreview = data.ddl
    } catch {
      ddlPreview = ''
    } finally {
      loadingDDL = false
    }
  }

  function validate(): boolean {
    let valid = true
    if (!tableName.trim() || !IDENT_RE.test(tableName)) {
      tableNameError = true
      valid = false
    }
    const errs = new Set<number>()
    columns.forEach((col, i) => {
      if (!col.name.trim() || !IDENT_RE.test(col.name)) {
        errs.add(i)
        valid = false
      }
    })
    columnErrors = errs
    return valid
  }

  async function handleCreate(): Promise<void> {
    if (!validate()) return
    saving = true
    error = null
    try {
      const data = await api.request<{ ok: boolean; message?: string }>('table:create', {
        schemaName,
        tableName: tableName.trim(),
        columns: columns.map((c) => ({
          name: c.name.trim(),
          type: c.type,
          size: c.size,
          nullable: c.nullable,
          primaryKey: c.primaryKey,
          defaultValue: c.defaultValue,
        })),
        foreignKeys: [],
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
    <h2>테이블 생성</h2>
    <p><code>{schemaName}</code> 스키마에 새 테이블을 생성합니다.</p>
  </div>

  <div class="dialog-body">
    <div class="name-row">
      <label class="form-label" for="table-name">테이블 이름 *</label>
      <div class="form-control">
        <input
          id="table-name"
          class="form-input {tableNameError ? 'input-error' : ''}"
          bind:value={tableName}
          oninput={() => (tableNameError = false)}
          placeholder="my_table"
        />
        {#if tableNameError}
          <p class="error-text">영문자/밑줄로 시작하고 영문자·숫자·밑줄·$만 사용 가능합니다.</p>
        {/if}
      </div>
    </div>

    <div class="tabs">
      <div class="tab-bar">
        <button class="tab-btn {activeTab === 'columns' ? 'active' : ''}" onclick={() => onTabChange('columns')}>
          컬럼 ({columns.length})
        </button>
        <button class="tab-btn {activeTab === 'ddl' ? 'active' : ''}" onclick={() => onTabChange('ddl')}>
          DDL 미리보기
        </button>
        {#if activeTab === 'columns'}
          <button class="add-col-btn" onclick={addColumn}>+ 컬럼 추가</button>
        {/if}
      </div>

      {#if activeTab === 'columns'}
        <div class="table-wrap">
          <table class="col-table">
            <thead>
              <tr>
                <th class="th-name">이름 *</th>
                <th class="th-type">타입</th>
                <th class="th-size">크기/정밀도</th>
                <th class="th-check">PK</th>
                <th class="th-check">NULL</th>
                <th class="th-default">기본값</th>
                <th class="th-action"></th>
              </tr>
            </thead>
            <tbody>
              {#each columns as col, idx (col.id)}
                <ColumnEditor
                  bind:col={columns[idx]}
                  {idx}
                  typeGroups={TYPE_GROUPS}
                  sizeTypes={SIZE_TYPES}
                  hasError={columnErrors.has(idx)}
                  canDelete={columns.length > 1}
                  {onTypeChange}
                  onRemove={removeColumn}
                  onTogglePrimaryKey={togglePrimaryKey}
                  onNameInput={(i) => { columnErrors.delete(i); columnErrors = new Set(columnErrors) }}
                />
              {/each}
            </tbody>
          </table>
        </div>
        {#if columnErrors.size > 0}
          <p class="error-text">컬럼 이름은 영문자/밑줄로 시작하고 영문자·숫자·밑줄·$만 사용 가능합니다.</p>
        {/if}
      {:else}
        <div class="ddl-preview">
          {#if loadingDDL}
            <span class="muted-text">로딩 중...</span>
          {:else if ddlPreview}
            <pre class="ddl-code">{ddlPreview}</pre>
          {:else}
            <span class="muted-text">DDL이 없습니다.</span>
          {/if}
        </div>
      {/if}
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
    padding: 0 16px;
    font-size: 13px;
    color: var(--vscode-foreground);
  }

  .dialog-header {
    flex-shrink: 0;
    padding: 14px 0 10px;
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

  .dialog-header code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
  }

  .dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }

  .name-row {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: start;
    gap: 8px;
  }

  .form-label {
    text-align: right;
    font-size: 12px;
    padding-top: 5px;
    white-space: nowrap;
  }

  .form-control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-input {
    height: 26px;
    padding: 0 8px;
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    outline: none;
    box-sizing: border-box;
  }

  .form-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .input-error {
    border-color: var(--vscode-inputValidation-errorBorder);
  }

  .tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    min-height: 0;
  }

  .tab-bar {
    display: flex;
    align-items: center;
    gap: 0;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    margin-bottom: 0;
  }

  .tab-btn {
    height: 28px;
    padding: 0 12px;
    font-size: 12px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    margin-bottom: -1px;
  }

  .tab-btn.active {
    color: var(--vscode-foreground);
    border-bottom-color: var(--vscode-focusBorder);
  }

  .tab-btn:hover:not(.active) {
    color: var(--vscode-foreground);
  }

  .add-col-btn {
    margin-left: auto;
    height: 24px;
    padding: 0 10px;
    font-size: 11px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
  }

  .add-col-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    border-radius: 2px;
    margin-top: 8px;
  }

  .col-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .col-table thead {
    background: var(--vscode-editor-lineHighlightBackground, rgba(128,128,128,0.07));
  }

  .col-table th {
    padding: 5px 4px;
    text-align: left;
    font-size: 11px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    white-space: nowrap;
  }

  .th-name { min-width: 130px; }
  .th-type { width: 160px; }
  .th-size { width: 100px; }
  .th-check { width: 44px; text-align: center; }
  .th-default { width: 100px; }
  .th-action { width: 28px; }

  .ddl-preview {
    flex: 1;
    padding: 10px 0;
    min-height: 0;
  }

  .ddl-code {
    margin: 0;
    padding: 10px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    background: var(--vscode-textBlockQuote-background, rgba(128,128,128,0.07));
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    border-radius: 2px;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--vscode-foreground);
  }

  .muted-text {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
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
    flex-shrink: 0;
  }

  .dialog-footer {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 10px 0 14px;
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

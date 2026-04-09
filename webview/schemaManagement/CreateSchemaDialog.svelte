<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '$shared/api'

  const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/

  let schemaName = $state('')
  let owner = $state('')
  let roles = $state<string[]>([])
  let loadingRoles = $state(true)
  let saving = $state(false)
  let error = $state<string | null>(null)
  let nameError = $state(false)

  onMount(async () => {
    try {
      const data = await api.request<{ roles: string[] }>('db:roles')
      roles = data.roles
    } catch {
      roles = []
    } finally {
      loadingRoles = false
    }
  })

  function validate(): boolean {
    if (!schemaName.trim() || !IDENT_RE.test(schemaName)) {
      nameError = true
      return false
    }
    return true
  }

  async function handleCreate(): Promise<void> {
    if (!validate()) return
    saving = true
    error = null
    try {
      const data = await api.request<{ ok: boolean; message?: string }>('schema:create', {
        name: schemaName.trim(),
        owner: owner || undefined,
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
    <h2>스키마 추가</h2>
    <p>새 PostgreSQL 스키마를 생성합니다.</p>
  </div>

  <div class="dialog-body">
    <div class="form-row">
      <label class="form-label" for="schema-name">스키마 이름 *</label>
      <div class="form-control">
        <input
          id="schema-name"
          class="form-input {nameError ? 'input-error' : ''}"
          bind:value={schemaName}
          oninput={() => (nameError = false)}
          placeholder="my_schema"
        />
        {#if nameError}
          <p class="error-text">영문자/밑줄로 시작하고 영문자·숫자·밑줄·$만 사용 가능합니다.</p>
        {/if}
      </div>
    </div>

    <div class="form-row">
      <label class="form-label" for="schema-owner">소유자</label>
      {#if loadingRoles}
        <span class="muted-text">로딩 중...</span>
      {:else}
        <select id="schema-owner" class="form-select" bind:value={owner}>
          <option value="">현재 사용자 (기본값)</option>
          {#each roles as role}
            <option value={role}>{role}</option>
          {/each}
        </select>
      {/if}
    </div>
  </div>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  <div class="dialog-footer">
    <button class="btn btn-primary" onclick={handleCreate} disabled={saving || loadingRoles}>
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

  .dialog-body {
    flex: 1;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: start;
    gap: 8px;
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

  .muted-text {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    padding-top: 5px;
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

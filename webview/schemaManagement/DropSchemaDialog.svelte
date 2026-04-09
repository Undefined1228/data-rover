<script lang="ts">
  import { api } from '$shared/api'

  let { schemaName }: { schemaName: string } = $props()

  let cascade = $state(false)
  let dropping = $state(false)
  let error = $state<string | null>(null)

  async function handleDrop(): Promise<void> {
    dropping = true
    error = null
    try {
      const data = await api.request<{ ok: boolean; message?: string }>('schema:drop', {
        schema: schemaName,
        cascade,
      })
      if (!data.ok) error = data.message ?? '삭제 실패'
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      dropping = false
    }
  }
</script>

<div class="dialog-root">
  <div class="dialog-header">
    <h2>스키마 삭제</h2>
    <p>"{schemaName}" 스키마를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
  </div>

  <div class="dialog-body">
    <label class="checkbox-row">
      <input type="checkbox" bind:checked={cascade} />
      <span>포함된 모든 객체 함께 삭제 (CASCADE)</span>
    </label>

    {#if cascade}
      <div class="warn-box">스키마 내의 테이블, 뷰, 함수 등 모든 객체가 함께 삭제됩니다.</div>
    {/if}
  </div>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  <div class="dialog-footer">
    <button class="btn btn-danger" onclick={handleDrop} disabled={dropping}>
      {dropping ? '삭제 중...' : '삭제'}
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

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    cursor: pointer;
  }

  .checkbox-row input[type='checkbox'] {
    accent-color: var(--vscode-focusBorder);
    cursor: pointer;
  }

  .warn-box {
    padding: 8px 10px;
    font-size: 11px;
    border-radius: 3px;
    background: var(--vscode-inputValidation-errorBackground, rgba(220, 53, 69, 0.1));
    color: var(--vscode-errorForeground, #dc3545);
    border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(220, 53, 69, 0.4));
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

  .btn-danger {
    background: var(--vscode-errorForeground, #dc3545);
    color: #fff;
  }

  .btn-danger:hover:not(:disabled) {
    opacity: 0.85;
  }
</style>

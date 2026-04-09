<script lang="ts">
  import type { ColumnDef } from './types'

  let {
    col = $bindable(),
    idx,
    typeGroups,
    sizeTypes,
    hasError,
    canDelete,
    isNew = false,
    onTypeChange,
    onRemove,
    onTogglePrimaryKey,
    onNameInput,
  }: {
    col: ColumnDef
    idx: number
    typeGroups: { group: string; types: string[] }[]
    sizeTypes: Set<string>
    hasError: boolean
    canDelete: boolean
    isNew?: boolean
    onTypeChange: (idx: number, type: string) => void
    onRemove: (idx: number) => void
    onTogglePrimaryKey: (idx: number) => void
    onNameInput: (idx: number) => void
  } = $props()

  function sizePlaceholder(type: string): string {
    if (type === 'numeric' || type === 'decimal') return '10,2'
    return '255'
  }
</script>

<tr class="col-row {isNew ? 'col-row-new' : ''}">
  <td class="col-name-cell">
    <input
      class="col-input {hasError ? 'col-input-error' : ''}"
      bind:value={col.name}
      oninput={() => onNameInput(idx)}
      placeholder="column_name"
    />
  </td>
  <td class="col-type-cell">
    <select
      class="col-select"
      value={col.type}
      onchange={(e) => onTypeChange(idx, (e.target as HTMLSelectElement).value)}
    >
      {#each typeGroups as group}
        <optgroup label={group.group}>
          {#each group.types as type}
            <option value={type}>{type}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
  </td>
  <td class="col-size-cell">
    {#if sizeTypes.has(col.type)}
      <input class="col-input" bind:value={col.size} placeholder={sizePlaceholder(col.type)} />
    {:else}
      <span class="col-empty">—</span>
    {/if}
  </td>
  <td class="col-check-cell">
    <input type="checkbox" checked={col.primaryKey} onchange={() => onTogglePrimaryKey(idx)} />
  </td>
  <td class="col-check-cell">
    <input type="checkbox" bind:checked={col.nullable} disabled={col.primaryKey} />
  </td>
  <td class="col-default-cell">
    <input class="col-input" bind:value={col.defaultValue} placeholder="없음" />
  </td>
  <td class="col-action-cell">
    <button class="col-delete-btn" onclick={() => onRemove(idx)} disabled={!canDelete} title="삭제">✕</button>
  </td>
</tr>

<style>
  .col-row {
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  }

  .col-row:last-child {
    border-bottom: none;
  }

  .col-row-new {
    background: rgba(40, 167, 69, 0.06);
  }

  td {
    padding: 4px 4px;
    vertical-align: middle;
  }

  .col-name-cell { min-width: 130px; }
  .col-type-cell { width: 160px; }
  .col-size-cell { width: 100px; }
  .col-check-cell { width: 44px; text-align: center; }
  .col-default-cell { width: 100px; }
  .col-action-cell { width: 28px; text-align: center; }

  .col-input,
  .col-select {
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
  }

  .col-input:focus,
  .col-select:focus {
    border-color: var(--vscode-focusBorder);
  }

  .col-input-error {
    border-color: var(--vscode-inputValidation-errorBorder) !important;
  }

  .col-select {
    cursor: pointer;
  }

  .col-empty {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding: 0 6px;
  }

  .col-check-cell input[type='checkbox'] {
    accent-color: var(--vscode-focusBorder);
    cursor: pointer;
  }

  .col-delete-btn {
    height: 22px;
    width: 22px;
    padding: 0;
    font-size: 10px;
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .col-delete-btn:hover:not(:disabled) {
    background: var(--vscode-inputValidation-errorBackground, rgba(220, 53, 69, 0.15));
    color: var(--vscode-errorForeground, #dc3545);
  }

  .col-delete-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>

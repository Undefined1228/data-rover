<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '$shared/api'

  type ObjectItem = { schema: string; name: string; type: string }
  type ObjectState = ObjectItem & { ddl: string; error: string | null; checked: boolean }

  let { dbType }: { dbType: string } = $props()

  let loading = $state(true)
  let fetchError = $state<string | null>(null)
  let items = $state<ObjectState[]>([])
  let copied = $state(false)

  onMount(async () => {
    try {
      const result = await api.request<{
        results: Array<ObjectItem & { ddl?: string; error?: string }>
      }>('db:objects-ddl')
      items = result.results.map((r: ObjectItem & { ddl?: string; error?: string }) => ({
        schema: r.schema,
        name: r.name,
        type: r.type,
        ddl: r.ddl ?? '',
        error: r.error ?? null,
        checked: r.ddl !== undefined,
      }))
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  })

  function buildCombinedDDL(list: ObjectState[]): string {
    const checked = list.filter((i) => i.checked && i.ddl)
    if (checked.length === 0) return ''

    const nameSet = new Set(checked.map((i) => i.name))
    const deps = new Map<string, Set<string>>()
    for (const item of checked) {
      const refs = new Set<string>()
      const re = /REFERENCES\s+(?:[`"']?\w+[`"']?\.)?[`"']?(\w+)[`"']?\s*\(/gi
      let m: RegExpExecArray | null
      while ((m = re.exec(item.ddl)) !== null) {
        const ref = m[1]
        if (nameSet.has(ref) && ref !== item.name) refs.add(ref)
      }
      deps.set(item.name, refs)
    }

    const inDegree = new Map<string, number>()
    const graph = new Map<string, string[]>()
    for (const item of checked) {
      inDegree.set(item.name, 0)
      graph.set(item.name, [])
    }
    for (const [name, prereqs] of deps) {
      for (const prereq of prereqs) {
        graph.get(prereq)?.push(name)
        inDegree.set(name, (inDegree.get(name) ?? 0) + 1)
      }
    }

    const queue: string[] = []
    for (const item of checked) {
      if ((inDegree.get(item.name) ?? 0) === 0) queue.push(item.name)
    }

    const sorted: string[] = []
    while (queue.length > 0) {
      const curr = queue.shift()!
      sorted.push(curr)
      for (const next of graph.get(curr) ?? []) {
        const deg = (inDegree.get(next) ?? 1) - 1
        inDegree.set(next, deg)
        if (deg === 0) queue.push(next)
      }
    }

    for (const item of checked) {
      if (!sorted.includes(item.name)) sorted.push(item.name)
    }

    const ddlMap = new Map(checked.map((i) => [i.name, i.ddl]))
    return sorted
      .map((name) => ddlMap.get(name) ?? '')
      .filter(Boolean)
      .join('\n\n')
  }

  let combinedDDL = $derived(buildCombinedDDL(items))

  const checkableItems = $derived(items.filter((i) => !i.error))
  const allChecked = $derived(
    checkableItems.length > 0 && checkableItems.every((i) => i.checked)
  )

  function toggleAll(): void {
    const next = !allChecked
    items = items.map((i) => ({ ...i, checked: i.error ? false : next }))
  }

  function toggleItem(index: number): void {
    items = items.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
  }

  async function handleCopy(): Promise<void> {
    if (!combinedDDL) return
    await navigator.clipboard.writeText(combinedDDL)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }
</script>

<div class="dialog-root">
  <div class="dialog-header">
    <div class="header-row">
      <h2>DDL 보기</h2>
      {#if !loading && !fetchError && items.length > 1}
        <label class="select-all">
          <input
            type="checkbox"
            class="check-input"
            checked={allChecked}
            onchange={toggleAll}
          />
          <span>전체 선택</span>
        </label>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="status-row">DDL 불러오는 중...</div>
  {:else if fetchError}
    <div class="error-box">{fetchError}</div>
  {:else}
    {#if items.length > 1}
      <ul class="object-list">
        {#each items as item, i}
          <li class="object-item">
            <label class="object-label {item.error ? 'disabled' : ''}">
              <input
                type="checkbox"
                class="check-input"
                checked={item.checked}
                disabled={!!item.error}
                onchange={() => toggleItem(i)}
              />
              <span class="object-name">{item.schema}.{item.name}</span>
              <span class="object-type">{item.type}</span>
              {#if item.error}
                <span class="error-badge">오류</span>
              {/if}
            </label>
          </li>
        {/each}
      </ul>
    {:else if items.length === 1 && items[0].error}
      <div class="error-box">{items[0].error}</div>
    {/if}

    <div class="ddl-section">
      <textarea
        readonly
        class="ddl-textarea"
        value={combinedDDL}
        placeholder="선택한 오브젝트가 없습니다"
        spellcheck={false}
      ></textarea>
    </div>
  {/if}

  <div class="dialog-footer">
    <button
      class="btn btn-primary"
      onclick={handleCopy}
      disabled={loading || !!fetchError || !combinedDDL}
    >
      {copied ? '복사됨' : '클립보드 복사'}
    </button>
  </div>
</div>

<style>
  .dialog-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 600px;
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

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .select-all {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
  }

  .check-input {
    cursor: pointer;
    accent-color: var(--vscode-focusBorder);
  }

  .object-list {
    flex-shrink: 0;
    list-style: none;
    margin: 0;
    padding: 8px 0;
    max-height: 30vh;
    overflow-y: auto;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  }

  .object-item {
    padding: 2px 0;
  }

  .object-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: 3px 4px;
    border-radius: 2px;
    font-size: 12px;
  }

  .object-label:hover:not(.disabled) {
    background: var(--vscode-list-hoverBackground);
  }

  .object-label.disabled {
    opacity: 0.5;
    cursor: default;
  }

  .object-name {
    flex: 1;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .object-type {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-badge-background);
    padding: 1px 5px;
    border-radius: 2px;
  }

  .error-badge {
    font-size: 11px;
    color: var(--vscode-errorForeground);
    border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(220, 53, 69, 0.4));
    padding: 1px 5px;
    border-radius: 2px;
  }

  .status-row {
    padding: 24px 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
  }

  .error-box {
    padding: 8px 10px;
    font-size: 12px;
    border-radius: 3px;
    background: var(--vscode-inputValidation-errorBackground, rgba(220, 53, 69, 0.1));
    color: var(--vscode-errorForeground, #dc3545);
    border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(220, 53, 69, 0.4));
    margin: 12px 0;
  }

  .ddl-section {
    flex: 1;
    min-height: 0;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
  }

  .ddl-textarea {
    flex: 1;
    width: 100%;
    min-height: 0;
    resize: none;
    padding: 10px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    line-height: 1.6;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    outline: none;
    box-sizing: border-box;
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

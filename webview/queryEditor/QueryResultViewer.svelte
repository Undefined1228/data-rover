<script lang="ts">
  import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Search, X, Copy, TriangleAlert, Clipboard } from 'lucide-svelte'

  interface Props {
    columns: string[]
    rows: Record<string, unknown>[]
    columnTypes?: Record<string, string>
    status: 'idle' | 'running' | 'success' | 'error'
    error?: string | null
    executionTime?: number
    affectedRows?: number
    sql?: string
  }

  let { columns, rows, columnTypes, status, error, executionTime, affectedRows, sql }: Props = $props()

  function getCellClass(col: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return ''
    const type = columnTypes?.[col]
    if (type === 'boolean') {
      const isTrue = value === true || value === 1 || String(value).toLowerCase() === 'true'
      return isTrue ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
    }
    if (type === 'numeric') return 'text-right font-mono'
    if (type === 'datetime') return 'text-sky-600 dark:text-sky-400 font-mono text-[11px]'
    return ''
  }

  let warningDismissed = $state(false)

  $effect(() => {
    void sql
    warningDismissed = false
  })

  let showWarning = $derived(
    !warningDismissed &&
    status === 'success' &&
    columns.length > 0 &&
    !!sql &&
    /^\s*SELECT\b/i.test(sql) &&
    !/\bLIMIT\b/i.test(sql)
  )

  const PAGE_SIZE_OPTIONS = [100, 200, 500, 1000, 0]

  let searchQuery = $state('')
  let pageSize = $state(100)
  let currentPage = $state(1)
  let sortKeys = $state<{ col: string; dir: 'asc' | 'desc' }[]>([])
  let selectedRows = $state<Set<number>>(new Set())
  let colWidths = $state<Record<string, number>>({})
  let resizing = $state<{ col: string; startX: number; startWidth: number } | null>(null)
  let frozenCols = $state<string[]>([])
  let colContextMenu = $state<{ open: boolean; x: number; y: number; col: string }>({ open: false, x: 0, y: 0, col: '' })
  let jsonModal = $state<{ open: boolean; title: string; content: string }>({ open: false, title: '', content: '' })
  let jsonCopied = $state(false)
  let exportOpen = $state(false)

  let filteredRows = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      columns.some((col) => {
        const v = row[col]
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q)
      })
    )
  })

  let sortedRows = $derived.by(() => {
    if (sortKeys.length === 0) return filteredRows
    return [...filteredRows].sort((a, b) => {
      for (const { col, dir } of sortKeys) {
        const av = a[col]
        const bv = b[col]
        if (av === null || av === undefined) return dir === 'asc' ? -1 : 1
        if (bv === null || bv === undefined) return dir === 'asc' ? 1 : -1
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
  })

  let totalCount = $derived(sortedRows.length)
  let totalPages = $derived(pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalCount / pageSize)))

  let pagedRows = $derived.by(() => {
    if (pageSize === 0) return sortedRows
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  })

  let displayColumns = $derived([
    ...frozenCols.filter((c) => columns.includes(c)),
    ...columns.filter((c) => !frozenCols.includes(c)),
  ])

  let allPageSelected = $derived(
    pagedRows.length > 0 && pagedRows.every((_, i) => selectedRows.has(getRowGlobalIdx(i)))
  )

  function getRowGlobalIdx(pagedIdx: number): number {
    if (pageSize === 0) return pagedIdx
    return (currentPage - 1) * pageSize + pagedIdx
  }

  function formatExecutionTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function highlightText(text: string, query: string): string {
    const q = query.trim()
    if (!q) return escapeHtml(text)
    const lower = text.toLowerCase()
    const lowerQ = q.toLowerCase()
    const parts: string[] = []
    let last = 0
    let idx = lower.indexOf(lowerQ)
    while (idx !== -1) {
      parts.push(escapeHtml(text.slice(last, idx)))
      parts.push(`<mark class="rounded-sm bg-yellow-300/70 text-inherit dark:bg-yellow-500/50">${escapeHtml(text.slice(idx, idx + q.length))}</mark>`)
      last = idx + q.length
      idx = lower.indexOf(lowerQ, last)
    }
    parts.push(escapeHtml(text.slice(last)))
    return parts.join('')
  }

  function tryParseJson(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try { return JSON.stringify(JSON.parse(trimmed), null, 2) } catch { return null }
    }
    return null
  }

  function openJsonModal(col: string, value: unknown): void {
    const formatted = tryParseJson(value)
    if (!formatted) return
    jsonModal = { open: true, title: col, content: formatted }
    jsonCopied = false
  }

  async function copyJsonContent(): Promise<void> {
    await navigator.clipboard.writeText(jsonModal.content)
    jsonCopied = true
    setTimeout(() => { jsonCopied = false }, 1500)
  }

  function getOrderedFrozen(): string[] {
    return frozenCols.filter((c) => columns.includes(c))
  }

  function getFrozenStyle(col: string, zIndex: number = 1): string {
    const ordered = getOrderedFrozen()
    if (!ordered.includes(col)) return ''
    const fixedWidth = 40
    const left = fixedWidth + ordered.slice(0, ordered.indexOf(col)).reduce((sum, c) => sum + (colWidths[c] ?? 120), 0)
    return `position: sticky; left: ${left}px; z-index: ${zIndex};`
  }

  function isLastFrozen(col: string): boolean {
    const ordered = getOrderedFrozen()
    return ordered.length > 0 && ordered[ordered.length - 1] === col
  }

  function handleColClick(col: string): void {
    const idx = sortKeys.findIndex((k) => k.col === col)
    if (idx === -1) sortKeys = [...sortKeys, { col, dir: 'asc' }]
    else if (sortKeys[idx].dir === 'asc') sortKeys = sortKeys.map((k, i) => i === idx ? { ...k, dir: 'desc' } : k)
    else sortKeys = sortKeys.filter((_, i) => i !== idx)
    currentPage = 1
  }

  function handleColContextMenu(e: MouseEvent, col: string): void {
    e.preventDefault()
    colContextMenu = { open: true, x: e.clientX, y: e.clientY, col }
  }

  function closeColContextMenu(): void { colContextMenu = { ...colContextMenu, open: false } }

  function ctxSortAsc(col: string): void {
    const idx = sortKeys.findIndex((k) => k.col === col)
    if (idx === -1) sortKeys = [...sortKeys, { col, dir: 'asc' }]
    else sortKeys = sortKeys.map((k, i) => i === idx ? { ...k, dir: 'asc' } : k)
    currentPage = 1; closeColContextMenu()
  }

  function ctxSortDesc(col: string): void {
    const idx = sortKeys.findIndex((k) => k.col === col)
    if (idx === -1) sortKeys = [...sortKeys, { col, dir: 'desc' }]
    else sortKeys = sortKeys.map((k, i) => i === idx ? { ...k, dir: 'desc' } : k)
    currentPage = 1; closeColContextMenu()
  }

  function ctxClearSort(col: string): void {
    sortKeys = sortKeys.filter((k) => k.col !== col)
    currentPage = 1; closeColContextMenu()
  }

  function toggleFreeze(col: string): void {
    if (frozenCols.includes(col)) {
      frozenCols = frozenCols.filter((c) => c !== col)
    } else {
      if (!colWidths[col]) {
        const th = document.querySelector<HTMLElement>(`[data-col-header="${col}"]`)
        colWidths = { ...colWidths, [col]: th ? th.offsetWidth : 120 }
      }
      frozenCols = [...frozenCols, col]
    }
    closeColContextMenu()
  }

  function startResize(e: MouseEvent, col: string, th: HTMLElement): void {
    e.preventDefault(); e.stopPropagation()
    const startWidth = colWidths[col] ?? th.offsetWidth
    resizing = { col, startX: e.clientX, startWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    function onMove(ev: MouseEvent): void {
      if (!resizing) return
      colWidths = { ...colWidths, [resizing.col]: Math.max(40, resizing.startWidth + (ev.clientX - resizing.startX)) }
    }
    function onUp(): void {
      resizing = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function toggleRowSelect(globalIdx: number): void {
    const next = new Set(selectedRows)
    if (next.has(globalIdx)) next.delete(globalIdx)
    else next.add(globalIdx)
    selectedRows = next
  }

  function toggleAllSelect(): void {
    if (allPageSelected) {
      const next = new Set(selectedRows)
      pagedRows.forEach((_, i) => next.delete(getRowGlobalIdx(i)))
      selectedRows = next
    } else {
      const next = new Set(selectedRows)
      pagedRows.forEach((_, i) => next.add(getRowGlobalIdx(i)))
      selectedRows = next
    }
  }

  function downloadFile(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function escapeCsv(v: unknown): string {
    const s = v === null || v === undefined ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  function exportCsv(): void {
    const header = columns.join(',')
    const body = sortedRows.map((row) => columns.map((col) => escapeCsv(row[col])).join(',')).join('\n')
    downloadFile(`${header}\n${body}`, 'query-result.csv', 'text/csv;charset=utf-8;')
    exportOpen = false
  }

  function copySelectedAsCsv(): void {
    const selected = [...selectedRows].map((idx) => sortedRows[idx]).filter(Boolean)
    if (selected.length === 0) return
    const header = columns.join(',')
    const body = selected.map((row) => columns.map((col) => escapeCsv(row[col])).join(',')).join('\n')
    navigator.clipboard.writeText(`${header}\n${body}`)
  }

  function goFirst(): void { currentPage = 1 }
  function goPrev(): void { if (currentPage > 1) currentPage -= 1 }
  function goNext(): void { if (currentPage < totalPages) currentPage += 1 }
  function goLast(): void { currentPage = totalPages }

  function handlePageSizeChange(value: number): void { pageSize = value; currentPage = 1; selectedRows = new Set() }
  function handleSearchInput(value: string): void { searchQuery = value; currentPage = 1; selectedRows = new Set() }
  function handleSearchClear(): void { searchQuery = ''; currentPage = 1; selectedRows = new Set() }
</script>

<div class="flex h-full flex-col">
  {#if status === 'idle'}
    <div class="flex h-full items-center justify-center text-[13px] text-muted-foreground/60">
      쿼리를 실행하면 결과가 표시됩니다
    </div>
  {:else if status === 'running'}
    <div class="flex h-full items-center justify-center">
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground/60"></div>
    </div>
  {:else if status === 'error'}
    <div class="h-full overflow-auto p-4">
      <p class="text-sm text-destructive whitespace-pre-wrap">{error ?? '알 수 없는 오류'}</p>
    </div>
  {:else if status === 'success' && columns.length === 0}
    <div class="flex h-full flex-col items-center justify-center gap-1">
      {#if affectedRows !== undefined && affectedRows !== null}
        <p class="text-[13px] text-emerald-600 dark:text-emerald-400">{affectedRows}개 행이 영향을 받았습니다</p>
        {#if executionTime !== undefined}
          <p class="text-[11px] text-muted-foreground/60">{formatExecutionTime(executionTime)}</p>
        {/if}
      {:else}
        <p class="text-[13px] text-muted-foreground/60">결과가 없습니다</p>
      {/if}
    </div>
  {:else}
    <div class="flex shrink-0 items-center justify-between border-b border-border px-2 py-1 gap-2">
      <div class="flex items-center gap-1">
        <div class="relative">
          <button
            class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            onclick={() => { exportOpen = !exportOpen }}
          >
            <Download class="h-3 w-3" />
            Export
          </button>
          {#if exportOpen}
            <div class="absolute left-0 top-full z-50 mt-1 rounded-md border border-border bg-popover shadow-md">
              <button
                class="flex w-full items-center px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
                onclick={exportCsv}
              >CSV (.csv)</button>
            </div>
            <div class="fixed inset-0 z-40" onclick={() => { exportOpen = false }}></div>
          {/if}
        </div>
        <button
          class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors
            {selectedRows.size > 0 ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'text-muted-foreground/40 cursor-not-allowed'}"
          disabled={selectedRows.size === 0}
          onclick={copySelectedAsCsv}
        >
          <Clipboard class="h-3 w-3" />
          복사{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
        </button>
        <span class="text-[11px] text-muted-foreground shrink-0">총 {totalCount}개 행</span>
        {#if executionTime !== undefined}
          <span class="text-[11px] text-muted-foreground/60 shrink-0">{formatExecutionTime(executionTime)}</span>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <div class="relative flex items-center">
          <Search class="pointer-events-none absolute left-2 h-3 w-3 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            placeholder="값으로 필터..."
            class="h-6 w-48 rounded border border-border bg-background pl-6 pr-6 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-0"
            oninput={(e) => handleSearchInput((e.target as HTMLInputElement).value)}
          />
          {#if searchQuery}
            <button
              class="absolute right-1.5 text-muted-foreground/60 hover:text-foreground"
              onclick={handleSearchClear}
            ><X class="h-3 w-3" /></button>
          {/if}
        </div>

        <div class="flex items-center gap-1.5">
          <select
            value={pageSize}
            class="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground outline-none"
            onchange={(e) => handlePageSizeChange(Number((e.target as HTMLSelectElement).value))}
          >
            {#each PAGE_SIZE_OPTIONS as size}
              <option value={size}>{size === 0 ? '전체' : `${size}개씩`}</option>
            {/each}
          </select>
          <div class="flex items-center gap-0.5">
            <button class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30" disabled={currentPage === 1} onclick={goFirst}><ChevronsLeft class="h-3.5 w-3.5" /></button>
            <button class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30" disabled={currentPage === 1} onclick={goPrev}><ChevronLeft class="h-3.5 w-3.5" /></button>
            <span class="min-w-16 text-center text-[11px] text-muted-foreground">{currentPage} / {totalPages}</span>
            <button class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30" disabled={currentPage === totalPages} onclick={goNext}><ChevronRight class="h-3.5 w-3.5" /></button>
            <button class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30" disabled={currentPage === totalPages} onclick={goLast}><ChevronsRight class="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>

    {#if showWarning}
      <div class="flex shrink-0 items-center gap-2 border-b border-amber-400/40 bg-amber-500/10 px-3 py-1.5">
        <TriangleAlert class="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span class="flex-1 text-[11px] text-amber-600 dark:text-amber-400">
          LIMIT이 없는 SELECT입니다. 대용량 테이블에서 성능 문제가 발생할 수 있습니다.
        </span>
        <button class="rounded p-0.5 text-amber-500 hover:bg-amber-500/20" onclick={() => { warningDismissed = true }} aria-label="경고 닫기">
          <X class="h-3 w-3" />
        </button>
      </div>
    {/if}

    <div class="flex-1 overflow-auto min-h-0">
      <table class="w-full border-collapse text-[12px]">
        <thead class="sticky top-0 bg-muted">
          <tr>
            <th class="w-10 border-b border-border bg-muted" style="position: sticky; left: 0; z-index: 3;">
              <div class="flex items-center justify-center px-2 py-1.5">
                <input type="checkbox" class="cursor-pointer accent-primary" checked={allPageSelected} onchange={toggleAllSelect} />
              </div>
            </th>
            <th class="w-10 border-b border-border bg-muted text-center text-[10px] font-medium text-muted-foreground/50 select-none" style="position: sticky; left: 40px; z-index: 2;">#</th>
            {#each displayColumns as col}
              {@const sortKey = sortKeys.find((k) => k.col === col)}
              {@const sortIdx = sortKeys.findIndex((k) => k.col === col)}
              {@const frozen = frozenCols.includes(col)}
              <th
                data-col-header={col}
                class="relative border-b border-border whitespace-nowrap {resizing?.col === col ? 'select-none' : ''} {frozen ? 'bg-muted' : ''} {isLastFrozen(col) ? 'border-r-2 border-r-primary/30' : ''}"
                style="{colWidths[col] ? `width: ${colWidths[col]}px; min-width: ${colWidths[col]}px; max-width: ${colWidths[col]}px;` : ''}{getFrozenStyle(col, 2)}"
                oncontextmenu={(e) => handleColContextMenu(e, col)}
              >
                <button
                  class="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11px] font-medium hover:bg-muted-foreground/10 {sortKey ? 'text-primary' : 'text-muted-foreground'}"
                  onclick={() => handleColClick(col)}
                >
                  <span class="truncate">{col}</span>
                  {#if sortKey}
                    <span class="flex shrink-0 items-center gap-0.5 text-primary">
                      {#if sortKey.dir === 'asc'}<ArrowUp class="h-2.5 w-2.5" />{:else}<ArrowDown class="h-2.5 w-2.5" />{/if}
                      {#if sortKeys.length > 1}<span class="text-[9px] font-bold">{sortIdx + 1}</span>{/if}
                    </span>
                  {:else}
                    <ArrowUpDown class="h-2.5 w-2.5 shrink-0 opacity-20" />
                  {/if}
                </button>
                <div
                  class="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 {resizing?.col === col ? 'bg-primary/50' : ''}"
                  onmousedown={(e) => startResize(e, col, (e.currentTarget as HTMLElement).closest('th') as HTMLElement)}
                ></div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#if pagedRows.length === 0}
            <tr>
              <td colspan={columns.length + 2} class="px-3 py-6 text-center text-sm text-muted-foreground">
                {searchQuery ? '검색 결과가 없습니다' : '데이터가 없습니다'}
              </td>
            </tr>
          {/if}
          {#each pagedRows as row, pagedIdx}
            {@const globalIdx = getRowGlobalIdx(pagedIdx)}
            {@const isSelected = selectedRows.has(globalIdx)}
            {@const rowNumber = pageSize === 0 ? pagedIdx + 1 : (currentPage - 1) * pageSize + pagedIdx + 1}
            <tr class="{isSelected ? 'bg-primary/5' : 'hover:bg-muted/40'}">
              <td class="w-10 border-b border-border px-2 {isSelected ? 'bg-primary/5' : 'bg-background'}" style="position: sticky; left: 0; z-index: 1;">
                <input type="checkbox" class="cursor-pointer accent-primary" checked={isSelected} onchange={() => toggleRowSelect(globalIdx)} />
              </td>
              <td class="w-10 border-b border-border text-center text-[10px] text-muted-foreground/40 select-none {isSelected ? 'bg-primary/5' : 'bg-background'}" style="position: sticky; left: 40px; z-index: 1;">{rowNumber}</td>
              {#each displayColumns as col}
                {@const value = row[col]}
                {@const frozen = frozenCols.includes(col)}
                {@const isJson = tryParseJson(value) !== null}
                <td
                  class="border-b border-border p-0 whitespace-nowrap {frozen ? (isSelected ? 'bg-primary/5' : 'bg-background') : ''} {isLastFrozen(col) ? 'border-r-2 border-r-primary/30' : ''}"
                  style={getFrozenStyle(col, 1)}
                >
                  <div
                    class="px-3 py-1.5 cursor-default select-none flex items-center gap-1.5 min-w-0"
                    onclick={() => { if (isJson) openJsonModal(col, value) }}
                  >
                    {#if value === null || value === undefined}
                      <span class="text-muted-foreground/50 italic">NULL</span>
                    {:else if value === ''}
                      <span class="rounded bg-muted-foreground/15 px-1 text-[10px] text-muted-foreground/60">empty</span>
                    {:else}
                      <span class="truncate {getCellClass(col, value)}">{@html highlightText(String(value), searchQuery)}</span>
                      {#if isJson}
                        <span class="shrink-0 rounded bg-blue-500/15 px-1 text-[9px] font-medium text-blue-500 cursor-pointer">&#123;&#125;</span>
                      {/if}
                    {/if}
                  </div>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if jsonModal.open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={() => { jsonModal.open = false }}>
    <div class="relative flex w-[560px] max-w-[90vw] flex-col rounded-lg border border-border bg-background shadow-xl" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span class="text-[13px] font-medium text-foreground">{jsonModal.title}</span>
        <div class="flex items-center gap-1">
          <button
            class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors {jsonCopied ? 'text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
            onclick={copyJsonContent}
          >
            <Copy class="h-3 w-3" />
            {jsonCopied ? '복사됨' : '복사'}
          </button>
          <button class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => { jsonModal.open = false }}>
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <pre class="max-h-[60vh] overflow-auto p-4 text-[12px] text-foreground font-mono leading-relaxed whitespace-pre-wrap break-all">{jsonModal.content}</pre>
    </div>
  </div>
{/if}

{#if colContextMenu.open}
  <div class="fixed inset-0 z-40" onclick={closeColContextMenu} oncontextmenu={(e) => { e.preventDefault(); closeColContextMenu() }}></div>
  <div class="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md" style="left: {colContextMenu.x}px; top: {colContextMenu.y}px;">
    <div class="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">{colContextMenu.col}</div>
    <div class="my-0.5 h-px bg-border"></div>
    <button class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent" onclick={() => ctxSortAsc(colContextMenu.col)}>
      <ArrowUp class="h-3 w-3 text-muted-foreground" /> 오름차순 정렬
    </button>
    <button class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent" onclick={() => ctxSortDesc(colContextMenu.col)}>
      <ArrowDown class="h-3 w-3 text-muted-foreground" /> 내림차순 정렬
    </button>
    {#if sortKeys.some((k) => k.col === colContextMenu.col)}
      <button class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent" onclick={() => ctxClearSort(colContextMenu.col)}>
        <X class="h-3 w-3" /> 정렬 해제
      </button>
    {/if}
    <div class="my-0.5 h-px bg-border"></div>
    <button class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent" onclick={() => toggleFreeze(colContextMenu.col)}>
      <span class="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-muted-foreground/40 {frozenCols.includes(colContextMenu.col) ? 'bg-primary border-primary' : ''}">
        {#if frozenCols.includes(colContextMenu.col)}
          <svg viewBox="0 0 12 12" class="h-2.5 w-2.5 text-primary-foreground" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6l3 3 5-5" /></svg>
        {/if}
      </span>
      컬럼 고정
    </button>
  </div>
{/if}

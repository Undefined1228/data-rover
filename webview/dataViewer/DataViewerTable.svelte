<script lang="ts">
  import { tick } from 'svelte'
  import { ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-svelte'

  let {
    readonly,
    columns,
    displayColumns,
    rows,
    pagedRows,
    newRows,
    selectedRows,
    deletedRows,
    editedData,
    editingCell,
    sortKeys,
    frozenCols,
    colWidths,
    resizing,
    columnTypes,
    searchQuery,
    currentPage,
    pageSize,
    allPageSelected,
    ontoggleallselect,
    ontogglerowselect,
    oncolclick,
    oncolcontextmenu,
    onstartresize,
    oneditingcell,
    oncellinput,
    onnewrowinput,
    onnewrowkeydown,
    onnewrowdelete,
    onopenJsonModal,
  }: {
    readonly: boolean
    columns: string[]
    displayColumns: string[]
    rows: Record<string, unknown>[]
    pagedRows: Record<string, unknown>[]
    newRows: Record<string, unknown>[]
    selectedRows: Set<number>
    deletedRows: Set<number>
    editedData: Record<number, Record<string, unknown>>
    editingCell: { rowIdx: number; col: string } | null
    sortKeys: { col: string; dir: 'asc' | 'desc' }[]
    frozenCols: string[]
    colWidths: Record<string, number>
    resizing: { col: string; startX: number; startWidth: number } | null
    columnTypes: Record<string, string>
    searchQuery: string
    currentPage: number
    pageSize: number
    allPageSelected: boolean
    ontoggleallselect: () => void
    ontogglerowselect: (rowIdx: number) => void
    oncolclick: (col: string) => void
    oncolcontextmenu: (e: MouseEvent, col: string) => void
    onstartresize: (e: MouseEvent, col: string, th: HTMLElement) => void
    oneditingcell: (cell: { rowIdx: number; col: string } | null) => void
    oncellinput: (row: Record<string, unknown>, col: string, value: unknown) => void
    onnewrowinput: (rowIdx: number, col: string, value: unknown) => void
    onnewrowkeydown: (e: KeyboardEvent, rowIdx: number) => void
    onnewrowdelete: (rowIdx: number) => void
    onopenJsonModal: (col: string, value: unknown) => void
  } = $props()

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        return null
      }
    }
    return null
  }

  function getOrderedFrozen(): string[] {
    return frozenCols.filter((c) => columns.includes(c))
  }

  function getFrozenStyle(col: string, zIndex: number = 1, bgColor: string = ''): string {
    const ordered = getOrderedFrozen()
    if (!ordered.includes(col)) return ''
    const fixedWidth = (readonly ? 0 : 32) + 40
    const left = fixedWidth + ordered.slice(0, ordered.indexOf(col)).reduce((sum, c) => sum + (colWidths[c] ?? 120), 0)
    return `position: sticky; left: ${left}px; z-index: ${zIndex};${bgColor ? ` background-color: ${bgColor};` : ''}`
  }

  function isBooleanCol(col: string): boolean {
    return columnTypes[col] === 'bool'
  }

  function isTimestampCol(col: string): boolean {
    const t = columnTypes[col] ?? ''
    return t.startsWith('timestamp') || t === 'date' || t === 'timetz' || t === 'time'
  }

  function getCellClass(col: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return ''
    const type = columnTypes[col] ?? ''
    if (/^(int2|int4|int8|float4|float8|numeric|money|oid|xid|cid|serial|bigserial|smallint|integer|bigint|real|double precision|decimal)/.test(type)) return 'cell-numeric'
    return ''
  }

  function isTruthyBool(value: unknown): boolean {
    return value === true || value === 't' || value === 'true' || value === 'yes' || value === '1'
  }

  function formatTimestampValue(value: unknown): string {
    if (value === null || value === undefined) return ''
    try {
      const d = new Date(String(value))
      if (isNaN(d.getTime())) return String(value)
      return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return String(value)
    }
  }

  function getDateInputType(col: string): 'date' | 'datetime-local' | 'time' | null {
    const t = columnTypes[col] ?? ''
    if (t === 'date') return 'date'
    if (t.startsWith('timestamp')) return 'datetime-local'
    if (t === 'time' || t === 'timetz') return 'time'
    return null
  }

  function formatEditValue(col: string, value: unknown): string {
    if (value === null || value === undefined) return ''
    const s = String(value)
    const t = columnTypes[col] ?? ''
    if (t === 'date') {
      const match = s.match(/^(\d{4}-\d{2}-\d{2})/)
      return match ? match[1] : s
    }
    if (t.startsWith('timestamp')) {
      const match = s.replace(' ', 'T').match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
      return match ? match[1] : s
    }
    if (t === 'time' || t === 'timetz') {
      const match = s.match(/^(\d{2}:\d{2}(:\d{2})?)/)
      return match ? match[1] : s
    }
    return s
  }

  function isValidNewInput(col: string, value: string): boolean {
    if (value === '') return true
    const type = columnTypes[col] ?? ''
    if (/^(int2|int4|int8|smallint|integer|bigint|serial|bigserial|oid|xid|cid)/.test(type)) {
      return /^-?\d+$/.test(value.trim())
    }
    if (/^(float4|float8|numeric|real|double precision|decimal|money)/.test(type)) {
      return value.trim() !== '' && !isNaN(Number(value.trim()))
    }
    if (type === 'json' || type === 'jsonb') {
      try { JSON.parse(value); return true } catch { return false }
    }
    if (type === 'uuid') {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
    }
    return true
  }

  function isLastFrozen(col: string): boolean {
    const ordered = getOrderedFrozen()
    return ordered.length > 0 && ordered[ordered.length - 1] === col
  }

  function getRowIdx(row: Record<string, unknown>): number {
    return row.__rowIdx as number
  }

  function getCellValue(row: Record<string, unknown>, col: string): unknown {
    const rowIdx = getRowIdx(row)
    return editedData[rowIdx]?.[col] !== undefined ? editedData[rowIdx][col] : row[col]
  }

  function isCellChanged(row: Record<string, unknown>, col: string): boolean {
    const rowIdx = getRowIdx(row)
    return editedData[rowIdx]?.[col] !== undefined && editedData[rowIdx][col] !== row[col]
  }

  async function handleDblClick(row: Record<string, unknown>, col: string): Promise<void> {
    const rowIdx = getRowIdx(row)
    oneditingcell({ rowIdx, col })
    await tick()
    const input = document.querySelector<HTMLInputElement>(`[data-cell="${rowIdx}-${col}"]`)
    input?.focus()
    input?.select()
  }

  function handleCellKeydown(e: KeyboardEvent, row: Record<string, unknown>, col: string): void {
    if (e.key === 'Escape') { oneditingcell(null); return }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault()
      oncellinput(row, col, null)
      oneditingcell(null)
      return
    }
    if (e.key === 'Enter') {
      oneditingcell(null)
      const ri = pagedRows.findIndex((r) => getRowIdx(r) === getRowIdx(row))
      if (ri < pagedRows.length - 1) void handleDblClick(pagedRows[ri + 1], col)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      oneditingcell(null)
      const ri = pagedRows.findIndex((r) => getRowIdx(r) === getRowIdx(row))
      const ci = displayColumns.indexOf(col)
      let nextRi = ri
      let nextCi = e.shiftKey ? ci - 1 : ci + 1
      if (nextCi < 0) { nextRi -= 1; nextCi = displayColumns.length - 1 }
      if (nextCi >= displayColumns.length) { nextRi += 1; nextCi = 0 }
      if (nextRi >= 0 && nextRi < pagedRows.length) void handleDblClick(pagedRows[nextRi], displayColumns[nextCi])
    }
  }

  let prevNewRowsLength = $state(0)
  $effect(() => {
    const len = newRows.length
    if (len > prevNewRowsLength) {
      const idx = len - 1
      tick().then(() => {
        document.querySelector<HTMLInputElement>(`[data-new-cell="${idx}-0"]`)?.focus()
      })
    }
    prevNewRowsLength = len
  })
</script>

<div class="flex-1 overflow-auto min-h-0">
  <table class="w-full border-collapse text-[12px]">
    <thead class="sticky top-0 bg-muted">
      <tr>
        {#if !readonly}
          <th class="border-b border-foreground/20 bg-muted" style="width: 32px; min-width: 32px; max-width: 32px; position: sticky; left: 0; z-index: 3;">
            <div class="flex items-center justify-center px-2 py-1.5">
              <input
                type="checkbox"
                class="cursor-pointer accent-primary"
                checked={allPageSelected}
                indeterminate={selectedRows.size > 0 && !allPageSelected}
                onchange={ontoggleallselect}
              />
            </div>
          </th>
        {/if}
        <th
          class="border-b border-foreground/20 bg-muted text-center text-[10px] font-medium text-muted-foreground/50 select-none"
          style="width: 40px; min-width: 40px; max-width: 40px; position: sticky; left: {readonly ? 0 : 32}px; z-index: 2;"
        >
          #
        </th>
        {#each displayColumns as col}
          {@const sortKey = sortKeys.find((k) => k.col === col)}
          {@const sortIdx = sortKeys.findIndex((k) => k.col === col)}
          {@const frozen = frozenCols.includes(col)}
          <th
            data-col-header={col}
            class="relative border-b border-foreground/20 whitespace-nowrap {resizing?.col === col ? 'select-none' : ''} {frozen ? 'bg-muted' : ''} {isLastFrozen(col) ? 'border-r-2 border-r-primary/30' : ''}"
            style="{colWidths[col] ? `width: ${colWidths[col]}px; min-width: ${colWidths[col]}px; max-width: ${colWidths[col]}px;` : ''}{getFrozenStyle(col, 2)}"
            oncontextmenu={(e) => oncolcontextmenu(e, col)}
          >
            <button
              class="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11px] font-medium hover:bg-muted-foreground/10
                {sortKey ? 'text-primary' : 'text-muted-foreground'}"
              onclick={() => oncolclick(col)}
            >
              <span class="truncate">{col}</span>
              {#if sortKey}
                <span class="flex shrink-0 items-center gap-0.5 text-primary">
                  {#if sortKey.dir === 'asc'}
                    <ArrowUp class="h-2.5 w-2.5" />
                  {:else}
                    <ArrowDown class="h-2.5 w-2.5" />
                  {/if}
                  {#if sortKeys.length > 1}
                    <span class="text-[9px] font-bold">{sortIdx + 1}</span>
                  {/if}
                </span>
              {:else}
                <ArrowUpDown class="h-2.5 w-2.5 shrink-0 opacity-20" />
              {/if}
            </button>
            <div
              class="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 {resizing?.col === col ? 'bg-primary/50' : ''}"
              onmousedown={(e) => onstartresize(e, col, (e.currentTarget as HTMLElement).closest('th') as HTMLElement)}
            ></div>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if !readonly}
        {#each newRows as nr, nri}
          <tr class="bg-primary/5">
            <td class="border-b border-primary/30 px-2 bg-primary/5" style="width: 32px; min-width: 32px; max-width: 32px; position: sticky; left: 0; z-index: 1;">
              <button onclick={() => onnewrowdelete(nri)}>
                <X class="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            </td>
            <td class="border-b border-primary/30 bg-primary/5 text-center text-[10px] text-muted-foreground/40 select-none" style="width: 40px; min-width: 40px; max-width: 40px; position: sticky; left: {readonly ? 0 : 32}px; z-index: 1;">–</td>
            {#each displayColumns as col, ci}
              <td class="border-b border-primary/30 p-0 whitespace-nowrap">
                {#if isBooleanCol(col)}
                  <div class="flex items-center px-3 py-1.5">
                    <input
                      data-new-cell="{nri}-{ci}"
                      type="checkbox"
                      class="accent-primary cursor-pointer"
                      checked={isTruthyBool(nr[col])}
                      onchange={(e) => onnewrowinput(nri, col, (e.target as HTMLInputElement).checked)}
                    />
                  </div>
                {:else if getDateInputType(col) !== null}
                  <input
                    data-new-cell="{nri}-{ci}"
                    type={getDateInputType(col)!}
                    class="w-full min-w-20 bg-transparent px-3 py-1.5 text-[12px] text-foreground outline-none focus:outline focus:outline-1 focus:outline-primary"
                    value={String(nr[col] ?? '')}
                    onchange={(e) => onnewrowinput(nri, col, (e.target as HTMLInputElement).value)}
                    onkeydown={(e) => onnewrowkeydown(e, nri)}
                  />
                {:else}
                  {@const inputVal = String(nr[col] ?? '')}
                  {@const inputInvalid = !isValidNewInput(col, inputVal)}
                  <input
                    data-new-cell="{nri}-{ci}"
                    class="w-full min-w-20 bg-transparent px-3 py-1.5 text-[12px] text-foreground {inputInvalid ? 'outline outline-1 outline-destructive' : 'outline-none focus:outline focus:outline-1 focus:outline-primary'}"
                    placeholder={col}
                    value={inputVal}
                    oninput={(e) => onnewrowinput(nri, col, (e.target as HTMLInputElement).value)}
                    onkeydown={(e) => onnewrowkeydown(e, nri)}
                  />
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
      {#if pagedRows.length === 0 && newRows.length === 0}
        <tr>
          <td colspan={readonly ? columns.length : columns.length + 1} class="px-3 py-6 text-center text-sm text-muted-foreground">
            데이터가 없습니다
          </td>
        </tr>
      {/if}
      {#each pagedRows as row, rowIndex}
        {@const rowIdx = getRowIdx(row)}
        {@const isDeleted = deletedRows.has(rowIdx)}
        {@const isSelected = selectedRows.has(rowIdx)}
        {@const rowNumber = pageSize === 0 ? rowIndex + 1 : (currentPage - 1) * pageSize + rowIndex + 1}
        <tr class="
          {isDeleted ? 'bg-destructive/10' : isSelected ? 'bg-primary/5' : Object.keys(editedData[rowIdx] ?? {}).length > 0 ? 'bg-amber-500/5' : 'hover:bg-muted/40'}
        ">
          {#if !readonly}
            <td
              class="border-b border-foreground/20 px-2 relative"
              style="width: 32px; min-width: 32px; max-width: 32px; position: sticky; left: 0; z-index: 1; background-color: var(--color-background);"
            >
              <div class="absolute inset-0 pointer-events-none {isDeleted ? 'bg-destructive/10' : isSelected ? 'bg-primary/5' : Object.keys(editedData[rowIdx] ?? {}).length > 0 ? 'bg-amber-500/5' : ''}"></div>
              <input
                type="checkbox"
                class="cursor-pointer accent-primary relative"
                checked={isSelected}
                disabled={isDeleted}
                onchange={() => ontogglerowselect(rowIdx)}
              />
            </td>
          {/if}
          <td
            class="border-b border-foreground/20 text-center text-[10px] text-muted-foreground/40 select-none relative"
            style="width: 40px; min-width: 40px; max-width: 40px; position: sticky; left: {readonly ? 0 : 32}px; z-index: 1; background-color: var(--color-background);"
          >
            <div class="absolute inset-0 pointer-events-none {isDeleted ? 'bg-destructive/10' : isSelected ? 'bg-primary/5' : Object.keys(editedData[rowIdx] ?? {}).length > 0 ? 'bg-amber-500/5' : ''}"></div>
            <span class="relative">{rowNumber}</span>
          </td>
          {#each displayColumns as col}
            {@const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.col === col}
            {@const changed = isCellChanged(row, col)}
            {@const value = getCellValue(row, col)}
            {@const originalValue = row[col]}
            {@const frozen = frozenCols.includes(col)}
            <td
              class="border-b border-foreground/20 p-0 whitespace-nowrap {frozen ? 'bg-background relative' : (changed && !isDeleted ? 'bg-amber-500/10' : '')} {isLastFrozen(col) ? 'border-r-2 border-r-primary/30' : ''}"
              style={getFrozenStyle(col, 1, frozen ? 'var(--color-background)' : '')}
              title={changed && !isDeleted ? `원래 값: ${originalValue === null || originalValue === undefined ? 'NULL' : originalValue === '' ? '(빈 문자열)' : String(originalValue)}` : undefined}
              ondblclick={() => { if (!isDeleted && !readonly && !isBooleanCol(col)) handleDblClick(row, col) }}
            >
              {#if frozen}
                <div class="absolute inset-0 pointer-events-none {changed && !isDeleted ? 'bg-amber-500/10' : isDeleted ? 'bg-destructive/10' : isSelected ? 'bg-primary/5' : Object.keys(editedData[rowIdx] ?? {}).length > 0 ? 'bg-amber-500/5' : ''}"></div>
              {/if}
              {#if isBooleanCol(col)}
                <div class="px-3 py-1.5">
                  <input
                    type="checkbox"
                    class="accent-primary {!isDeleted && !readonly ? 'cursor-pointer' : 'cursor-default'}"
                    checked={isTruthyBool(value)}
                    disabled={isDeleted || readonly}
                    onchange={(e) => oncellinput(row, col, (e.target as HTMLInputElement).checked)}
                  />
                </div>
              {:else if isEditing}
                {@const dateType = getDateInputType(col)}
                {#if dateType !== null}
                  <input
                    data-cell="{rowIdx}-{col}"
                    type={dateType}
                    class="h-full w-full min-w-20 bg-primary/5 px-3 py-1.5 text-[12px] text-foreground outline outline-1 outline-primary"
                    value={formatEditValue(col, value)}
                    onchange={(e) => oncellinput(row, col, (e.target as HTMLInputElement).value)}
                    onkeydown={(e) => handleCellKeydown(e, row, col)}
                    onblur={() => { oneditingcell(null) }}
                  />
                {:else}
                  <input
                    data-cell="{rowIdx}-{col}"
                    class="h-full w-full min-w-20 bg-primary/5 px-3 py-1.5 text-[12px] {value === null ? 'text-muted-foreground/50 italic' : 'text-foreground'} outline outline-1 outline-primary"
                    value={value === null ? '' : String(value ?? '')}
                    placeholder={value === null ? 'NULL' : ''}
                    oninput={(e) => oncellinput(row, col, (e.target as HTMLInputElement).value)}
                    onkeydown={(e) => handleCellKeydown(e, row, col)}
                    onblur={() => { oneditingcell(null) }}
                  />
                {/if}
              {:else}
                {@const isJson = !isDeleted && tryParseJson(value) !== null}
                <div
                  class="px-3 py-1.5 cursor-default select-none flex items-center gap-1.5 min-w-0"
                  onclick={() => { if (isJson) onopenJsonModal(col, value) }}
                >
                  {#if value === null || value === undefined}
                    <span class="text-muted-foreground/50 italic {isDeleted ? 'line-through opacity-50' : ''}">NULL</span>
                  {:else if value === ''}
                    <span class="rounded bg-muted-foreground/15 px-1 text-[10px] text-muted-foreground/60 {isDeleted ? 'line-through opacity-50' : ''}">empty</span>
                  {:else if isTimestampCol(col)}
                    <span class="truncate {isDeleted ? 'line-through text-destructive/60' : changed ? 'text-amber-600 dark:text-amber-400' : 'cell-datetime'}">{formatTimestampValue(value)}</span>
                  {:else}
                    <span class="truncate {isDeleted ? 'line-through text-destructive/60' : changed ? 'text-amber-600 dark:text-amber-400' : getCellClass(col, value)}">{@html highlightText(String(value), searchQuery)}</span>
                    {#if isJson}
                      <span class="shrink-0 rounded bg-blue-500/15 px-1 text-[9px] font-medium text-blue-500 cursor-pointer">&#123;&#125;</span>
                    {/if}
                  {/if}
                </div>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

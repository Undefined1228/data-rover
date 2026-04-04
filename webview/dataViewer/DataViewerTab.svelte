<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '$shared/api'
  import DataViewerToolbar from './DataViewerToolbar.svelte'
  import DataViewerTable from './DataViewerTable.svelte'
  import DataViewerColContextMenu from './DataViewerColContextMenu.svelte'
  import JsonViewerModal from './JsonViewerModal.svelte'

  let schemaName = $state('')
  let objectName = $state('')
  let objectType = $state<'table' | 'view' | 'matview'>('table')

  let readonly = $derived(objectType !== 'table')

  let columns = $state<string[]>([])
  let primaryKeys = $state<string[]>([])
  let columnDefaults = $state<Record<string, string | null>>({})
  let rows = $state<Record<string, unknown>[]>([])
  let loading = $state(true)
  let fetching = $state(false)
  let error = $state<string | null>(null)
  let pageSize = $state(100)
  let currentPage = $state(1)
  let sortKeys = $state<{ col: string; dir: 'asc' | 'desc' }[]>([])
  let editingCell = $state<{ rowIdx: number; col: string } | null>(null)
  let editedData = $state<Record<number, Record<string, unknown>>>({})
  let newRows = $state<Record<string, unknown>[]>([])
  let selectedRows = $state<Set<number>>(new Set())
  let deletedRows = $state<Set<number>>(new Set())
  let searchQuery = $state('')
  let colWidths = $state<Record<string, number>>({})
  let resizing = $state<{ col: string; startX: number; startWidth: number } | null>(null)
  let columnTypes = $state<Record<string, string>>({})
  let frozenCols = $state<string[]>([])
  let colContextMenu = $state<{ open: boolean; x: number; y: number; col: string }>({ open: false, x: 0, y: 0, col: '' })
  let totalCount = $state(0)
  let searchTimeout: ReturnType<typeof setTimeout> | null = null
  let jsonModal = $state<{ open: boolean; title: string; content: string }>({ open: false, title: '', content: '' })
  let jsonCopied = $state(false)

  const pageSizeOptions = [100, 200, 500, 1000, 0]

  let allPageSelected = $derived(rows.length > 0 && rows.every((r) => selectedRows.has(r.__rowIdx as number)))
  let hasChanges = $derived(Object.keys(editedData).length > 0 || newRows.length > 0 || deletedRows.size > 0)
  let totalPages = $derived(pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalCount / pageSize)))
  let pagedRows = $derived(rows)
  let displayColumns = $derived([
    ...frozenCols.filter((c) => columns.includes(c)),
    ...columns.filter((c) => !frozenCols.includes(c)),
  ])

  function clearEdits(): void {
    editedData = {}
    editingCell = null
    newRows = []
    deletedRows = new Set()
    selectedRows = new Set()
  }

  function goFirst(): void { clearEdits(); currentPage = 1; void load() }
  function goPrev(): void { if (currentPage > 1) { clearEdits(); currentPage -= 1; void load() } }
  function goNext(): void { if (currentPage < totalPages) { clearEdits(); currentPage += 1; void load() } }
  function goLast(): void { clearEdits(); currentPage = totalPages; void load() }

  function closeColContextMenu(): void {
    colContextMenu = { ...colContextMenu, open: false }
  }

  function ctxSortAsc(col: string): void {
    const idx = sortKeys.findIndex((k) => k.col === col)
    if (idx === -1) sortKeys = [...sortKeys, { col, dir: 'asc' }]
    else sortKeys = sortKeys.map((k, i) => i === idx ? { ...k, dir: 'asc' } : k)
    clearEdits(); currentPage = 1; void load()
    closeColContextMenu()
  }

  function ctxSortDesc(col: string): void {
    const idx = sortKeys.findIndex((k) => k.col === col)
    if (idx === -1) sortKeys = [...sortKeys, { col, dir: 'desc' }]
    else sortKeys = sortKeys.map((k, i) => i === idx ? { ...k, dir: 'desc' } : k)
    clearEdits(); currentPage = 1; void load()
    closeColContextMenu()
  }

  function ctxClearSort(col: string): void {
    sortKeys = sortKeys.filter((k) => k.col !== col)
    clearEdits(); currentPage = 1; void load()
    closeColContextMenu()
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

  function handleColClick(col: string): void {
    const idx = sortKeys.findIndex((k) => k.col === col)
    if (idx === -1) sortKeys = [...sortKeys, { col, dir: 'asc' }]
    else if (sortKeys[idx].dir === 'asc') sortKeys = sortKeys.map((k, i) => i === idx ? { ...k, dir: 'desc' } : k)
    else sortKeys = sortKeys.filter((_, i) => i !== idx)
    clearEdits(); currentPage = 1; void load()
  }

  function handleSearchInput(value: string): void {
    searchQuery = value
    if (searchTimeout) clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => { currentPage = 1; void load() }, 300)
  }

  function handleSearchClear(): void {
    searchQuery = ''
    if (searchTimeout) clearTimeout(searchTimeout)
    currentPage = 1; void load()
  }

  function handleRefresh(): void {
    if (hasChanges && !confirm('저장되지 않은 변경사항이 있습니다. 새로고침하시겠습니까?')) return
    clearEdits(); void load()
  }

  function handlePageSizeChange(value: number): void {
    pageSize = value; clearEdits(); currentPage = 1; void load()
  }

  function handleColContextMenu(e: MouseEvent, col: string): void {
    e.preventDefault()
    colContextMenu = { open: true, x: e.clientX, y: e.clientY, col }
  }

  function handleCellInput(row: Record<string, unknown>, col: string, value: unknown): void {
    const rowIdx = row.__rowIdx as number
    editedData = { ...editedData, [rowIdx]: { ...(editedData[rowIdx] ?? {}), [col]: value } }
  }

  function handleNewRowInput(rowIdx: number, col: string, value: unknown): void {
    newRows = newRows.map((r, i) => i === rowIdx ? { ...r, [col]: value } : r)
  }

  function handleNewRowKeydown(e: KeyboardEvent, rowIdx: number): void {
    if (e.key === 'Escape') newRows = newRows.filter((_, i) => i !== rowIdx)
  }

  function handleAddClick(): void {
    const initialRow: Record<string, unknown> = {}
    for (const col of columns) {
      const def = columnDefaults[col]
      if (def !== null && def !== undefined && !/^nextval\s*\(/i.test(def)) initialRow[col] = def
    }
    newRows = [...newRows, initialRow]
  }

  function toggleRowSelect(rowIdx: number): void {
    const next = new Set(selectedRows)
    if (next.has(rowIdx)) next.delete(rowIdx)
    else next.add(rowIdx)
    selectedRows = next
  }

  function toggleAllSelect(): void {
    if (allPageSelected) {
      const next = new Set(selectedRows)
      pagedRows.forEach((r) => next.delete(r.__rowIdx as number))
      selectedRows = next
    } else {
      const next = new Set(selectedRows)
      pagedRows.forEach((r) => next.add(r.__rowIdx as number))
      selectedRows = next
    }
  }

  function handleDeleteClick(): void {
    if (selectedRows.size === 0) return
    const next = new Set(deletedRows)
    selectedRows.forEach((idx) => next.add(idx))
    deletedRows = next
    selectedRows = new Set()
  }

  function handleDuplicateClick(): void {
    if (selectedRows.size === 0) return
    const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))
    const duplicated = pagedRows
      .filter((r) => selectedRows.has(r.__rowIdx as number))
      .map((r) => {
        const newRow: Record<string, unknown> = {}
        for (const col of columns) {
          if (!primaryKeys.includes(col)) newRow[col] = r[col] ?? null
        }
        return plain(newRow)
      })
    newRows = [...newRows, ...duplicated]
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

  async function handleSave(): Promise<void> {
    const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))
    const inserts = newRows.filter((r) => Object.keys(r).length > 0).map(plain)
    const updates = Object.entries(editedData).map(([idxStr, changes]) => {
      const rowIdx = Number(idxStr)
      return { original: plain(rows.find((r) => r.__rowIdx === rowIdx) ?? {}), changes: plain(changes) }
    })
    const deletes = [...deletedRows].map((rowIdx) => plain(rows.find((r) => r.__rowIdx === rowIdx) ?? {}))
    try {
      await api.request('db:data-changes', {
        schemaName, tableName: objectName, primaryKeys: [...primaryKeys], inserts, updates, deletes,
      })
      clearEdits(); await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  function downloadFile(content: string, filename: string, mime: string): void {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv(): void {
    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = columns.join(',')
    const body = pagedRows.map((row) => columns.map((col) => escape(row[col])).join(',')).join('\n')
    downloadFile(`${header}\n${body}`, `${objectName}.csv`, 'text/csv;charset=utf-8;')
  }

  function exportInsert(): void {
    const quoteIdent = (s: string): string => `"${s.replace(/"/g, '""')}"`
    const quoteLiteral = (v: unknown): string => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
    const tableRef = `${quoteIdent(schemaName)}.${quoteIdent(objectName)}`
    const colList = columns.map(quoteIdent).join(', ')
    const lines = pagedRows.map((row) => `INSERT INTO ${tableRef} (${colList}) VALUES (${columns.map((col) => quoteLiteral(row[col])).join(', ')});`)
    downloadFile(lines.join('\n'), `${objectName}.sql`, 'text/plain;charset=utf-8;')
  }

  function copySelectedAsCsv(): void {
    const selectedRowData = rows.filter((r) => selectedRows.has(r.__rowIdx as number))
    if (selectedRowData.length === 0) return
    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = columns.join(',')
    const body = selectedRowData.map((row) => {
      const rowIdx = row.__rowIdx as number
      return columns.map((col) => escape(editedData[rowIdx]?.[col] !== undefined ? editedData[rowIdx][col] : row[col])).join(',')
    }).join('\n')
    navigator.clipboard.writeText(`${header}\n${body}`)
  }

  function copySelectedAsInsert(): void {
    const selectedRowData = rows.filter((r) => selectedRows.has(r.__rowIdx as number))
    if (selectedRowData.length === 0) return
    const quoteIdent = (s: string): string => `"${s.replace(/"/g, '""')}"`
    const quoteLiteral = (v: unknown): string => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
    const tableRef = `${quoteIdent(schemaName)}.${quoteIdent(objectName)}`
    const colList = columns.map(quoteIdent).join(', ')
    const lines = selectedRowData.map((row) => {
      const rowIdx = row.__rowIdx as number
      const vals = columns.map((col) => quoteLiteral(editedData[rowIdx]?.[col] !== undefined ? editedData[rowIdx][col] : row[col])).join(', ')
      return `INSERT INTO ${tableRef} (${colList}) VALUES (${vals});`
    })
    navigator.clipboard.writeText(lines.join('\n'))
  }

  function openJsonModal(col: string, value: unknown): void {
    if (typeof value !== 'string') return
    try {
      const formatted = JSON.stringify(JSON.parse(value.trim()), null, 2)
      jsonModal = { open: true, title: col, content: formatted }
      jsonCopied = false
    } catch { /* noop */ }
  }

  async function copyJsonContent(): Promise<void> {
    await navigator.clipboard.writeText(jsonModal.content)
    jsonCopied = true
    setTimeout(() => { jsonCopied = false }, 1500)
  }

  async function load(): Promise<void> {
    if (!loading) fetching = true
    error = null
    try {
      const result = await api.request<{
        columns: string[]
        primaryKeys: string[]
        rows: Record<string, unknown>[]
        totalCount: number
        columnDefaults: Record<string, string | null>
        columnTypes: Record<string, string>
      }>('db:select-all', {
        limit: pageSize,
        offset: pageSize === 0 ? 0 : (currentPage - 1) * pageSize,
        orderBy: sortKeys.map(({ col, dir }) => ({ col, dir })),
        search: searchQuery.trim(),
      })
      columns = result.columns
      primaryKeys = result.primaryKeys
      rows = result.rows.map((r, i) => ({ ...r, __rowIdx: i }))
      totalCount = result.totalCount
      columnDefaults = result.columnDefaults
      columnTypes = result.columnTypes
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
      fetching = false
    }
  }

  onMount(async () => {
    const init = await api.request<{ schemaName: string; tableName: string; tableType: 'table' | 'view' | 'matview' }>('webview:ready')
    schemaName = init.schemaName
    objectName = init.tableName
    objectType = init.tableType
    await load()
  })
</script>

{#if loading}
  <div class="flex h-full items-center justify-center text-muted-foreground">
    <div class="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground/60"></div>
  </div>
{:else if error}
  <div class="flex h-full items-center justify-center p-4">
    <p class="text-sm text-destructive">{error}</p>
  </div>
{:else}
  <div class="flex h-full flex-col">
    <DataViewerToolbar
      {readonly}
      {hasChanges}
      {selectedRows}
      {fetching}
      {searchQuery}
      {pageSize}
      {currentPage}
      {totalPages}
      {totalCount}
      {pageSizeOptions}
      onsave={handleSave}
      oncancel={clearEdits}
      onadd={handleAddClick}
      onduplicate={handleDuplicateClick}
      ondelete={handleDeleteClick}
      onexportcsv={exportCsv}
      onexportinsert={exportInsert}
      oncopycsv={copySelectedAsCsv}
      oncopyinsert={copySelectedAsInsert}
      onrefresh={handleRefresh}
      onsearchinput={handleSearchInput}
      onsearchclear={handleSearchClear}
      onpagesizechange={handlePageSizeChange}
      ongofirst={goFirst}
      ongoprev={goPrev}
      ongonext={goNext}
      ongolast={goLast}
    />
    <DataViewerTable
      {readonly}
      {columns}
      {displayColumns}
      {rows}
      {pagedRows}
      {newRows}
      {selectedRows}
      {deletedRows}
      {editedData}
      {editingCell}
      {sortKeys}
      {frozenCols}
      {colWidths}
      {resizing}
      {columnTypes}
      {searchQuery}
      {currentPage}
      {pageSize}
      {allPageSelected}
      ontoggleallselect={toggleAllSelect}
      ontogglerowselect={toggleRowSelect}
      oncolclick={handleColClick}
      oncolcontextmenu={handleColContextMenu}
      onstartresize={startResize}
      oneditingcell={(cell) => { editingCell = cell }}
      oncellinput={handleCellInput}
      onnewrowinput={handleNewRowInput}
      onnewrowkeydown={handleNewRowKeydown}
      onnewrowdelete={(rowIdx) => { newRows = newRows.filter((_, i) => i !== rowIdx) }}
      onopenJsonModal={openJsonModal}
    />
  </div>
{/if}

<JsonViewerModal
  open={jsonModal.open}
  title={jsonModal.title}
  content={jsonModal.content}
  copied={jsonCopied}
  onclose={() => { jsonModal.open = false }}
  oncopy={copyJsonContent}
/>

<DataViewerColContextMenu
  open={colContextMenu.open}
  x={colContextMenu.x}
  y={colContextMenu.y}
  col={colContextMenu.col}
  {frozenCols}
  {sortKeys}
  onclose={closeColContextMenu}
  onsortasc={ctxSortAsc}
  onsortdesc={ctxSortDesc}
  onclearsort={ctxClearSort}
  onfreeze={toggleFreeze}
/>

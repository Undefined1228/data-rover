<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { Play, WrapText, History, Square } from 'lucide-svelte'
  import { format as sqlFormat } from 'sql-formatter'
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
  import { EditorState, Compartment } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { sql, PostgreSQL, MySQL, type SQLDialect } from '@codemirror/lang-sql'
  import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
  import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
  import { linter, lintGutter, forceLinting, type Diagnostic } from '@codemirror/lint'
  import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
  import { api } from '$shared/api'
  import QueryResultViewer from './QueryResultViewer.svelte'
  import ExplainViewer from './ExplainViewer.svelte'

  let { dbType }: { dbType: string } = $props()

  const isMac = navigator.platform.toUpperCase().includes('MAC')
  const modKey = isMac ? '⌘' : 'Ctrl'

  interface QueryResult {
    sql: string
    status: 'running' | 'success' | 'error'
    columns: string[]
    rows: Record<string, unknown>[]
    columnTypes: Record<string, string>
    error: string | null
    executionTime: number | undefined
    affectedRows: number | undefined
    errorPosition?: number
  }

  interface HistoryEntry {
    id: string
    sql: string
    executedAt: string
    executionTime?: number
    success?: boolean
  }

  let multiResults = $state<QueryResult[]>([])
  let activeResultTab = $state(0)
  let stopOnError = $state(true)
  let useTransaction = $state(false)
  let transactionResult = $state<'committed' | 'rolledback' | null>(null)
  let errorDiagnostic = $state<{ position?: number; message: string } | null>(null)

  let queryCount = $derived(splitQueries(editorContent).length)
  let isSelectQuery = $derived(/^\s*SELECT\b/i.test(editorContent.trim()))
  let explainEnabled = $derived(queryCount === 1 && isSelectQuery)

  let activeResultView = $state<'result' | 'explain'>('result')
  let explainResult = $state<{ ok: true; plan: unknown; totalTime?: number } | null>(null)
  let explainRunning = $state(false)
  let explainError = $state<string | null>(null)

  let historyOpen = $state(false)
  let historyItems = $state<HistoryEntry[]>([])

  let editorContent = $state('')
  let editorContainer = $state<HTMLDivElement | null>(null)
  let view: EditorView | undefined

  // 리사이즈 상태
  let topPercent = $state(55)
  let isResizing = $state(false)
  let resizeStartY = 0
  let resizeStartPercent = 0

  const highlightCompartment = new Compartment()
  const sqlCompartment = new Compartment()

  function isDark(): boolean {
    return document.body.dataset.vscodeThemeKind !== 'vscode-light'
  }

  function getDialect(): SQLDialect {
    if (dbType === 'mysql' || dbType === 'mariadb') return MySQL
    return PostgreSQL
  }

  function buildHighlightExtension() {
    return syntaxHighlighting(isDark() ? oneDarkHighlightStyle : defaultHighlightStyle, { fallback: true })
  }

  function buildSqlExtension(schemaMap: Record<string, string[]> = {}) {
    return sql({ dialect: getDialect(), schema: schemaMap, upperCaseKeywords: true })
  }

  const baseTheme = EditorView.theme({
    '&': { height: '100%' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
      fontSize: '13px',
      lineHeight: '1.6',
    },
    '.cm-content': { padding: '12px 16px' },
    '.cm-cursor': { borderLeftColor: 'var(--vscode-foreground)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-foreground))' },
    '.cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--vscode-focusBorder) 25%, transparent) !important' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--vscode-focusBorder) 25%, transparent) !important' },
    '.cm-gutters': {
      backgroundColor: 'var(--vscode-sideBar-background, var(--vscode-editor-background))',
      borderRight: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.2))',
      color: 'color-mix(in srgb, var(--vscode-foreground) 40%, transparent)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--vscode-editor-background) 75%, var(--vscode-foreground))',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px', minWidth: '32px' },
    '.cm-lintRange-error': {
      backgroundImage: "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='3'><path d='m0 2 l2 -2 l1 0 l2 2 l1 0' stroke='%23ef4444' fill='none' stroke-width='1.2'/></svg>\")",
      backgroundRepeat: 'repeat-x',
      backgroundPosition: 'bottom',
    },
    '.cm-lint-marker-error': { color: '#ef4444' },
    '.cm-tooltip': {
      border: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.3))',
      backgroundColor: 'var(--vscode-editorHoverWidget-background, var(--vscode-editor-background))',
      borderRadius: '6px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete ul': { padding: '4px', margin: '0', maxHeight: '240px', overflow: 'auto' },
    '.cm-tooltip-autocomplete ul li': {
      padding: '4px 10px',
      borderRadius: '4px',
      fontSize: '12px',
      color: 'var(--vscode-foreground)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--vscode-list-activeSelectionBackground)',
      color: 'var(--vscode-list-activeSelectionForeground)',
    },
    '.cm-completionLabel': { fontSize: '12px' },
    '.cm-completionDetail': {
      fontSize: '11px',
      color: 'color-mix(in srgb, var(--vscode-foreground) 60%, transparent)',
      marginLeft: '4px',
      fontStyle: 'italic',
    },
    '.cm-completionMatchedText': {
      textDecoration: 'none',
      fontWeight: '600',
      color: 'var(--vscode-editorLink-activeForeground, var(--vscode-focusBorder))',
    },
  })

  onMount(async () => {
    if (!editorContainer) return

    view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          EditorView.contentAttributes.of({ autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' }),
          keymap.of([...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          baseTheme,
          autocompletion({ activateOnTyping: true, activateOnTypingDelay: 0, interactionDelay: 0, maxRenderedOptions: 15 }),
          highlightCompartment.of(buildHighlightExtension()),
          sqlCompartment.of(buildSqlExtension()),
          linter((): Diagnostic[] => {
            if (!errorDiagnostic || errorDiagnostic.position === undefined) return []
            const docLen = view?.state.doc.length ?? 0
            const from = Math.min(Math.max(0, errorDiagnostic.position - 1), docLen)
            const to = Math.min(from + 1, docLen)
            return [{ from, to: Math.max(to, from + 1), severity: 'error', message: errorDiagnostic.message }]
          }, { delay: 300 }),
          lintGutter(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) editorContent = update.state.doc.toString()
          }),
          EditorView.domEventHandlers({
            keydown(e) {
              if (e.altKey && e.shiftKey && e.key === 'F') {
                e.preventDefault()
                formatQuery()
                return true
              }
              if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'Enter') {
                e.preventDefault()
                void runQuery()
                return true
              }
              return false
            },
          }),
        ],
      }),
      parent: editorContainer,
    })

    // VSCode 테마 변경 감지
    const observer = new MutationObserver(() => {
      view?.dispatch({ effects: highlightCompartment.reconfigure(buildHighlightExtension()) })
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind'] })
    onDestroy(() => observer.disconnect())

    // 자동완성 스키마 로드
    try {
      const schemaMap = await api.request<Record<string, string[]>>('db:completion-schema')
      view?.dispatch({ effects: sqlCompartment.reconfigure(buildSqlExtension(schemaMap)) })
    } catch {}
  })

  onDestroy(() => {
    view?.destroy()
    view = undefined
  })

  $effect(() => {
    const _ = errorDiagnostic
    if (view) forceLinting(view)
  })

  function splitQueries(text: string): string[] {
    const queries: string[] = []
    let current = ''
    let i = 0
    while (i < text.length) {
      const ch = text[i]
      if (ch === '-' && text[i + 1] === '-') {
        const end = text.indexOf('\n', i)
        if (end === -1) { current += text.slice(i); break }
        current += text.slice(i, end + 1); i = end + 1; continue
      }
      if (ch === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2)
        if (end === -1) { current += text.slice(i); break }
        current += text.slice(i, end + 2); i = end + 2; continue
      }
      if (ch === "'") {
        let j = i + 1
        while (j < text.length) {
          if (text[j] === "'" && text[j + 1] === "'") { j += 2; continue }
          if (text[j] === "'") { j++; break }
          j++
        }
        current += text.slice(i, j); i = j; continue
      }
      if (ch === '"') {
        let j = i + 1
        while (j < text.length) {
          if (text[j] === '"' && text[j + 1] === '"') { j += 2; continue }
          if (text[j] === '"') { j++; break }
          j++
        }
        current += text.slice(i, j); i = j; continue
      }
      if (ch === ';') {
        const q = current.trim()
        if (q) queries.push(q)
        current = ''; i++; continue
      }
      current += ch; i++
    }
    const q = current.trim()
    if (q) queries.push(q)
    return queries
  }

  async function runQuery(): Promise<void> {
    if (!view) return
    const { from, to } = view.state.selection.main
    const selected = from !== to ? view.state.doc.sliceString(from, to).trim() : ''
    const fullText = (selected || view.state.doc.toString()).trim()
    if (!fullText) return

    const queries = splitQueries(fullText)
    if (queries.length === 0) return

    errorDiagnostic = null
    transactionResult = null
    activeResultView = 'result'
    multiResults = queries.map((sqlText) => ({
      sql: sqlText,
      status: 'running' as const,
      columns: [],
      rows: [],
      columnTypes: {},
      error: null,
      executionTime: undefined,
      affectedRows: undefined,
    }))
    activeResultTab = 0

    if (queries.length === 1) {
      const sqlText = queries[0]
      const start = Date.now()
      const result = await api.request<{ ok: boolean; columns?: string[]; rows?: Record<string, unknown>[]; columnTypes?: Record<string, string>; affectedRows?: number | null; message?: string; position?: number }>(
        'db:execute-query', { sql: sqlText }
      )
      const elapsed = Date.now() - start

      if (result.ok) {
        multiResults[0] = {
          sql: sqlText, status: 'success',
          columns: result.columns ?? [], rows: result.rows ?? [],
          columnTypes: result.columnTypes ?? {}, error: null,
          executionTime: elapsed, affectedRows: result.affectedRows ?? undefined,
        }
      } else {
        multiResults[0] = {
          sql: sqlText, status: 'error',
          columns: [], rows: [], columnTypes: {}, error: result.message ?? '오류',
          executionTime: elapsed, affectedRows: undefined, errorPosition: result.position,
        }
        errorDiagnostic = { message: result.message ?? '오류', position: result.position }
      }

      void api.request('history:add', { sql: sqlText, executionTime: elapsed, success: result.ok })
    } else {
      const batchResponse = await api.request<{
        results: Array<{ ok: boolean; columns?: string[]; rows?: Record<string, unknown>[]; columnTypes?: Record<string, string>; affectedRows?: number | null; message?: string; position?: number; executionTime?: number; skipped?: boolean }>
        transactionResult?: 'committed' | 'rolledback'
      }>('db:execute-query-batch', { sqls: queries, stopOnError, useTransaction })

      transactionResult = batchResponse.transactionResult ?? null
      multiResults = batchResponse.results.map((result, i) => ({
        sql: queries[i],
        status: result.ok ? 'success' as const : 'error' as const,
        columns: result.ok ? (result.columns ?? []) : [],
        rows: result.ok ? (result.rows ?? []) : [],
        columnTypes: result.ok ? (result.columnTypes ?? {}) : {},
        error: result.ok ? null : (result.message ?? '오류'),
        executionTime: result.executionTime,
        affectedRows: result.ok ? (result.affectedRows ?? undefined) : undefined,
        errorPosition: !result.ok ? result.position : undefined,
      }))

      const firstErrorIdx = multiResults.findIndex((r) => r.status === 'error')
      if (firstErrorIdx !== -1) activeResultTab = firstErrorIdx

      for (const [i, result] of batchResponse.results.entries()) {
        if (!result.ok && result.skipped) continue
        void api.request('history:add', {
          sql: queries[i],
          executionTime: result.executionTime,
          success: result.ok,
        })
      }
    }
  }

  async function runExplain(): Promise<void> {
    if (!view || !explainEnabled) return
    const sqlText = view.state.doc.toString().trim()
    if (!sqlText) return
    explainRunning = true
    explainError = null
    explainResult = null
    activeResultView = 'explain'
    const result = await api.request<{ ok: boolean; plan?: unknown; totalTime?: number; message?: string }>(
      'query:explain', { sql: sqlText }
    )
    explainRunning = false
    if (result.ok && result.plan) {
      explainResult = { ok: true, plan: result.plan, totalTime: result.totalTime }
    } else {
      explainError = result.message ?? '실행 계획 조회 실패'
    }
  }

  function formatQuery(): void {
    if (!view) return
    const dialectMap: Record<string, string> = { postgresql: 'postgresql', mysql: 'mysql', mariadb: 'mysql' }
    const dialect = dialectMap[dbType] ?? 'sql'
    try {
      const formatted = sqlFormat(view.state.doc.toString(), {
        language: dialect as Parameters<typeof sqlFormat>[1]['language'],
        tabWidth: 2,
        keywordCase: 'upper',
      })
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } })
    } catch {}
  }

  async function loadHistory(): Promise<void> {
    historyItems = await api.request<HistoryEntry[]>('history:list')
  }

  function loadHistoryItem(sqlText: string): void {
    if (!view) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: sqlText } })
    historyOpen = false
  }

  function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '방금'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    return `${Math.floor(hours / 24)}일 전`
  }

  function startPaneResize(e: MouseEvent): void {
    isResizing = true
    resizeStartY = e.clientY
    resizeStartPercent = topPercent
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  function onPaneMouseMove(e: MouseEvent): void {
    if (!isResizing) return
    const container = document.getElementById('qe-container')
    if (!container) return
    const totalH = container.clientHeight
    const delta = e.clientY - resizeStartY
    const newPercent = Math.min(85, Math.max(15, resizeStartPercent + (delta / totalH) * 100))
    topPercent = newPercent
  }

  function onPaneMouseUp(): void {
    if (!isResizing) return
    isResizing = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
</script>

<svelte:window onmousemove={onPaneMouseMove} onmouseup={onPaneMouseUp} />

<div id="qe-container" class="flex h-full flex-col overflow-hidden">
  <!-- 에디터 영역 -->
  <div style="height: {topPercent}%; min-height: 100px;" class="flex flex-col overflow-hidden">
    <!-- 툴바 -->
    <div class="flex shrink-0 items-center border-b border-border px-2 py-1 gap-1 bg-background">
      {#if multiResults.some(r => r.status === 'running')}
        <button
          class="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-destructive hover:bg-accent transition-colors"
          onclick={() => { void api.request('query:cancel') }}
        >
          <Square class="h-3 w-3 fill-current" />
          취소
        </button>
      {:else}
        <button
          class="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          onclick={() => { void runQuery() }}
        >
          <Play class="h-3 w-3" />
          실행
          <kbd class="ml-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/70 border border-border/60">{modKey}⏎</kbd>
        </button>
      {/if}

      <label class="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors select-none">
        <input type="checkbox" class="accent-primary" checked={stopOnError} onchange={(e) => { stopOnError = (e.target as HTMLInputElement).checked }} />
        오류 시 중단
      </label>

      <div class="relative group">
        <label class="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] select-none transition-colors
          {queryCount <= 1 ? 'opacity-40 cursor-not-allowed text-muted-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}">
          <input type="checkbox" class="accent-primary" disabled={queryCount <= 1} checked={useTransaction} onchange={(e) => { useTransaction = (e.target as HTMLInputElement).checked }} />
          트랜잭션
        </label>
        <div class="pointer-events-none absolute top-full left-1/2 mt-1.5 hidden -translate-x-1/2 group-hover:block z-50">
          <div class="whitespace-nowrap rounded bg-popover border border-border px-2 py-1 text-[11px] text-foreground shadow-md">
            다중 쿼리를 하나의 트랜잭션으로 묶어 실행합니다.<br />하나라도 실패하면 전체 롤백됩니다.
          </div>
        </div>
      </div>

      <div class="mx-1 h-4 w-px bg-border"></div>

      <button
        class="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors
          {explainEnabled ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'opacity-40 cursor-not-allowed text-muted-foreground'}"
        disabled={!explainEnabled || explainRunning}
        onclick={runExplain}
      >
        {#if explainRunning}
          <span class="h-3 w-3 animate-spin rounded-full border border-border border-t-foreground/60 inline-block"></span>
        {:else}
          <svg class="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 4h12M2 8h8M2 12h5"/>
          </svg>
        {/if}
        EXPLAIN
      </button>

      <div class="mx-1 h-4 w-px bg-border"></div>

      <button
        class="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        onclick={formatQuery}
      >
        <WrapText class="h-3 w-3" />
        포맷
        <kbd class="ml-0.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground/70 border border-border/60">⇧Alt F</kbd>
      </button>

      <div class="mx-1 h-4 w-px bg-border"></div>

      <div class="relative">
        <button
          class="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors {historyOpen ? 'bg-accent text-foreground' : ''}"
          onclick={async () => { historyOpen = !historyOpen; if (historyOpen) await loadHistory() }}
        >
          <History class="h-3 w-3" />
          히스토리
        </button>
        {#if historyOpen}
          <div class="absolute left-0 top-full z-50 mt-1 w-96 rounded-md border border-border bg-popover shadow-lg" role="dialog">
            {#if historyItems.length === 0}
              <div class="px-3 py-4 text-center text-[11px] text-muted-foreground">실행 히스토리가 없습니다</div>
            {:else}
              <div class="max-h-80 overflow-y-auto p-1">
                {#each historyItems as item (item.id)}
                  <button
                    class="w-full rounded px-3 py-2 text-left hover:bg-accent transition-colors"
                    onclick={() => loadHistoryItem(item.sql)}
                  >
                    <div class="flex items-center justify-between gap-2 mb-0.5">
                      <span class="text-[10px] {item.success === true ? 'text-emerald-500' : 'text-red-500'} font-medium">
                        {item.success === true ? '성공' : '실패'}
                      </span>
                      <span class="text-[10px] text-muted-foreground/60 shrink-0">
                        {formatRelativeTime(item.executedAt)}{item.executionTime !== undefined ? ` · ${item.executionTime}ms` : ''}
                      </span>
                    </div>
                    <div class="font-mono text-[11px] text-foreground/80 truncate">{item.sql.replace(/\s+/g, ' ').trim()}</div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="fixed inset-0 z-40" role="button" tabindex="-1" onclick={() => { historyOpen = false }} onkeydown={() => {}} aria-label="close"></div>
        {/if}
      </div>
    </div>

    <!-- CodeMirror 에디터 -->
    <div bind:this={editorContainer} class="flex-1 min-h-0 overflow-hidden bg-background"></div>
  </div>

  <!-- 리사이즈 핸들 -->
  <div
    class="h-1 shrink-0 cursor-row-resize bg-border hover:bg-primary/40 transition-colors {isResizing ? 'bg-primary/40' : ''}"
    onmousedown={startPaneResize}
  ></div>

  <!-- 결과 영역 -->
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <!-- 결과/실행계획 탭 -->
    <div class="flex shrink-0 items-center border-b border-border bg-muted/20">
      <button
        class="px-3 py-1.5 text-[11px] transition-colors border-b-2
          {activeResultView === 'result' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}"
        onclick={() => { activeResultView = 'result' }}
      >결과</button>
      <button
        class="px-3 py-1.5 text-[11px] transition-colors border-b-2
          {activeResultView === 'explain' ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}"
        onclick={() => { activeResultView = 'explain' }}
      >실행 계획</button>
    </div>

    {#if activeResultView === 'explain'}
      <div class="flex-1 min-h-0 overflow-auto">
        {#if explainRunning}
          <div class="flex h-full items-center justify-center">
            <div class="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground/60"></div>
          </div>
        {:else if explainError}
          <div class="p-4 text-sm text-destructive whitespace-pre-wrap">{explainError}</div>
        {:else if explainResult}
          <ExplainViewer plan={explainResult.plan as any} totalTime={explainResult.totalTime} />
        {:else}
          <div class="flex h-full items-center justify-center text-[13px] text-muted-foreground/60">
            EXPLAIN 버튼을 눌러 실행 계획을 확인하세요
          </div>
        {/if}
      </div>
    {:else}
      {#if multiResults.length === 0}
        <QueryResultViewer columns={[]} rows={[]} status="idle" error={null} executionTime={undefined} affectedRows={undefined} />
      {:else if multiResults.length === 1}
        <QueryResultViewer
          columns={multiResults[0].columns}
          rows={multiResults[0].rows}
          columnTypes={multiResults[0].columnTypes}
          status={multiResults[0].status}
          error={multiResults[0].error}
          executionTime={multiResults[0].executionTime}
          affectedRows={multiResults[0].affectedRows}
          sql={multiResults[0].sql}
        />
      {:else}
        <div class="flex h-full flex-col min-h-0">
          <div class="flex shrink-0 items-center gap-0.5 border-b border-border px-2 overflow-x-auto">
            {#each multiResults as result, i}
              <button
                class="flex items-center gap-1.5 whitespace-nowrap rounded-t px-3 py-1.5 text-[11px] transition-colors
                  {activeResultTab === i ? 'border-b-2 border-primary text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}"
                onclick={() => { activeResultTab = i }}
              >
                {#if result.status === 'running'}
                  <span class="h-2 w-2 animate-spin rounded-full border border-border border-t-foreground/60 inline-block"></span>
                {:else if result.status === 'success'}
                  <span class="h-2 w-2 rounded-full bg-emerald-500 inline-block"></span>
                {:else}
                  <span class="h-2 w-2 rounded-full bg-red-500 inline-block"></span>
                {/if}
                쿼리 {i + 1}
              </button>
            {/each}
            {#if transactionResult}
              <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium
                {transactionResult === 'committed' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}">
                {transactionResult === 'committed' ? '트랜잭션 커밋됨' : '트랜잭션 롤백됨'}
              </span>
            {/if}
          </div>
          <div class="flex-1 min-h-0">
            {#if multiResults[activeResultTab]}
              <QueryResultViewer
                columns={multiResults[activeResultTab].columns}
                rows={multiResults[activeResultTab].rows}
                columnTypes={multiResults[activeResultTab].columnTypes}
                status={multiResults[activeResultTab].status}
                error={multiResults[activeResultTab].error}
                executionTime={multiResults[activeResultTab].executionTime}
                affectedRows={multiResults[activeResultTab].affectedRows}
                sql={multiResults[activeResultTab].sql}
              />
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>

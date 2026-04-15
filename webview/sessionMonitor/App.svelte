<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { api } from '$shared/api'

  type Tab = 'sessions' | 'locks' | 'stats' | 'dbinfo'

  interface SessionRow {
    id: number
    user: string
    database: string
    state: string
    waitEventType: string | null
    waitEvent: string | null
    durationSec: number | null
    query: string | null
  }

  interface LockRow {
    waitingId: number
    waitingUser: string
    blockingId: number
    blockingUser: string
    lockType: string
    tableName: string | null
    waitingQuery: string | null
    blockingQuery: string | null
  }

  interface TableStatRow {
    schema: string
    table: string
    totalBytes: number
    tableBytes: number
    indexBytes: number
    estimatedRows: number
    deadTuples?: number
    lastVacuum?: string | null
    lastAutovacuum?: string | null
  }

  let activeTab = $state<Tab>('sessions')
  let dbType = $state('postgresql')
  let refreshIntervalSec = $state(10)
  let lastRefreshed = $state<Date | null>(null)

  interface DbInfo {
    version: string
    host: string
    port: number
    database: string
    user: string
    settings: { name: string; value: string; unit: string | null }[]
    databases: { name: string; sizeBytes: number; connections: number }[]
    stats: { commits: number; rollbacks: number; cacheHitRatio: number | null } | null
  }

  let sessions = $state<SessionRow[]>([])
  let locks = $state<LockRow[]>([])
  let stats = $state<TableStatRow[]>([])
  let dbInfo = $state<DbInfo | null>(null)

  let sessionsLoading = $state(true)
  let locksLoading = $state(false)
  let statsLoading = $state(false)
  let dbInfoLoading = $state(false)

  let sessionsError = $state<string | null>(null)
  let locksError = $state<string | null>(null)
  let statsError = $state<string | null>(null)
  let dbInfoError = $state<string | null>(null)

  let isPostgres = $derived(dbType === 'postgresql')

  const intervalOptions = [5, 10, 30, 60]

  async function fetchSessions(): Promise<void> {
    sessionsLoading = true
    sessionsError = null
    try {
      const result = await api.request<SessionRow[] | { error: string }>('monitor:sessions')
      if (!Array.isArray(result) && 'error' in result) {
        sessionsError = (result as { error: string }).error
      } else {
        sessions = result as SessionRow[]
        lastRefreshed = new Date()
      }
    } catch (err) {
      sessionsError = err instanceof Error ? err.message : String(err)
    } finally {
      sessionsLoading = false
    }
  }

  async function fetchLocks(): Promise<void> {
    locksLoading = true
    locksError = null
    try {
      const result = await api.request<LockRow[] | { error: string }>('monitor:locks')
      if (!Array.isArray(result) && 'error' in result) {
        locksError = (result as { error: string }).error
      } else {
        locks = result as LockRow[]
        lastRefreshed = new Date()
      }
    } catch (err) {
      locksError = err instanceof Error ? err.message : String(err)
    } finally {
      locksLoading = false
    }
  }

  async function fetchStats(): Promise<void> {
    statsLoading = true
    statsError = null
    try {
      const result = await api.request<TableStatRow[] | { error: string }>('monitor:table-stats')
      if (!Array.isArray(result) && 'error' in result) {
        statsError = (result as { error: string }).error
      } else {
        stats = result as TableStatRow[]
        lastRefreshed = new Date()
      }
    } catch (err) {
      statsError = err instanceof Error ? err.message : String(err)
    } finally {
      statsLoading = false
    }
  }

  async function fetchDbInfo(): Promise<void> {
    dbInfoLoading = true
    dbInfoError = null
    try {
      const result = await api.request<DbInfo | { error: string }>('monitor:db-info')
      if (!Array.isArray(result) && typeof result === 'object' && result !== null && 'error' in result) {
        dbInfoError = (result as { error: string }).error
      } else {
        dbInfo = result as DbInfo
        lastRefreshed = new Date()
      }
    } catch (err) {
      dbInfoError = err instanceof Error ? err.message : String(err)
    } finally {
      dbInfoLoading = false
    }
  }

  function fetchCurrentTab(autoRefresh = false): void {
    if (activeTab === 'sessions') void fetchSessions()
    else if (activeTab === 'locks') void fetchLocks()
    else if (activeTab === 'stats') void fetchStats()
    else if (!autoRefresh) void fetchDbInfo()
  }

  function switchTab(tab: Tab): void {
    activeTab = tab
    fetchCurrentTab()
  }

  async function killSession(id: number, mode: 'cancel' | 'terminate'): Promise<void> {
    if (mode === 'terminate' && !confirm(`세션 ${id}의 연결을 종료하시겠습니까?`)) return
    try {
      const result = await api.request<{ success: boolean } | { error: string }>('monitor:kill-session', { sessionId: id, mode })
      if ('error' in result) {
        alert((result as { error: string }).error)
      } else {
        void fetchSessions()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  function changeInterval(sec: number): void {
    refreshIntervalSec = sec
    api.notify('monitor:set-interval', { interval: sec * 1000 })
  }

  function formatBytes(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
  }

  function formatDuration(sec: number | null): string {
    if (sec === null || sec < 0) return '—'
    if (sec < 60) return `${sec}s`
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  }

  function formatDate(d: string | null | undefined): string {
    if (!d) return '—'
    try { return new Date(d).toLocaleString() } catch { return d }
  }

  function formatRows(n: number): string {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return String(n)
  }

  function stateBadgeClass(state: string): string {
    if (state === 'active') return 'bg-green-500/20 text-green-500'
    if (state === 'idle in transaction (aborted)') return 'bg-red-500/20 text-red-400'
    if (state === 'idle in transaction') return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-gray-500/20 text-gray-400'
  }

  function truncate(s: string | null, len: number): string {
    if (!s) return ''
    return s.length > len ? s.slice(0, len) + '…' : s
  }

  let unsubAutoRefresh: (() => void) | undefined

  onMount(async () => {
    const init = await api.request<{ dbType: string }>('webview:ready')
    dbType = init.dbType
    await fetchSessions()
    unsubAutoRefresh = api.on('monitor:auto-refresh', () => { fetchCurrentTab(true) })
  })

  onDestroy(() => { unsubAutoRefresh?.() })
</script>

<div class="flex h-screen flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] text-sm select-none">
  <!-- Toolbar -->
  <div class="flex shrink-0 items-center gap-2 border-b border-[var(--vscode-panel-border)] px-3 py-1.5">
    <div class="flex gap-0.5">
      {#each [['sessions', '활성 세션'], ['locks', '잠금 현황'], ['stats', '테이블 통계'], ['dbinfo', 'DB 정보']] as [tab, label]}
        <button
          onclick={() => switchTab(tab as Tab)}
          class="rounded px-3 py-1 text-xs font-medium transition-colors {activeTab === tab
            ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
            : 'text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-editor-foreground)]'}"
        >{label}</button>
      {/each}
    </div>

    <div class="flex-1"></div>

    <div class="flex items-center gap-1 text-xs text-[var(--vscode-descriptionForeground)]">
      <span>새로고침</span>
      {#each intervalOptions as opt}
        <button
          onclick={() => changeInterval(opt)}
          class="rounded px-2 py-0.5 transition-colors {refreshIntervalSec === opt
            ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
            : 'hover:bg-[var(--vscode-toolbar-hoverBackground)]'}"
        >{opt}s</button>
      {/each}
    </div>

    <button
      onclick={fetchCurrentTab}
      class="ml-1 rounded p-1 text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] hover:text-[var(--vscode-editor-foreground)]"
      title="새로고침"
    >↻</button>

    {#if lastRefreshed}
      <span class="text-xs text-[var(--vscode-descriptionForeground)]">{lastRefreshed.toLocaleTimeString()}</span>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto">
    <!-- Sessions Tab -->
    {#if activeTab === 'sessions'}
      {#if sessionsLoading}
        <div class="flex h-full items-center justify-center">
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-[var(--vscode-panel-border)] border-t-[var(--vscode-editor-foreground)]"></div>
        </div>
      {:else if sessionsError}
        <div class="flex h-full items-center justify-center p-4">
          <p class="text-sm text-[var(--vscode-errorForeground)]">{sessionsError}</p>
        </div>
      {:else if sessions.length === 0}
        <div class="flex h-full items-center justify-center">
          <p class="text-[var(--vscode-descriptionForeground)]">활성 세션이 없습니다.</p>
        </div>
      {:else}
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr class="sticky top-0 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-panel-border)]">
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">PID</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">User</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Database</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">State</th>
              {#if isPostgres}
                <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Wait Event</th>
              {:else}
                <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Wait</th>
              {/if}
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Duration</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)]">Query</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each sessions as s}
              <tr class="border-b border-[var(--vscode-panel-border)]/40 hover:bg-[var(--vscode-list-hoverBackground)]">
                <td class="px-3 py-1.5 font-mono text-[var(--vscode-descriptionForeground)]">{s.id}</td>
                <td class="px-3 py-1.5 whitespace-nowrap">{s.user || '—'}</td>
                <td class="px-3 py-1.5 whitespace-nowrap">{s.database || '—'}</td>
                <td class="px-3 py-1.5">
                  <span class="rounded px-1.5 py-0.5 text-xs font-medium {stateBadgeClass(s.state)}">{s.state || '—'}</span>
                </td>
                <td class="px-3 py-1.5 whitespace-nowrap text-[var(--vscode-descriptionForeground)]">
                  {#if isPostgres}
                    {s.waitEventType ? `${s.waitEventType}: ${s.waitEvent ?? ''}` : '—'}
                  {:else}
                    {s.waitEvent || '—'}
                  {/if}
                </td>
                <td class="px-3 py-1.5 whitespace-nowrap font-mono text-[var(--vscode-descriptionForeground)]">{formatDuration(s.durationSec)}</td>
                <td class="px-3 py-1.5 max-w-xs font-mono text-[var(--vscode-descriptionForeground)]" title={s.query ?? ''}>{truncate(s.query, 80)}</td>
                <td class="px-3 py-1.5">
                  <div class="flex gap-1">
                    <button
                      onclick={() => killSession(s.id, 'cancel')}
                      disabled={s.state !== 'active'}
                      class="rounded px-2 py-0.5 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:enabled:bg-[var(--vscode-button-secondaryHoverBackground)]"
                      title="쿼리 취소"
                    >취소</button>
                    <button
                      onclick={() => killSession(s.id, 'terminate')}
                      class="rounded px-2 py-0.5 text-xs transition-colors bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      title="연결 종료"
                    >종료</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- Locks Tab -->
    {:else if activeTab === 'locks'}
      {#if locksLoading}
        <div class="flex h-full items-center justify-center">
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-[var(--vscode-panel-border)] border-t-[var(--vscode-editor-foreground)]"></div>
        </div>
      {:else if locksError}
        <div class="flex h-full items-center justify-center p-4">
          <p class="text-sm text-[var(--vscode-errorForeground)]">{locksError}</p>
        </div>
      {:else if locks.length === 0}
        <div class="flex h-full items-center justify-center">
          <p class="text-[var(--vscode-descriptionForeground)]">잠금 대기 중인 세션이 없습니다.</p>
        </div>
      {:else}
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr class="sticky top-0 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-panel-border)]">
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">대기 PID</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">대기 User</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">차단 PID</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">차단 User</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Lock Type</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Table</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)]">대기 쿼리</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)]">차단 쿼리</th>
            </tr>
          </thead>
          <tbody>
            {#each locks as l}
              <tr class="border-b border-[var(--vscode-panel-border)]/40 hover:bg-[var(--vscode-list-hoverBackground)]">
                <td class="px-3 py-1.5 font-mono text-yellow-400">{l.waitingId}</td>
                <td class="px-3 py-1.5 whitespace-nowrap">{l.waitingUser || '—'}</td>
                <td class="px-3 py-1.5 font-mono text-red-400">{l.blockingId}</td>
                <td class="px-3 py-1.5 whitespace-nowrap">{l.blockingUser || '—'}</td>
                <td class="px-3 py-1.5 whitespace-nowrap text-[var(--vscode-descriptionForeground)]">{l.lockType}</td>
                <td class="px-3 py-1.5 whitespace-nowrap text-[var(--vscode-descriptionForeground)]">{l.tableName || '—'}</td>
                <td class="px-3 py-1.5 max-w-xs font-mono text-[var(--vscode-descriptionForeground)]" title={l.waitingQuery ?? ''}>{truncate(l.waitingQuery, 60)}</td>
                <td class="px-3 py-1.5 max-w-xs font-mono text-[var(--vscode-descriptionForeground)]" title={l.blockingQuery ?? ''}>{truncate(l.blockingQuery, 60)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- DB Info Tab -->
    {:else if activeTab === 'dbinfo'}
      {#if dbInfoLoading}
        <div class="flex h-full items-center justify-center">
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-[var(--vscode-panel-border)] border-t-[var(--vscode-editor-foreground)]"></div>
        </div>
      {:else if dbInfoError}
        <div class="flex h-full items-center justify-center p-4">
          <p class="text-sm text-[var(--vscode-errorForeground)]">{dbInfoError}</p>
        </div>
      {:else if dbInfo}
        <div class="p-4 flex flex-col gap-4 text-xs">

          <!-- 기본 정보 -->
          <section>
            <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">기본 정보</h3>
            <table class="w-full border-collapse">
              <tbody>
                {#each [
                  ['버전', dbInfo.version],
                  ['호스트', dbInfo.host || '—'],
                  ['포트', String(dbInfo.port)],
                  ['데이터베이스', dbInfo.database || '—'],
                  ['사용자', dbInfo.user || '—'],
                ] as [label, value]}
                  <tr class="border-b border-[var(--vscode-panel-border)]/40">
                    <td class="py-1.5 pr-4 whitespace-nowrap text-[var(--vscode-descriptionForeground)] w-28">{label}</td>
                    <td class="py-1.5 font-mono break-all">{value}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>

          <!-- 크기 / 통계 -->
          {#if dbInfo.stats || dbInfo.databases.length > 0}
            <section>
              <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">크기 / 통계</h3>
              {#if dbInfo.stats}
                <table class="w-full border-collapse mb-3">
                  <tbody>
                    <tr class="border-b border-[var(--vscode-panel-border)]/40">
                      <td class="py-1.5 pr-4 whitespace-nowrap text-[var(--vscode-descriptionForeground)] w-28">캐시 히트율</td>
                      <td class="py-1.5 font-mono {(dbInfo.stats.cacheHitRatio ?? 100) < 90 ? 'text-yellow-400' : ''}">
                        {dbInfo.stats.cacheHitRatio != null ? `${dbInfo.stats.cacheHitRatio}%` : '—'}
                      </td>
                    </tr>
                    <tr class="border-b border-[var(--vscode-panel-border)]/40">
                      <td class="py-1.5 pr-4 whitespace-nowrap text-[var(--vscode-descriptionForeground)]">커밋</td>
                      <td class="py-1.5 font-mono">{dbInfo.stats.commits.toLocaleString()}</td>
                    </tr>
                    <tr class="border-b border-[var(--vscode-panel-border)]/40">
                      <td class="py-1.5 pr-4 whitespace-nowrap text-[var(--vscode-descriptionForeground)]">롤백</td>
                      <td class="py-1.5 font-mono">{dbInfo.stats.rollbacks.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              {/if}
              {#if dbInfo.databases.length > 0}
                <table class="w-full border-collapse">
                  <thead>
                    <tr class="border-b border-[var(--vscode-panel-border)]">
                      <th class="py-1.5 pr-4 text-left font-medium text-[var(--vscode-descriptionForeground)]">데이터베이스</th>
                      <th class="py-1.5 pr-4 text-right font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">크기</th>
                      <th class="py-1.5 text-right font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">연결 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each dbInfo.databases as db}
                      <tr class="border-b border-[var(--vscode-panel-border)]/40 hover:bg-[var(--vscode-list-hoverBackground)]">
                        <td class="py-1.5 pr-4 whitespace-nowrap">{db.name}</td>
                        <td class="py-1.5 pr-4 text-right font-mono text-[var(--vscode-descriptionForeground)]">{formatBytes(db.sizeBytes)}</td>
                        <td class="py-1.5 text-right font-mono text-[var(--vscode-descriptionForeground)]">{db.connections > 0 ? db.connections : '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </section>
          {/if}

          <!-- 설정값 -->
          {#if dbInfo.settings.length > 0}
            <section>
              <h3 class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--vscode-descriptionForeground)]">설정값</h3>
              <table class="w-full border-collapse">
                <thead>
                  <tr class="border-b border-[var(--vscode-panel-border)]">
                    <th class="py-1.5 pr-4 text-left font-medium text-[var(--vscode-descriptionForeground)]">파라미터</th>
                    <th class="py-1.5 text-left font-medium text-[var(--vscode-descriptionForeground)]">값</th>
                  </tr>
                </thead>
                <tbody>
                  {#each dbInfo.settings as s}
                    <tr class="border-b border-[var(--vscode-panel-border)]/40 hover:bg-[var(--vscode-list-hoverBackground)]">
                      <td class="py-1.5 pr-4 whitespace-nowrap font-mono text-[var(--vscode-descriptionForeground)]">{s.name}</td>
                      <td class="py-1.5 font-mono">{s.value}{s.unit ? ` ${s.unit}` : ''}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </section>
          {/if}

        </div>
      {:else}
        <div class="flex h-full items-center justify-center">
          <p class="text-[var(--vscode-descriptionForeground)]">데이터가 없습니다.</p>
        </div>
      {/if}

    <!-- Table Stats Tab -->
    {:else}
      {#if statsLoading}
        <div class="flex h-full items-center justify-center">
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-[var(--vscode-panel-border)] border-t-[var(--vscode-editor-foreground)]"></div>
        </div>
      {:else if statsError}
        <div class="flex h-full items-center justify-center p-4">
          <p class="text-sm text-[var(--vscode-errorForeground)]">{statsError}</p>
        </div>
      {:else if stats.length === 0}
        <div class="flex h-full items-center justify-center">
          <p class="text-[var(--vscode-descriptionForeground)]">테이블이 없습니다.</p>
        </div>
      {:else}
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr class="sticky top-0 bg-[var(--vscode-editor-background)] border-b border-[var(--vscode-panel-border)]">
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Schema</th>
              <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Table</th>
              <th class="px-3 py-2 text-right font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Total</th>
              <th class="px-3 py-2 text-right font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Table</th>
              <th class="px-3 py-2 text-right font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Index</th>
              <th class="px-3 py-2 text-right font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Est. Rows</th>
              {#if isPostgres}
                <th class="px-3 py-2 text-right font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Dead Tuples</th>
                <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Last Vacuum</th>
                <th class="px-3 py-2 text-left font-medium text-[var(--vscode-descriptionForeground)] whitespace-nowrap">Last Autovacuum</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each stats as s}
              <tr class="border-b border-[var(--vscode-panel-border)]/40 hover:bg-[var(--vscode-list-hoverBackground)]">
                <td class="px-3 py-1.5 text-[var(--vscode-descriptionForeground)] whitespace-nowrap">{s.schema}</td>
                <td class="px-3 py-1.5 whitespace-nowrap font-medium">{s.table}</td>
                <td class="px-3 py-1.5 text-right font-mono text-[var(--vscode-descriptionForeground)]">{formatBytes(s.totalBytes)}</td>
                <td class="px-3 py-1.5 text-right font-mono text-[var(--vscode-descriptionForeground)]">{formatBytes(s.tableBytes)}</td>
                <td class="px-3 py-1.5 text-right font-mono text-[var(--vscode-descriptionForeground)]">{formatBytes(s.indexBytes)}</td>
                <td class="px-3 py-1.5 text-right font-mono text-[var(--vscode-descriptionForeground)]">{formatRows(s.estimatedRows)}</td>
                {#if isPostgres}
                  <td class="px-3 py-1.5 text-right font-mono {(s.deadTuples ?? 0) > 0 ? 'text-yellow-400' : 'text-[var(--vscode-descriptionForeground)]'}">{s.deadTuples ?? 0}</td>
                  <td class="px-3 py-1.5 whitespace-nowrap text-[var(--vscode-descriptionForeground)]">{formatDate(s.lastVacuum)}</td>
                  <td class="px-3 py-1.5 whitespace-nowrap text-[var(--vscode-descriptionForeground)]">{formatDate(s.lastAutovacuum)}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </div>
</div>

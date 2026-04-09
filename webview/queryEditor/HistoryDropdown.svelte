<script lang="ts">
  interface HistoryEntry {
    id: string
    sql: string
    executedAt: string
    executionTime?: number
    success?: boolean
  }

  let { items, onSelect }: {
    items: HistoryEntry[]
    onSelect: (sql: string) => void
  } = $props()

  function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return '방금'
    if (minutes < 60) return `${minutes}분 전`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}시간 전`
    return `${Math.floor(hours / 24)}일 전`
  }
</script>

<div class="absolute left-0 top-full z-50 mt-1 w-96 rounded-md border border-border bg-popover shadow-lg" role="dialog">
  {#if items.length === 0}
    <div class="px-3 py-4 text-center text-[11px] text-muted-foreground">실행 히스토리가 없습니다</div>
  {:else}
    <div class="max-h-80 overflow-y-auto p-1">
      {#each items as item (item.id)}
        <button
          class="w-full rounded px-3 py-2 text-left hover:bg-accent transition-colors"
          onclick={() => onSelect(item.sql)}
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

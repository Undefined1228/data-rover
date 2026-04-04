<script lang="ts">
  import ExplainTreeNode from './ExplainTreeNode.svelte'

  interface ExplainNode {
    nodeType: string
    cost?: number
    actualTime?: number
    rows?: number
    actualRows?: number
    loops?: number
    relation?: string
    children: ExplainNode[]
    extra: Record<string, unknown>
  }

  let {
    node,
    maxTime,
    depth = 0,
  }: {
    node: ExplainNode
    maxTime: number
    depth?: number
  } = $props()

  let collapsed = $state(false)

  const totalActualTime = $derived(
    node.actualTime !== undefined && node.loops !== undefined
      ? node.actualTime * node.loops
      : (node.actualTime ?? 0)
  )

  const heatRatio = $derived(maxTime > 0 ? totalActualTime / maxTime : 0)

  const heatClass = $derived(
    heatRatio > 0.5
      ? 'border-l-red-500 bg-red-500/5'
      : heatRatio > 0.2
        ? 'border-l-amber-500 bg-amber-500/5'
        : 'border-l-border'
  )

  const timeColor = $derived(
    heatRatio > 0.5
      ? 'text-red-500'
      : heatRatio > 0.2
        ? 'text-amber-500'
        : 'text-muted-foreground'
  )

  function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const extraKeys = $derived(
    Object.entries(node.extra).filter(([k]) =>
      ['Index Name', 'Filter', 'Hash Condition', 'Join Filter', 'Recheck Cond', 'Index Cond', 'Sort Key'].includes(k)
    )
  )
</script>

<div class="border-l-2 pl-3 {heatClass}" style="margin-left: {depth > 0 ? 8 : 0}px">
  <div class="flex items-start gap-2 py-1.5">
    {#if node.children.length > 0}
      <button
        class="mt-0.5 shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
        onclick={() => { collapsed = !collapsed }}
        aria-label={collapsed ? '펼치기' : '접기'}
      >
        <svg class="h-3 w-3 transition-transform {collapsed ? '-rotate-90' : ''}" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2 4l4 4 4-4z"/>
        </svg>
      </button>
    {:else}
      <span class="w-3 shrink-0"></span>
    {/if}

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span class="text-[12px] font-medium text-foreground">{node.nodeType}</span>
        {#if node.relation}
          <span class="text-[11px] text-muted-foreground">on {node.relation}</span>
        {/if}
      </div>

      <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
        {#if node.actualTime !== undefined}
          <span class="text-[11px] {timeColor} font-medium">
            {formatTime(totalActualTime)}
            {#if node.loops && node.loops > 1}
              <span class="font-normal text-muted-foreground/60">×{node.loops}</span>
            {/if}
          </span>
        {/if}
        {#if node.actualRows !== undefined}
          <span class="text-[11px] text-muted-foreground">{node.actualRows.toLocaleString()} rows</span>
        {:else if node.rows !== undefined}
          <span class="text-[11px] text-muted-foreground/60">~{node.rows.toLocaleString()} rows</span>
        {/if}
        {#if node.cost !== undefined}
          <span class="text-[11px] text-muted-foreground/50">cost={node.cost.toFixed(2)}</span>
        {/if}
      </div>

      {#if extraKeys.length > 0}
        <div class="mt-1 flex flex-col gap-0.5">
          {#each extraKeys as [k, v]}
            <div class="text-[10px] text-muted-foreground/70">
              <span class="font-medium">{k}:</span> {String(v)}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  {#if !collapsed && node.children.length > 0}
    <div class="ml-1">
      {#each node.children as child}
        <ExplainTreeNode node={child} {maxTime} depth={depth + 1} />
      {/each}
    </div>
  {/if}
</div>

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
    plan,
    totalTime,
  }: {
    plan: ExplainNode
    totalTime?: number
  } = $props()

  function getMaxTime(node: ExplainNode): number {
    const self = node.actualTime !== undefined && node.loops !== undefined
      ? node.actualTime * node.loops
      : (node.actualTime ?? 0)
    return Math.max(self, ...node.children.map(getMaxTime))
  }

  const maxTime = $derived(getMaxTime(plan))

  function formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
    if (ms < 1000) return `${ms.toFixed(2)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }
</script>

<div class="flex h-full flex-col">
  {#if totalTime !== undefined}
    <div class="flex shrink-0 items-center gap-3 border-b border-border px-3 py-1.5">
      <span class="text-[11px] text-muted-foreground">총 실행 시간</span>
      <span class="text-[12px] font-medium text-foreground">{formatTime(totalTime)}</span>
      <div class="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground/60">
        <span class="flex items-center gap-1">
          <span class="inline-block h-2 w-2 rounded-sm bg-red-500/50"></span> &gt;50%
        </span>
        <span class="flex items-center gap-1">
          <span class="inline-block h-2 w-2 rounded-sm bg-amber-500/50"></span> &gt;20%
        </span>
      </div>
    </div>
  {/if}
  <div class="flex-1 overflow-auto p-3 min-h-0">
    <ExplainTreeNode node={plan} {maxTime} />
  </div>
</div>

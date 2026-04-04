<script lang="ts">
  import { ArrowUp, ArrowDown, X } from 'lucide-svelte'

  let {
    open,
    x,
    y,
    col,
    frozenCols,
    sortKeys,
    onclose,
    onsortasc,
    onsortdesc,
    onclearsort,
    onfreeze,
  }: {
    open: boolean
    x: number
    y: number
    col: string
    frozenCols: string[]
    sortKeys: { col: string; dir: 'asc' | 'desc' }[]
    onclose: () => void
    onsortasc: (col: string) => void
    onsortdesc: (col: string) => void
    onclearsort: (col: string) => void
    onfreeze: (col: string) => void
  } = $props()
</script>

{#if open}
  <div
    class="fixed inset-0 z-40"
    onclick={onclose}
    oncontextmenu={(e) => { e.preventDefault(); onclose() }}
  ></div>
  <div
    class="fixed z-50 min-w-44 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md"
    style="left: {x}px; top: {y}px;"
  >
    <div class="px-2 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide">{col}</div>
    <div class="my-0.5 h-px bg-border"></div>
    <button
      class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
      onclick={() => onsortasc(col)}
    >
      <ArrowUp class="h-3 w-3 text-muted-foreground" />
      오름차순 정렬
    </button>
    <button
      class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
      onclick={() => onsortdesc(col)}
    >
      <ArrowDown class="h-3 w-3 text-muted-foreground" />
      내림차순 정렬
    </button>
    {#if sortKeys.some((k) => k.col === col)}
      <button
        class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent"
        onclick={() => onclearsort(col)}
      >
        <X class="h-3 w-3" />
        정렬 해제
      </button>
    {/if}
    <div class="my-0.5 h-px bg-border"></div>
    <button
      class="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
      onclick={() => onfreeze(col)}
    >
      <span class="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-muted-foreground/40 {frozenCols.includes(col) ? 'bg-primary border-primary' : ''}">
        {#if frozenCols.includes(col)}
          <svg viewBox="0 0 12 12" class="h-2.5 w-2.5 text-primary-foreground" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 6l3 3 5-5" />
          </svg>
        {/if}
      </span>
      컬럼 고정
    </button>
  </div>
{/if}

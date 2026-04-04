<script lang="ts">
  import { Plus, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Save, X, Download, ChevronDown, Clipboard, Search, Copy, RefreshCw } from 'lucide-svelte'

  let {
    readonly,
    hasChanges,
    selectedRows,
    fetching,
    searchQuery,
    pageSize,
    currentPage,
    totalPages,
    totalCount,
    pageSizeOptions,
    onsave,
    oncancel,
    onadd,
    onduplicate,
    ondelete,
    onexportcsv,
    onexportinsert,
    oncopycsv,
    oncopyinsert,
    onrefresh,
    onsearchinput,
    onsearchclear,
    onpagesizechange,
    ongofirst,
    ongoprev,
    ongonext,
    ongolast,
  }: {
    readonly: boolean
    hasChanges: boolean
    selectedRows: Set<number>
    fetching: boolean
    searchQuery: string
    pageSize: number
    currentPage: number
    totalPages: number
    totalCount: number
    pageSizeOptions: number[]
    onsave: () => void
    oncancel: () => void
    onadd: () => void
    onduplicate: () => void
    ondelete: () => void
    onexportcsv: () => void
    onexportinsert: () => void
    oncopycsv: () => void
    oncopyinsert: () => void
    onrefresh: () => void
    onsearchinput: (value: string) => void
    onsearchclear: () => void
    onpagesizechange: (value: number) => void
    ongofirst: () => void
    ongoprev: () => void
    ongonext: () => void
    ongolast: () => void
  } = $props()

  let exportOpen = $state(false)
  let copyOpen = $state(false)
</script>

<div class="flex shrink-0 items-center justify-between border-b border-border px-2 py-1 gap-2">
  <div class="flex items-center gap-1">
    {#if !readonly}
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors
          {hasChanges ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/40 cursor-not-allowed'}"
        disabled={!hasChanges}
        onclick={onsave}
      >
        <Save class="h-3 w-3" />
        저장
      </button>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors
          {hasChanges ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'text-muted-foreground/40 cursor-not-allowed'}"
        disabled={!hasChanges}
        onclick={oncancel}
      >
        <X class="h-3 w-3" />
        취소
      </button>
      <div class="mx-1 h-4 w-px bg-border"></div>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        onclick={onadd}
      >
        <Plus class="h-3 w-3" />
        추가
      </button>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors
          {selectedRows.size > 0 ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'text-muted-foreground/40 cursor-not-allowed'}"
        disabled={selectedRows.size === 0}
        onclick={onduplicate}
      >
        <Copy class="h-3 w-3" />
        복제{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
      </button>
      <button
        class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors
          {selectedRows.size > 0 ? 'text-muted-foreground hover:bg-accent hover:text-destructive' : 'text-muted-foreground/40 cursor-not-allowed'}"
        disabled={selectedRows.size === 0}
        onclick={ondelete}
      >
        <Trash2 class="h-3 w-3" />
        삭제{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
      </button>
      <div class="mx-1 h-4 w-px bg-border"></div>

      <div class="relative">
        {#if exportOpen}
          <div class="fixed inset-0 z-40" onclick={() => exportOpen = false}></div>
        {/if}
        <button
          class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          onclick={() => { exportOpen = !exportOpen; copyOpen = false }}
        >
          <Download class="h-3 w-3" />
          Export
          <ChevronDown class="h-2.5 w-2.5" />
        </button>
        {#if exportOpen}
          <div class="absolute left-0 top-full z-50 mt-0.5 min-w-36 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
            <button
              class="flex w-full items-center px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
              onclick={() => { onexportcsv(); exportOpen = false }}
            >CSV (.csv)</button>
            <button
              class="flex w-full items-center px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
              onclick={() => { onexportinsert(); exportOpen = false }}
            >INSERT SQL (.sql)</button>
          </div>
        {/if}
      </div>

      <div class="relative">
        {#if copyOpen}
          <div class="fixed inset-0 z-40" onclick={() => copyOpen = false}></div>
        {/if}
        <button
          class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors
            {selectedRows.size > 0 ? 'text-muted-foreground hover:bg-accent hover:text-foreground' : 'text-muted-foreground/40 cursor-not-allowed'}"
          disabled={selectedRows.size === 0}
          onclick={() => { copyOpen = !copyOpen; exportOpen = false }}
        >
          <Clipboard class="h-3 w-3" />
          복사{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
          <ChevronDown class="h-2.5 w-2.5" />
        </button>
        {#if copyOpen}
          <div class="absolute left-0 top-full z-50 mt-0.5 min-w-40 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
            <button
              class="flex w-full items-center px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
              onclick={() => { oncopycsv(); copyOpen = false }}
            >CSV로 복사</button>
            <button
              class="flex w-full items-center px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
              onclick={() => { oncopyinsert(); copyOpen = false }}
            >INSERT SQL로 복사</button>
          </div>
        {/if}
      </div>
    {/if}
    <button
      class="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
      onclick={onrefresh}
    >
      <RefreshCw class="h-3 w-3 {fetching ? 'animate-spin' : ''}" />
    </button>
  </div>

  <div class="relative flex items-center">
    <Search class="pointer-events-none absolute left-2 h-3 w-3 text-muted-foreground/60" />
    <input
      type="text"
      value={searchQuery}
      placeholder="값으로 필터..."
      class="h-6 w-48 rounded border border-border bg-background pl-6 pr-6 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-0"
      oninput={(e) => onsearchinput((e.target as HTMLInputElement).value)}
    />
    {#if searchQuery}
      <button
        class="absolute right-1.5 text-muted-foreground/60 hover:text-foreground"
        onclick={onsearchclear}
      >
        <X class="h-3 w-3" />
      </button>
    {/if}
  </div>
  <span class="text-[11px] text-muted-foreground shrink-0">총 {totalCount}개 행</span>

  <div class="flex items-center gap-1.5">
    <select
      value={pageSize}
      class="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground outline-none"
      onchange={(e) => onpagesizechange(Number((e.target as HTMLSelectElement).value))}
    >
      {#each pageSizeOptions as size}
        <option value={size}>{size === 0 ? '전체' : `${size}개씩`}</option>
      {/each}
    </select>
    <div class="flex items-center gap-0.5">
      <button
        class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        disabled={currentPage === 1}
        onclick={ongofirst}
      >
        <ChevronsLeft class="h-3.5 w-3.5" />
      </button>
      <button
        class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        disabled={currentPage === 1}
        onclick={ongoprev}
      >
        <ChevronLeft class="h-3.5 w-3.5" />
      </button>
      <span class="min-w-16 text-center text-[11px] text-muted-foreground">
        {currentPage} / {totalPages}
      </span>
      <button
        class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        disabled={currentPage === totalPages}
        onclick={ongonext}
      >
        <ChevronRight class="h-3.5 w-3.5" />
      </button>
      <button
        class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        disabled={currentPage === totalPages}
        onclick={ongolast}
      >
        <ChevronsRight class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</div>

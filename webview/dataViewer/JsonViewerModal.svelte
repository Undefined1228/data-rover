<script lang="ts">
  import { Copy, X } from 'lucide-svelte'

  let {
    open,
    title,
    content,
    copied,
    onclose,
    oncopy,
  }: {
    open: boolean
    title: string
    content: string
    copied: boolean
    onclose: () => void
    oncopy: () => void
  } = $props()
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={onclose}
  >
    <div
      class="relative flex w-[560px] max-w-[90vw] flex-col rounded-lg border border-border bg-background shadow-xl"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span class="text-[13px] font-medium text-foreground">{title}</span>
        <div class="flex items-center gap-1">
          <button
            class="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors
              {copied ? 'text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
            onclick={oncopy}
          >
            <Copy class="h-3 w-3" />
            {copied ? '복사됨' : '복사'}
          </button>
          <button
            class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onclick={onclose}
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <pre class="max-h-[60vh] overflow-auto p-4 text-[12px] text-foreground font-mono leading-relaxed whitespace-pre-wrap break-all">{content}</pre>
    </div>
  </div>
{/if}

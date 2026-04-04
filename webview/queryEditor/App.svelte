<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '$shared/api'
  import QueryEditor from './QueryEditor.svelte'

  let dbType = $state<string | null>(null)

  onMount(async () => {
    const info = await api.request<{ dbType: string }>('webview:ready')
    dbType = info.dbType
  })
</script>

<div class="h-screen overflow-hidden bg-background text-foreground">
  {#if dbType !== null}
    <QueryEditor {dbType} />
  {/if}
</div>

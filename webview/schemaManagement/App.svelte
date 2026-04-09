<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '$shared/api'
  import CreateSchemaDialog from './CreateSchemaDialog.svelte'
  import EditSchemaDialog from './EditSchemaDialog.svelte'
  import DropSchemaDialog from './DropSchemaDialog.svelte'
  import CreateTableDialog from './CreateTableDialog.svelte'
  import AlterTableDialog from './AlterTableDialog.svelte'
  import CreateViewDialog from './CreateViewDialog.svelte'
  import CreateIndexDialog from './CreateIndexDialog.svelte'
  import DDLDialog from './DDLDialog.svelte'
  import type { TableInfo, ColumnInfo } from './types'

  let dialogType = $state('')
  let dialogData = $state<Record<string, unknown>>({})

  onMount(async () => {
    const data = await api.request<{ dialogType: string; dialogData: Record<string, unknown> }>('webview:ready')
    dialogType = data.dialogType
    dialogData = data.dialogData
  })
</script>

{#if dialogType === 'createSchema'}
  <CreateSchemaDialog />
{:else if dialogType === 'alterSchema'}
  <EditSchemaDialog
    schemaName={dialogData.schemaName as string}
    currentOwner={dialogData.currentOwner as string}
  />
{:else if dialogType === 'dropSchema'}
  <DropSchemaDialog schemaName={dialogData.schemaName as string} />
{:else if dialogType === 'createTable'}
  <CreateTableDialog schemaName={dialogData.schemaName as string} dbType={dialogData.dbType as string} />
{:else if dialogType === 'alterTable'}
  <AlterTableDialog
    schemaName={dialogData.schemaName as string}
    tableInfo={dialogData.tableInfo as TableInfo}
    dbType={dialogData.dbType as string}
  />
{:else if dialogType === 'createView'}
  <CreateViewDialog schemaName={dialogData.schemaName as string} />
{:else if dialogType === 'alterView'}
  <CreateViewDialog
    schemaName={dialogData.schemaName as string}
    editViewName={dialogData.editViewName as string}
  />
{:else if dialogType === 'createIndex'}
  <CreateIndexDialog
    schemaName={dialogData.schemaName as string}
    tableName={dialogData.tableName as string}
    tableColumns={dialogData.tableColumns as ColumnInfo[]}
  />
{:else if dialogType === 'showDDL'}
  <DDLDialog dbType={dialogData.dbType as string} />
{/if}

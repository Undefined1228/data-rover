<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
  import { EditorState, Compartment } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import { sql, PostgreSQL } from '@codemirror/lang-sql'
  import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
  import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
  import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
  import { api } from '$shared/api'

  let { schemaName, editViewName }: { schemaName: string; editViewName?: string } = $props()

  const isEdit = editViewName !== undefined

  const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_$]*$/

  let viewName = $state(editViewName ?? '')
  let selectQuery = $state('')
  let viewNameError = $state(false)
  let queryError = $state(false)
  let saving = $state(false)
  let loading = $state(false)
  let error = $state<string | null>(null)

  let editorContainer = $state<HTMLDivElement | null>(null)
  let view: EditorView | undefined

  const highlightCompartment = new Compartment()

  function isDark(): boolean {
    return document.body.dataset.vscodeThemeKind !== 'vscode-light'
  }

  function buildHighlightExtension() {
    return syntaxHighlighting(isDark() ? oneDarkHighlightStyle : defaultHighlightStyle, { fallback: true })
  }

  const baseTheme = EditorView.theme({
    '&': { height: '100%' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: 'var(--vscode-editor-font-family, ui-monospace, monospace)',
      fontSize: '12px',
      lineHeight: '1.6',
    },
    '.cm-content': { padding: '8px 12px' },
    '.cm-cursor': { borderLeftColor: 'var(--vscode-foreground)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-foreground))' },
    '.cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--vscode-focusBorder) 25%, transparent) !important' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--vscode-focusBorder) 25%, transparent) !important' },
    '.cm-gutters': {
      backgroundColor: 'var(--vscode-input-background)',
      borderRight: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.2))',
      color: 'color-mix(in srgb, var(--vscode-foreground) 40%, transparent)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--vscode-editor-background) 75%, var(--vscode-foreground))',
    },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px', minWidth: '28px' },
    '.cm-tooltip': {
      border: '1px solid var(--vscode-panel-border, rgba(128,128,128,0.3))',
      backgroundColor: 'var(--vscode-editorHoverWidget-background, var(--vscode-editor-background))',
      borderRadius: '4px',
      overflow: 'hidden',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--vscode-list-activeSelectionBackground)',
      color: 'var(--vscode-list-activeSelectionForeground)',
    },
  })

  onMount(() => {
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
          sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              selectQuery = update.state.doc.toString()
              queryError = false
            }
          }),
        ],
      }),
      parent: editorContainer,
    })

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      view?.dispatch({ effects: highlightCompartment.reconfigure(buildHighlightExtension()) })
    })

    if (isEdit) loadViewDefinition()
  })

  onDestroy(() => view?.destroy())

  async function loadViewDefinition(): Promise<void> {
    loading = true
    try {
      const data = await api.request<{ ddl?: string; error?: string }>('db:object-ddl', {
        schema: schemaName,
        name: editViewName,
        type: 'view',
      })
      if (data.error) throw new Error(data.error)
      const ddl = data.ddl ?? ''
      const prefix = `CREATE OR REPLACE VIEW "${schemaName}"."${editViewName}" AS\n`
      const query = ddl.startsWith(prefix) ? ddl.slice(prefix.length) : ddl
      selectQuery = query
      if (view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: query } })
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      loading = false
    }
  }

  function validate(): boolean {
    let valid = true
    if (!viewName.trim() || !IDENT_RE.test(viewName.trim())) {
      viewNameError = true
      valid = false
    }
    if (!selectQuery.trim()) {
      queryError = true
      valid = false
    }
    return valid
  }

  async function handleSave(): Promise<void> {
    if (!validate()) return
    saving = true
    error = null
    try {
      if (isEdit) {
        const newName = viewName.trim() !== editViewName ? viewName.trim() : undefined
        const data = await api.request<{ ok: boolean; message?: string }>('view:alter', {
          schema: schemaName,
          name: editViewName,
          newName,
          newQuery: selectQuery.trim(),
        })
        if (!data.ok) error = data.message ?? '수정 실패'
      } else {
        const data = await api.request<{ ok: boolean; message?: string }>('view:create', {
          schema: schemaName,
          name: viewName.trim(),
          query: selectQuery.trim(),
        })
        if (!data.ok) error = data.message ?? '생성 실패'
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      saving = false
    }
  }
</script>

<div class="dialog-root">
  <div class="dialog-header">
    <h2>{isEdit ? '뷰 수정' : '뷰 생성'}</h2>
    <p><span class="mono">{schemaName}</span> 스키마의 뷰를 {isEdit ? '수정' : '생성'}합니다.</p>
  </div>

  <div class="dialog-body">
    {#if loading}
      <div class="loading-row">뷰 정의 로딩 중...</div>
    {:else}
      <div class="form-row">
        <label class="form-label" for="view-name">뷰 이름 *</label>
        <div class="form-control">
          <input
            id="view-name"
            class="form-input {viewNameError ? 'input-error' : ''}"
            bind:value={viewName}
            oninput={() => (viewNameError = false)}
            placeholder="my_view"
          />
          {#if viewNameError}
            <p class="error-text">영문자/밑줄로 시작하고 영문자·숫자·밑줄·$만 사용 가능합니다.</p>
          {/if}
        </div>
      </div>

      <div class="editor-section">
        <div class="editor-label-row">
          <label class="form-label-inline">SELECT 쿼리 *</label>
          {#if queryError}
            <span class="error-text">쿼리를 입력하세요.</span>
          {/if}
        </div>
        <div class="ddl-prefix">
          CREATE OR REPLACE VIEW <span class="prefix-highlight">{schemaName}.{viewName || '<뷰 이름>'}</span> AS
        </div>
        <div class="editor-wrap {queryError ? 'editor-error' : ''}">
          <div bind:this={editorContainer} class="editor-inner"></div>
        </div>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="error-box">{error}</div>
  {/if}

  <div class="dialog-footer">
    <button class="btn btn-primary" onclick={handleSave} disabled={saving || loading}>
      {saving ? (isEdit ? '수정 중...' : '생성 중...') : (isEdit ? '수정' : '생성')}
    </button>
  </div>
</div>

<style>
  .dialog-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 560px;
    margin: 0 auto;
    padding: 0 16px;
    font-size: 13px;
    color: var(--vscode-foreground);
  }

  .dialog-header {
    flex-shrink: 0;
    padding: 16px 0 12px;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  }

  .dialog-header h2 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
  }

  .dialog-header p {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .mono {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
  }

  .dialog-body {
    flex: 1;
    padding: 16px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .loading-row {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    padding: 24px 0;
    text-align: center;
  }

  .form-row {
    display: grid;
    grid-template-columns: 80px 1fr;
    align-items: start;
    gap: 8px;
    flex-shrink: 0;
  }

  .form-label {
    text-align: right;
    font-size: 12px;
    padding-top: 5px;
    color: var(--vscode-foreground);
    white-space: nowrap;
  }

  .form-control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-input {
    height: 26px;
    padding: 0 8px;
    font-size: 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .form-input:focus {
    border-color: var(--vscode-focusBorder);
  }

  .form-input.input-error {
    border-color: var(--vscode-inputValidation-errorBorder);
  }

  .editor-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  .editor-label-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-label-inline {
    font-size: 12px;
    color: var(--vscode-foreground);
  }

  .ddl-prefix {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    padding: 4px 10px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
    border-radius: 2px;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .prefix-highlight {
    color: var(--vscode-foreground);
  }

  .editor-wrap {
    flex: 1;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
    border-radius: 2px;
    overflow: hidden;
    min-height: 200px;
  }

  .editor-wrap.editor-error {
    border-color: var(--vscode-inputValidation-errorBorder);
  }

  .editor-inner {
    height: 100%;
    background: var(--vscode-input-background);
  }

  .error-text {
    font-size: 11px;
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground));
  }

  .error-box {
    padding: 8px 10px;
    font-size: 12px;
    border-radius: 3px;
    background: var(--vscode-inputValidation-errorBackground, rgba(220, 53, 69, 0.1));
    color: var(--vscode-errorForeground, #dc3545);
    border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(220, 53, 69, 0.4));
    margin-bottom: 8px;
    flex-shrink: 0;
  }

  .dialog-footer {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 10px 0 16px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  }

  .btn {
    height: 26px;
    padding: 0 14px;
    font-size: 12px;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground);
  }
</style>

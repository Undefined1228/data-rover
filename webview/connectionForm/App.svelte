<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '$shared/api'

  type DbType = 'postgresql' | 'mysql' | 'mariadb'
  type InputMode = 'hostPort' | 'url'
  type SshAuthMethod = 'password' | 'key'

  const dbTypes: { value: DbType; label: string; defaultPort: string; protocol: string }[] = [
    { value: 'postgresql', label: 'PostgreSQL', defaultPort: '5432', protocol: 'postgresql' },
    { value: 'mysql', label: 'MySQL', defaultPort: '3306', protocol: 'mysql' },
    { value: 'mariadb', label: 'MariaDB', defaultPort: '3306', protocol: 'mysql' },
  ]

  let name = $state('')
  let dbType = $state<DbType>('postgresql')
  let inputMode = $state<InputMode>('hostPort')
  let host = $state('localhost')
  let port = $state('5432')
  let databaseName = $state('')
  let username = $state('')
  let password = $state('')
  let url = $state('')
  let color = $state('')

  let sshEnabled = $state(false)
  let sshHost = $state('')
  let sshPort = $state('22')
  let sshUsername = $state('')
  let sshAuthMethod = $state<SshAuthMethod>('password')
  let sshPassword = $state('')
  let sshKeyPath = $state('')
  let sshPassphrase = $state('')

  let errors = $state<Set<string>>(new Set())
  let testing = $state(false)
  let saving = $state(false)
  let testResult = $state<{ ok: boolean; message: string } | null>(null)
  let pasteError = $state('')
  let isEditMode = $state(false)

  onMount(() => {
    api.request<unknown>('conn:get').then((data) => {
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>
        isEditMode = true
        name = String(d.name ?? '')
        dbType = (d.dbType as DbType) ?? 'postgresql'
        inputMode = (d.inputMode as InputMode) ?? 'hostPort'
        host = String(d.host ?? 'localhost')
        port = String(d.port ?? '')
        databaseName = String(d.databaseName ?? '')
        username = String(d.username ?? '')
        password = String(d.password ?? '')
        url = String(d.url ?? '')
        color = String(d.color ?? '')
        sshEnabled = Boolean(d.sshEnabled)
        sshHost = String(d.sshHost ?? '')
        sshPort = String(d.sshPort ?? '22')
        sshUsername = String(d.sshUsername ?? '')
        sshAuthMethod = (d.sshAuthMethod as SshAuthMethod) ?? 'password'
        sshPassword = String(d.sshPassword ?? '')
        sshKeyPath = String(d.sshKeyPath ?? '')
        sshPassphrase = String(d.sshPassphrase ?? '')
      }
    })
  })

  function onDbTypeChange(value: DbType): void {
    dbType = value
    const selected = dbTypes.find((t) => t.value === value)
    if (selected) port = selected.defaultPort
    errors = new Set()
    testResult = null
  }

  function onUrlInput(): void {
    clearError('url')
    const match = url.match(/^(\w+):\/\//)
    if (!match) return
    const protocol = match[1].toLowerCase()
    const found = dbTypes.find((t) => t.protocol === protocol)
    if (found && found.value !== dbType) {
      dbType = found.value
    }
  }

  function parseJdbcUrl(raw: string): boolean {
    const cleaned = raw.trim().replace(/^jdbc:/i, '')
    const match = cleaned.match(
      /^(\w+):\/\/(?:([^:@]+)(?::([^@]*))?@)?([^/:?]+)(?::(\d+))?(\/[^?]*)?(?:\?(.*))?/,
    )
    if (!match) return false
    const protocol = match[1].toLowerCase()
    const found = dbTypes.find((t) => t.protocol === protocol || t.value === protocol)
    if (!found) return false
    dbType = found.value
    host = match[4] ?? 'localhost'
    port = match[5] ? match[5] : found.defaultPort
    databaseName = match[6] ? match[6].replace(/^\//, '') : ''

    const params = new URLSearchParams(match[7] ?? '')
    const urlUser = match[2] ? decodeURIComponent(match[2]) : undefined
    const urlPass = match[3] ? decodeURIComponent(match[3]) : undefined
    const paramUser = params.get('user') ?? params.get('username') ?? undefined
    const paramPass = params.get('password') ?? undefined

    if (urlUser) username = urlUser
    else if (paramUser) username = paramUser
    if (urlPass) password = urlPass
    else if (paramPass) password = paramPass

    inputMode = 'hostPort'
    errors = new Set()
    testResult = null
    return true
  }

  function parseDataGripXml(text: string): boolean {
    const jdbcUrlMatch = text.match(/<jdbc-url>(.*?)<\/jdbc-url>/)
    if (!jdbcUrlMatch) return false
    const ok = parseJdbcUrl(jdbcUrlMatch[1])
    if (!ok) return false
    const userMatch = text.match(/<user-name>(.*?)<\/user-name>/)
    if (userMatch) username = userMatch[1]
    const nameMatch = text.match(/<data-source[^>]+name="([^"]+)"/)
    if (nameMatch) name = nameMatch[1]
    return true
  }

  async function handlePasteFromClipboard(): Promise<void> {
    pasteError = ''
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        pasteError = '클립보드가 비어 있습니다.'
        return
      }
      const ok = text.includes('<jdbc-url>') ? parseDataGripXml(text) : parseJdbcUrl(text)
      if (!ok) {
        pasteError = '지원하지 않는 형식입니다. (DataGrip 데이터소스 복사 또는 JDBC URL)'
      }
    } catch {
      pasteError = '클립보드 읽기 권한이 없습니다.'
    }
  }

  let generatedUrl = $derived.by(() => {
    const db = dbTypes.find((t) => t.value === dbType)
    return `${db?.protocol}://${host}:${port}${databaseName ? `/${databaseName}` : ''}`
  })

  function clearError(field: string): void {
    errors.delete(field)
    errors = new Set(errors)
  }

  function hasError(field: string): boolean {
    return errors.has(field)
  }

  function validate(): boolean {
    const newErrors = new Set<string>()
    if (!name.trim()) newErrors.add('name')
    if (inputMode === 'url') {
      if (!url.trim()) newErrors.add('url')
    } else {
      if (!host.trim()) newErrors.add('host')
      if (!port.trim()) newErrors.add('port')
    }
    if (sshEnabled) {
      if (!sshHost.trim()) newErrors.add('sshHost')
      if (!sshUsername.trim()) newErrors.add('sshUsername')
      if (sshAuthMethod === 'password' && !sshPassword) newErrors.add('sshPassword')
      if (sshAuthMethod === 'key' && !sshKeyPath.trim()) newErrors.add('sshKeyPath')
    }
    errors = newErrors
    return newErrors.size === 0
  }

  function buildFormData() {
    return {
      name,
      dbType,
      inputMode,
      host,
      port,
      databaseName,
      username,
      password,
      url,
      color,
      sshEnabled,
      sshHost: sshEnabled ? sshHost : '',
      sshPort: sshEnabled ? sshPort : '',
      sshUsername: sshEnabled ? sshUsername : '',
      sshAuthMethod,
      sshPassword: sshEnabled && sshAuthMethod === 'password' ? sshPassword : '',
      sshKeyPath: sshEnabled && sshAuthMethod === 'key' ? sshKeyPath : '',
      sshPassphrase: sshEnabled && sshAuthMethod === 'key' ? sshPassphrase : '',
    }
  }

  async function handleTest(): Promise<void> {
    if (!validate()) return
    testing = true
    testResult = null
    try {
      const result = await api.request<{ ok: boolean; message: string }>(
        'db:test-connection',
        buildFormData(),
      )
      testResult = result
    } catch (err) {
      testResult = { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      testing = false
    }
  }

  async function handleSave(): Promise<void> {
    if (!validate()) return
    saving = true
    try {
      const result = await api.request<{ ok: boolean; message?: string }>(
        'conn:save',
        buildFormData(),
      )
      if (!result.ok) {
        testResult = { ok: false, message: result.message ?? '저장 실패' }
      }
    } catch (err) {
      testResult = { ok: false, message: err instanceof Error ? err.message : String(err) }
    } finally {
      saving = false
    }
  }

  function handleCancel(): void {
    api.request('conn:cancel').catch(() => {})
  }
</script>

<div class="form-root">
  <div class="form-header">
    <h2>{isEditMode ? '연결 편집' : '새 연결'}</h2>
    <p>{isEditMode ? '연결 정보를 수정하세요.' : '데이터베이스 연결 정보를 입력하세요.'}</p>
  </div>

  <div class="form-body">
    <div class="form-row">
      <label class="form-label muted">DataGrip</label>
      <div class="form-control">
        <button class="btn btn-secondary btn-sm" onclick={handlePasteFromClipboard} type="button">
          클립보드에서 가져오기
        </button>
        {#if pasteError}
          <p class="error-text">{pasteError}</p>
        {/if}
      </div>
    </div>

    <div class="form-row">
      <label class="form-label" for="conn-name">연결 이름 *</label>
      <input
        id="conn-name"
        class="form-input {hasError('name') ? 'input-error' : ''}"
        bind:value={name}
        oninput={() => clearError('name')}
        placeholder="My Database"
      />
    </div>

    <div class="form-row">
      <label class="form-label" for="conn-dbtype">DB 유형</label>
      <select
        id="conn-dbtype"
        class="form-select"
        value={dbType}
        onchange={(e) => onDbTypeChange((e.currentTarget as HTMLSelectElement).value as DbType)}
      >
        {#each dbTypes as dt}
          <option value={dt.value}>{dt.label}</option>
        {/each}
      </select>
    </div>

    <div class="form-row">
      <label class="form-label">입력 방식</label>
      <div class="radio-group">
        <label class="radio-label">
          <input
            type="radio"
            name="inputMode"
            value="hostPort"
            checked={inputMode === 'hostPort'}
            onchange={() => {
              inputMode = 'hostPort'
              errors = new Set()
              testResult = null
            }}
          />
          호스트/포트
        </label>
        <label class="radio-label">
          <input
            type="radio"
            name="inputMode"
            value="url"
            checked={inputMode === 'url'}
            onchange={() => {
              inputMode = 'url'
              errors = new Set()
              testResult = null
            }}
          />
          URL
        </label>
      </div>
    </div>

    {#if inputMode === 'url'}
      <div class="form-row">
        <label class="form-label" for="conn-url">URL *</label>
        <input
          id="conn-url"
          class="form-input monospace {hasError('url') ? 'input-error' : ''}"
          bind:value={url}
          oninput={onUrlInput}
          placeholder="{dbTypes.find((t) => t.value === dbType)?.protocol}://host:port/db"
        />
      </div>
      <div class="form-row">
        <label class="form-label" for="conn-username-url">사용자명</label>
        <input id="conn-username-url" class="form-input" bind:value={username} />
      </div>
      <div class="form-row">
        <label class="form-label" for="conn-password-url">비밀번호</label>
        <input id="conn-password-url" type="password" class="form-input" bind:value={password} />
      </div>
    {:else}
      <div class="form-row">
        <label class="form-label" for="conn-host">호스트 *</label>
        <input
          id="conn-host"
          class="form-input {hasError('host') ? 'input-error' : ''}"
          bind:value={host}
          oninput={() => clearError('host')}
          placeholder="localhost"
        />
      </div>
      <div class="form-row">
        <label class="form-label" for="conn-port">포트 *</label>
        <input
          id="conn-port"
          type="number"
          class="form-input {hasError('port') ? 'input-error' : ''}"
          bind:value={port}
          oninput={() => clearError('port')}
        />
      </div>
      <div class="form-row">
        <label class="form-label" for="conn-db">데이터베이스</label>
        <input id="conn-db" class="form-input" bind:value={databaseName} />
      </div>
      <div class="form-row">
        <label class="form-label" for="conn-username">사용자명</label>
        <input id="conn-username" class="form-input" bind:value={username} />
      </div>
      <div class="form-row">
        <label class="form-label" for="conn-password">비밀번호</label>
        <input id="conn-password" type="password" class="form-input" bind:value={password} />
      </div>
      <div class="form-row">
        <label class="form-label muted">URL 미리보기</label>
        <div class="url-preview">{generatedUrl}</div>
      </div>
    {/if}

    <div class="section-divider">
      <div class="form-row">
        <label class="form-label" for="ssh-toggle">SSH 터널</label>
        <div class="checkbox-row">
          <input
            id="ssh-toggle"
            type="checkbox"
            bind:checked={sshEnabled}
          />
          <label for="ssh-toggle" class="checkbox-label">SSH 터널링 사용</label>
        </div>
      </div>

      {#if sshEnabled}
        <div class="ssh-section">
          <div class="form-row">
            <label class="form-label" for="ssh-host">SSH 호스트 *</label>
            <input
              id="ssh-host"
              class="form-input {hasError('sshHost') ? 'input-error' : ''}"
              bind:value={sshHost}
              oninput={() => clearError('sshHost')}
              placeholder="ssh.example.com"
            />
          </div>
          <div class="form-row">
            <label class="form-label" for="ssh-port">SSH 포트</label>
            <input
              id="ssh-port"
              type="number"
              class="form-input"
              bind:value={sshPort}
            />
          </div>
          <div class="form-row">
            <label class="form-label" for="ssh-username">SSH 사용자명 *</label>
            <input
              id="ssh-username"
              class="form-input {hasError('sshUsername') ? 'input-error' : ''}"
              bind:value={sshUsername}
              oninput={() => clearError('sshUsername')}
              placeholder="ubuntu"
            />
          </div>
          <div class="form-row">
            <label class="form-label">인증 방식</label>
            <div class="radio-group">
              <label class="radio-label">
                <input
                  type="radio"
                  name="sshAuthMethod"
                  value="password"
                  checked={sshAuthMethod === 'password'}
                  onchange={() => (sshAuthMethod = 'password')}
                />
                비밀번호
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="sshAuthMethod"
                  value="key"
                  checked={sshAuthMethod === 'key'}
                  onchange={() => (sshAuthMethod = 'key')}
                />
                개인키
              </label>
            </div>
          </div>

          {#if sshAuthMethod === 'password'}
            <div class="form-row">
              <label class="form-label" for="ssh-password">SSH 비밀번호 *</label>
              <input
                id="ssh-password"
                type="password"
                class="form-input {hasError('sshPassword') ? 'input-error' : ''}"
                bind:value={sshPassword}
                oninput={() => clearError('sshPassword')}
              />
            </div>
          {:else}
            <div class="form-row">
              <label class="form-label" for="ssh-keypath">개인키 경로 *</label>
              <input
                id="ssh-keypath"
                class="form-input monospace {hasError('sshKeyPath') ? 'input-error' : ''}"
                bind:value={sshKeyPath}
                oninput={() => clearError('sshKeyPath')}
                placeholder="~/.ssh/id_rsa"
              />
            </div>
            <div class="form-row">
              <label class="form-label" for="ssh-passphrase">키 패스프레이즈</label>
              <input
                id="ssh-passphrase"
                type="password"
                class="form-input"
                bind:value={sshPassphrase}
                placeholder="(선택사항)"
              />
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if testResult}
    <div class="test-result {testResult.ok ? 'result-ok' : 'result-error'}">
      {testResult.message}
    </div>
  {/if}

  <div class="form-footer">
    <button class="btn btn-secondary" onclick={handleTest} disabled={testing} type="button">
      {testing ? '테스트 중...' : '연결 테스트'}
    </button>
    <div class="footer-actions">
      <button class="btn btn-secondary" onclick={handleCancel} type="button">취소</button>
      <button class="btn btn-primary" onclick={handleSave} disabled={saving} type="button">
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  </div>
</div>

<style>
  .form-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 560px;
    margin: 0 auto;
    padding: 0 16px;
    font-size: 13px;
    color: var(--vscode-foreground);
  }

  .form-header {
    flex-shrink: 0;
    padding: 16px 0 12px;
    border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  }

  .form-header h2 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
  }

  .form-header p {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  .form-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 110px 1fr;
    align-items: center;
    gap: 8px;
  }

  .form-label {
    text-align: right;
    font-size: 12px;
    color: var(--vscode-foreground);
    white-space: nowrap;
  }

  .form-label.muted {
    color: var(--vscode-descriptionForeground);
  }

  .form-control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-input,
  .form-select {
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

  .form-input:focus,
  .form-select:focus {
    border-color: var(--vscode-focusBorder);
  }

  .form-input.input-error {
    border-color: var(--vscode-inputValidation-errorBorder);
  }

  .form-input.monospace {
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .form-select {
    cursor: pointer;
  }

  .radio-group {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    cursor: pointer;
  }

  .radio-label input[type='radio'] {
    accent-color: var(--vscode-focusBorder);
    cursor: pointer;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .checkbox-row input[type='checkbox'] {
    accent-color: var(--vscode-focusBorder);
    cursor: pointer;
  }

  .checkbox-label {
    font-size: 12px;
    cursor: pointer;
  }

  .url-preview {
    height: 26px;
    padding: 0 8px;
    display: flex;
    align-items: center;
    background: var(--vscode-textBlockQuote-background, var(--vscode-input-background));
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    overflow-x: auto;
    white-space: nowrap;
  }

  .section-divider {
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    padding-top: 10px;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ssh-section {
    background: var(--vscode-textBlockQuote-background, rgba(128, 128, 128, 0.1));
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    border-radius: 4px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .error-text {
    font-size: 11px;
    color: var(--vscode-inputValidation-errorForeground, var(--vscode-errorForeground));
  }

  .test-result {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 12px;
    border-radius: 3px;
    margin: 4px 0;
  }

  .result-ok {
    background: rgba(40, 167, 69, 0.15);
    color: var(--vscode-testing-iconPassed, #28a745);
    border: 1px solid rgba(40, 167, 69, 0.3);
  }

  .result-error {
    background: var(--vscode-inputValidation-errorBackground, rgba(220, 53, 69, 0.1));
    color: var(--vscode-errorForeground, #dc3545);
    border: 1px solid var(--vscode-inputValidation-errorBorder, rgba(220, 53, 69, 0.4));
  }

  .form-footer {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0 16px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
    gap: 8px;
  }

  .footer-actions {
    display: flex;
    gap: 6px;
  }

  .btn {
    height: 26px;
    padding: 0 12px;
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

  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
  }
</style>

# Architecture 결정사항

## 전체 구조

```
Extension Host (Node.js)
├── ConnectionManager         ← app-db.ts + connection-repository.ts 대체
├── SecretStore               ← Electron safeStorage → VSCode SecretStorage
├── DB 드라이버               ← src/main/db/*.ts 그대로 이식
│   ├── postgres.ts           ← connection-utils.ts + query.ts 발췌
│   └── mysql.ts
├── SSH 터널                  ← ssh-tunnel.ts 그대로 이식
├── TreeDataProvider          ← 새로 구현 (사이드바 스키마 트리)
└── WebviewPanel 메시지 라우터 ← ipcMain 핸들러 → postMessage 핸들러로 변환

Webview (브라우저)
├── Svelte 5 컴포넌트         ← src/renderer/src/components/*.svelte 재활용
├── Tailwind v4               ← 그대로 유지
├── shadcn-svelte             ← 그대로 유지
├── CodeMirror 6              ← QueryEditor.svelte 재활용
├── window.api.* 호출         ← postMessage 기반으로 교체
└── 테마                      ← VSCode 테마 자동 감지 (ThemeToggle 제거)
```

## IPC → postMessage 변환 원칙

```
기존 (Electron)
  window.api.executeQuery(...)  →  ipcRenderer.invoke('db:execute-query', ...)
  ipcMain.handle('db:execute-query', handler)

변환 후 (VSCode)
  vscode.postMessage({ type: 'db:execute-query', payload: ... })
  panel.webview.onDidReceiveMessage → handler → panel.webview.postMessage(result)
```

- 채널명은 기존 IPC 채널명(`db:execute-query` 등)을 그대로 사용
- `window.api` 객체는 얇은 postMessage 래퍼로 교체
- 모든 DB 접근은 Extension Host에서만 수행

## UI 전략

| 영역 | 구현 방식 | 원본 파일 |
|------|-----------|-----------|
| 스키마 탐색 사이드바 | VSCode `TreeDataProvider` 네이티브 | SchemaTree.svelte 참고 |
| 연결 추가/수정 폼 | `WebviewPanel` + ConnectionDialog.svelte | ConnectionDialog.svelte 재활용 |
| 쿼리 에디터 | `WebviewPanel` + QueryEditor.svelte | QueryEditor.svelte 재활용 |
| 데이터 뷰어 | `WebviewPanel` + DataViewerTab.svelte | DataViewerTab.svelte 재활용 |
| ER 다이어그램 | `WebviewPanel` + ErDiagramTab.svelte | ErDiagramTab.svelte 재활용 |
| 세션 모니터 | `WebviewPanel` + MonitorTab.svelte | MonitorTab.svelte 재활용 |

## 데이터 저장

| 데이터 | 기존 | 변환 후 |
|--------|------|---------|
| 연결 정보 (host, port 등) | SQLite `app.db` | `ExtensionContext.globalState` |
| 비밀번호 | Electron `safeStorage` | `ExtensionContext.secrets` (SecretStorage) |
| SSH 키 경로 | SQLite `app.db` | `globalState` |
| 쿼리 히스토리 | SQLite `app.db` | `globalState` (최근 100건) |

## 테마 처리

기존 `ThemeToggle.svelte`와 `stores/theme.ts`의 수동 토글은 제거.

Webview에서 VSCode 테마를 자동으로 따라가는 방식으로 변경:
```html
<!-- VSCode가 body에 자동으로 주입하는 속성 -->
<body data-vscode-theme-kind="vscode-dark">
```
```css
/* Tailwind dark mode: 'class' 전략 대신 selector 전략 사용 */
body[data-vscode-theme-kind="vscode-dark"] { ... }
body[data-vscode-theme-kind="vscode-light"] { ... }
```

shadcn-svelte의 dark 클래스는 `data-vscode-theme-kind` 값을 읽어 `document.documentElement`에 `dark` 클래스를 자동 토글하는 초기화 스크립트로 대체.

## Webview 번들

- Webview 소스: `webview/` 폴더 (기존 renderer 코드 이식)
- 번들러: Vite (기존 설정 재활용)
- Tailwind v4: `@tailwindcss/vite` 플러그인 그대로 사용
- `ThemeToggle.svelte` 제거, `stores/theme.ts` 제거

## 주요 의존성

| 패키지 | 용도 | 출처 |
|--------|------|------|
| `pg` | PostgreSQL | 기존 유지 |
| `mysql2` | MySQL/MariaDB | 기존 유지 |
| `ssh2` | SSH 터널 | 기존 유지 |
| `@codemirror/*` | 쿼리 에디터 | 기존 유지 |
| `sql-formatter` | SQL 포맷팅 | 기존 유지 |
| `@dagrejs/dagre` | ER 다이어그램 | 기존 유지 |
| `svelte` | UI | 기존 유지 |
| `bits-ui`, `shadcn-svelte` | UI 컴포넌트 | 기존 유지 |
| `better-sqlite3` | 로컬 저장소 제거로 불필요 | **제거** |
| `electron-*` | 모두 제거 | **제거** |

## Extension Host 번들

- 번들러: `esbuild`
- Entry: `src/extension.ts`
- External: `vscode`, `pg`, `mysql2`, `ssh2` (네이티브 모듈)
- Format: `cjs`, platform: `node`

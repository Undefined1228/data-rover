# Phase 1: 프로젝트 기반 설정

## 목표
빌드 파이프라인과 폴더 구조를 확립한다. 이후 모든 Phase의 토대.

---

## 체크리스트

### 1-1. 패키지 구성
- [x] `package.json` 작성
  - devDependencies: `typescript`, `esbuild`, `@types/vscode`, `eslint`, `@typescript-eslint/*`, `svelte`, `vite`, `@tailwindcss/vite`, `svelte-check`
  - dependencies: `pg`, `@types/pg`, `mysql2`, `ssh2`, `@types/ssh2`, `sql-formatter`, `@dagrejs/dagre`
  - `better-sqlite3` 제외 (로컬 저장소를 globalState로 대체)

### 1-2. Extension Host 빌드 설정
- [x] `build.mjs` (esbuild 스크립트) 작성
  - Entry: `src/extension.ts` → `out/extension.js`
  - format: `cjs`, platform: `node`
  - external: `vscode`, `pg`, `mysql2`, `ssh2`
  - watch 모드 지원

### 1-3. Webview 빌드 설정
- [x] `webview/vite.config.mts` 작성
  - 각 패널별 multi-entry (connectionForm, queryEditor, dataViewer, sessionMonitor, erd)
  - `@tailwindcss/vite` 플러그인 포함
  - output: `out/webview/`
- [x] `webview/svelte.config.mjs` 작성
- [x] `webview/tailwind.css` 작성

### 1-4. TypeScript 설정
- [x] `tsconfig.json` (Extension Host용)
  - target: `ES2022`, module: `Node16`, strict
- [x] `tsconfig.webview.json` (Webview용)

### 1-5. VSCode 개발 환경
- [x] `.vscode/launch.json` — Extension Host 디버그 실행
- [x] `.vscode/tasks.json` — esbuild watch + vite watch 병렬 실행

### 1-6. 폴더 구조 생성
```
src/
├── extension.ts
├── connection/
│   ├── types.ts
│   ├── connectionManager.ts
│   └── secretStore.ts
├── drivers/
│   ├── base.ts
│   ├── postgres.ts           ← connection-utils.ts + query.ts 발췌
│   └── mysql.ts
├── tunnel/
│   └── sshTunnel.ts          ← ssh-tunnel.ts 이식
├── providers/
│   ├── connectionsProvider.ts
│   └── schemaProvider.ts
└── panels/
    ├── PanelBase.ts          ← 공통 WebviewPanel 래퍼
    ├── connectionFormPanel.ts
    ├── queryEditorPanel.ts
    ├── dataViewerPanel.ts
    ├── sessionMonitorPanel.ts
    └── erdPanel.ts

webview/
├── shared/
│   └── api.ts                ← window.api postMessage 래퍼 (preload 대체)
├── connectionForm/
│   ├── main.ts
│   └── App.svelte
├── queryEditor/
│   ├── main.ts
│   └── App.svelte
├── dataViewer/
│   ├── main.ts
│   └── App.svelte
├── sessionMonitor/
│   ├── main.ts
│   └── App.svelte
└── erd/
    ├── main.ts
    └── App.svelte
```
- [x] 위 구조 전체 생성 완료

### 1-7. `.vscodeignore` 작성
- [x] `node_modules`, `webview/`, `src/`, `*.map` 등 제외

### 1-8. `package.json` contributes 기본 골격
- [x] `viewsContainers` — activitybar에 DataPilot 아이콘
- [x] `views` — `datapilot.connections`, `datapilot.schema`
- [x] `commands` 기본 등록

---

## 완료 기준
- [x] `npm run build:ext` — Extension Host 빌드 성공
- [x] `npm run build:webview` — Webview 번들 빌드 성공
- [x] F5 → Extension Development Host 실행 시 에러 없음
- [x] 사이드바에 DataPilot 아이콘 표시

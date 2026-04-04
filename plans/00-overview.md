# DataPilot 마이그레이션 계획 개요

## 원본 프로젝트
`/Users/ahnch/hwan_projects/db-player` — Electron + Svelte 5 + Tailwind v4 + CodeMirror 6

## 마이그레이션 전략

### 그대로 가져오는 부분 (코어 로직)
- `src/main/db/*.ts` — DB 드라이버, 쿼리 실행, DDL 빌더, 모니터링 등
- `src/renderer/src/components/*.svelte` — Webview 안에서 그대로 실행
- Tailwind v4 + shadcn-svelte — Webview 번들에 포함

### 재구현 필요한 부분
- Electron IPC (`ipcMain/ipcRenderer`) → VSCode `postMessage` 기반 메시지 라우터
- `window.api.*` 호출 → `vscode.postMessage` + message 이벤트
- 비밀번호 저장: Electron `safeStorage` → VSCode `SecretStorage`
- 연결 저장: SQLite `app.db` → VSCode `globalState`
- 쿼리 히스토리: SQLite → VSCode `globalState`
- 탭 관리: Svelte store → 각 `WebviewPanel` 인스턴스

### 제거 대상
- Electron main process 레이어
- Preload context bridge (`src/preload/`)
- electron-builder, electron-updater, electron-log

### 기능 제거 / 대체 항목

| 기능 | 원본 파일 | 결정 | 사유 |
|------|-----------|------|------|
| 앱 자체 업데이트 UI | `Header.svelte`, `ipc/app.ts` | **제거** | VSCode Marketplace가 자동 처리 |
| 테마 수동 토글 버튼 | `ThemeToggle.svelte`, `stores/theme.ts` | **대체** | VSCode 현재 테마 자동 감지로 변경. `data-vscode-theme-kind` 속성으로 Webview에서 dark/light 자동 적용 |
| Cmd+K 커스텀 팔레트 (전역) | `CommandPalette.svelte` | **대체** | Webview 내부 이벤트로만 동작. 전역 단축키는 VSCode Command Palette(`Cmd+Shift+P`)로 대체 |
| Cmd+T / Cmd+W 전역 단축키 | `src/main/index.ts` 메뉴 | **대체** | VSCode 기본 단축키와 충돌. 새 쿼리 에디터 열기는 사이드바 버튼 + Command로 대체 |

---

## 개발 단계

| Phase | 이름 | 상태 |
|-------|------|------|
| 1 | 프로젝트 기반 설정 | ⏳ |
| 2 | 연결 관리 | ⏳ |
| 3 | 스키마 탐색 (사이드바 TreeView) | ⏳ |
| 4 | 쿼리 에디터 | ⏳ |
| 5 | 데이터 뷰어 | ⏳ |
| 6 | 스키마 / 테이블 / 뷰 / 인덱스 관리 | ⏳ |
| 7 | 세션 모니터 | ⏳ |
| 8 | ER 다이어그램 | ⏳ |

## 관련 문서

- [01-architecture.md](./01-architecture.md) — 기술 아키텍처
- [02-phase1-foundation.md](./02-phase1-foundation.md) — Phase 1: 기반 설정
- [03-phase2-connection.md](./03-phase2-connection.md) — Phase 2: 연결 관리
- [04-phase3-schema-explorer.md](./04-phase3-schema-explorer.md) — Phase 3: 스키마 탐색
- [05-phase4-query-editor.md](./05-phase4-query-editor.md) — Phase 4: 쿼리 에디터
- [06-phase5-data-viewer.md](./06-phase5-data-viewer.md) — Phase 5: 데이터 뷰어
- [07-phase6-schema-mgmt.md](./07-phase6-schema-mgmt.md) — Phase 6: 스키마/테이블/뷰/인덱스 관리
- [08-phase7-session-monitor.md](./08-phase7-session-monitor.md) — Phase 7: 세션 모니터
- [09-phase8-erd.md](./09-phase8-erd.md) — Phase 8: ER 다이어그램

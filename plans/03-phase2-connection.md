# Phase 2: 연결 관리

## 원본 파일
- `src/main/db/connection-repository.ts` — 연결 CRUD (SQLite 기반)
- `src/main/db/connection-utils.ts` — 드라이버 설정 빌더
- `src/main/db/test-connection.ts` — 연결 테스트
- `src/main/db/ssh-tunnel.ts` — SSH 터널
- `src/main/ipc/connection.ts` — IPC 핸들러
- `src/renderer/src/components/connection/ConnectionDialog.svelte` — 연결 폼 UI

---

## 체크리스트

### 2-1. 타입 정의 (`src/connection/types.ts`)
- [x] `ConnectionConfig` 타입 정의 (db-player `connection-repository.ts` 기반)
  - `id, name, type (postgresql | mysql | mariadb)`
  - `host, port, database, username`
  - `inputMode: 'hostPort' | 'url'`
  - `sshEnabled, sshHost, sshPort, sshUsername, sshAuthType, sshKeyPath`
  - `color` (사이드바 구분용)
- [x] `QueryResult`, `TableInfo`, `ColumnInfo`, `SchemaObject` 등 공통 타입

### 2-2. SecretStore (`src/connection/secretStore.ts`)
- [x] `savePassword(id, password)` — `context.secrets.store()`
- [x] `getPassword(id)` — `context.secrets.get()`
- [x] `deletePassword(id)` — `context.secrets.delete()`
- [x] SSH 비밀번호도 동일 패턴으로 처리

### 2-3. ConnectionManager (`src/connection/connectionManager.ts`)
- [x] 연결 목록 `globalState` 저장/조회 (connection-repository.ts SQLite → globalState 변환)
- [x] `add(config)`, `update(config)`, `remove(id)` CRUD
- [x] `connect(id)` — SSH 터널 선처리 후 드라이버 반환, 활성 연결 캐시
- [x] `disconnect(id)` — 드라이버 해제 + 터널 정리
- [x] `getActiveDriver(id)` — 캐시된 드라이버 반환

### 2-4. SSH 터널 (`src/tunnel/sshTunnel.ts`)
- [x] db-player `ssh-tunnel.ts` 이식 (Electron 의존성 제거만)
- [x] password / privateKey 인증 분기
- [x] 로컬 포트 동적 할당
- [x] 터널 종료 메서드

### 2-5. DB 드라이버

#### `src/drivers/base.ts`
- [x] `IDriver` 인터페이스 정의
  - `testConnection()`, `disconnect()`
  - `getSchemas()`, `getSchemaObjects()`, `getTableNames()`, `getColumnNames()`
  - `executeQuery()`, `executeQueryBatch()`
  - `explainQuery()`, `cancelQuery()`
  - `selectAll()`, `executeDataChanges()`
  - `getObjectDDL()`
  - `getSessions()`, `killSession()`, `getLocks()`, `getTableStats()`
  - `getCompletionSchema()`

#### `src/drivers/postgres.ts`
- [x] db-player `connection-utils.ts` `buildPgConfig()` 이식
- [x] `query.ts`, `data-viewer.ts`, `explain.ts`, `table.ts`, `schema.ts`, `monitor.ts`의 PostgreSQL 관련 로직 이식

#### `src/drivers/mysql.ts`
- [x] db-player `connection-utils.ts` `buildMysqlConfig()` 이식
- [x] 동일 파일들의 MySQL/MariaDB 관련 로직 이식

### 2-6. 연결 폼 WebviewPanel (`src/panels/connectionFormPanel.ts`)
- [x] `PanelBase` 공통 래퍼 구현
- [x] 신규 추가 / 수정 모드 구분
- [x] 메시지 핸들러
  - `conn:save` → ConnectionManager에 저장
  - `db:test-connection` → 드라이버 연결 테스트 (SSH 터널 포함)
  - `conn:get` → 기존 연결 정보 반환 (비밀번호 포함)

### 2-7. Webview 연결 폼 (`webview/connectionForm/`)
- [x] db-player `ConnectionDialog.svelte` 이식
- [x] `window.api` → postMessage 래퍼(`webview/shared/api.ts`)로 교체
- [x] IPC 채널명 유지 (`conn:save`, `db:test-connection` 등)
- [x] 연결 테스트 결과 인라인 표시

### 2-8. 연결 목록 TreeDataProvider (`src/providers/connectionsProvider.ts`)
- [x] `ConnectionTreeItem` — 연결별 아이콘 + 연결 상태 색상 (연결됨: 초록, 끊김: 기본)
- [x] 컨텍스트 메뉴 연결
  - 수정, 삭제, 연결 끊기, 쿼리 에디터 열기, 데이터 뷰어 열기, ER 다이어그램 열기

### 2-9. Commands 등록 (`package.json`)
- [x] `datapilot.addConnection`
- [x] `datapilot.editConnection`
- [x] `datapilot.deleteConnection`
- [x] `datapilot.disconnectConnection`
- [x] `datapilot.refreshConnections`

---

## 완료 기준
- [x] 연결 추가 폼에서 PostgreSQL / MySQL / MariaDB 연결 저장
- [x] host/port 모드 ↔ URL 모드 전환
- [ ] SSH 터널 경유 연결 성공
- [x] 연결 테스트 버튼 동작
- [x] 사이드바 트리에 연결 목록 표시
- [x] 연결 수정 / 삭제 동작
- [x] 비밀번호 SecretStorage 저장/조회

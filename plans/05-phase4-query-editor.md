# Phase 4: 쿼리 에디터

## 원본 파일
- `src/main/db/query.ts` — 쿼리 실행, 취소, 히스토리
- `src/main/db/explain.ts` — EXPLAIN 파싱
- `src/main/db/app-db.ts` — 쿼리 히스토리 SQLite 저장
- `src/main/ipc/query.ts` — IPC 핸들러
- `src/renderer/src/components/query/QueryWorkspace.svelte` — 탭 호스팅
- `src/renderer/src/components/query/QueryEditor.svelte` — CodeMirror 6 에디터
- `src/renderer/src/components/query/QueryResultViewer.svelte` — 결과 탭
- `src/renderer/src/components/explain/ExplainViewer.svelte` — EXPLAIN 트리
- `src/renderer/src/components/explain/ExplainTreeNode.svelte` — 트리 노드

---

## 체크리스트

### 4-1. Extension Host — QueryEditorPanel (`src/panels/queryEditorPanel.ts`)
- [ ] 연결 ID + 선택 연결 정보를 받아 패널 생성
- [ ] 탭 제목: `Query — [연결명]`
- [ ] 메시지 핸들러 (기존 IPC 채널명 유지)
  - [ ] `db:execute-query` → 드라이버 `executeQuery()` 호출
  - [ ] `db:execute-query-batch` → 드라이버 `executeQueryBatch()` 호출
  - [ ] `query:cancel` → 드라이버 `cancelQuery()` 호출
  - [ ] `query:explain` → 드라이버 `explainQuery()` 호출
  - [ ] `history:add` → `globalState`에 저장 (app-db.ts SQLite 로직 대체)
  - [ ] `history:list` → `globalState`에서 조회
  - [ ] `db:completion-schema` → 드라이버 `getCompletionSchema()` 호출

### 4-2. Extension Host — 쿼리 로직 이식
- [ ] `src/main/db/query.ts` → `src/drivers/postgres.ts`, `src/drivers/mysql.ts` 로 분리 이식
  - [ ] `executeQuery()` (단일)
  - [ ] `executeQueryBatch()` (다중, stopOnError, useTransaction)
  - [ ] `cancelQuery()` (pg_cancel_backend / KILL QUERY)
  - [ ] `getCompletionSchema()` (테이블·컬럼 자동완성 데이터)
- [ ] `src/main/db/explain.ts` → `src/drivers/` 이식
  - [ ] PostgreSQL EXPLAIN JSON 파싱
  - [ ] MySQL EXPLAIN JSON 파싱
  - [ ] MariaDB 전용 파서

### 4-3. Extension Host — 히스토리 저장
- [ ] `globalState` 기반 히스토리 저장 (연결 ID별, 최근 100건)
- [ ] db-player `app-db.ts` SQLite 히스토리 로직 → globalState로 변환

### 4-4. Webview — 쿼리 에디터 (`webview/queryEditor/`)
- [ ] `QueryWorkspace.svelte` 이식 (탭 관리)
- [ ] `QueryEditor.svelte` 이식
  - [ ] `window.api.*` → `postMessage` 래퍼로 교체
  - [ ] CodeMirror 6 + `@codemirror/lang-sql` 유지
  - [ ] DB 방언별 dialect (PostgreSQL / MySQL) 유지
  - [ ] `getCompletionSchema` 호출로 스키마 기반 자동완성 유지
  - [ ] SQL 포맷 (`sql-formatter`) 유지
  - [ ] 에러 위치 linter 표시 유지
  - [ ] 선택 영역 실행 유지
  - [ ] Cmd/Ctrl+Enter 실행, Cmd/Ctrl+Shift+F 포맷 단축키 유지
- [ ] `QueryResultViewer.svelte` 이식 (결과 탭 — 테이블/JSON/text)
- [ ] `ResultViewer.svelte` 이식

### 4-5. Webview — EXPLAIN 뷰어
- [ ] `ExplainViewer.svelte` 이식
- [ ] `ExplainTreeNode.svelte` 이식
- [ ] SELECT 쿼리 한정 활성화 조건 유지

### 4-6. Webview — 히스토리 패널
- [ ] 히스토리 목록 조회 UI
- [ ] 클릭 시 에디터에 로드

---

## 완료 기준
- [ ] SQL 구문 하이라이팅 + 스키마 기반 자동완성
- [ ] 단일 쿼리 실행 및 결과 탭 표시
- [ ] 다중 쿼리 실행 (stopOnError, 트랜잭션 모드)
- [ ] 쿼리 취소
- [ ] EXPLAIN 노드 트리 렌더링
- [ ] 히스토리 저장 및 로드
- [ ] SQL 포맷, 에러 위치 표시

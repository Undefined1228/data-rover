# VSC 마이그레이션 기능 목록

현재 Electron 앱에 구현된 기능 전체를 VSCode 익스텐션으로 이전하기 위해 정리한 인벤토리.

---

## 1. 연결 관리

| 기능 | 지원 DB | 비고 |
|------|---------|------|
| 연결 생성 / 수정 / 삭제 | PostgreSQL, MySQL, MariaDB | SQLite는 UI에서 숨김 |
| 입력 모드 | - | host/port 모드 & URL 모드 선택 |
| 연결 테스트 | 전체 | 저장 전 연결 가능 여부 확인 |
| SSH 터널 | 전체 | password / private key 인증 |
| 연결 목록 조회 | 전체 | 사이드바에 연결별 트리로 표시 |

저장 위치: Electron `better-sqlite3` 기반 로컬 앱 DB (`app.db`).

---

## 2. 스키마 탐색 (사이드바)

- 스키마 목록 조회 (PostgreSQL: pg_namespace, MySQL/MariaDB: SHOW DATABASES)
- 스키마 내 오브젝트 목록: 테이블 / 뷰 / 함수·프로시저 / Materialized View (PostgreSQL 전용)
- 테이블 확장 시 3개 그룹 표시
  - **Columns** — 컬럼 이름 + 타입, PK/nullable 뱃지
  - **Foreign Keys** — 제약명 + `로컬컬럼 → 참조테이블(참조컬럼)`
  - **Indexes** — 인덱스명, UNIQUE 뱃지, 컬럼 목록
- 컨텍스트 메뉴 (우클릭) — 각 오브젝트 유형별 액션

---

## 3. 스키마 관리 (PostgreSQL 전용)

| 액션 | 설명 |
|------|------|
| 스키마 생성 | 이름, owner 지정 |
| 스키마 수정 | 이름 변경, owner 변경 |
| 스키마 삭제 | CASCADE 옵션 |

---

## 4. 테이블 관리

| 액션 | 지원 DB | 설명 |
|------|---------|------|
| 테이블 생성 | 전체 | 컬럼 정의 (이름/타입/PK/NOT NULL/DEFAULT), MySQL: AUTO_INCREMENT/charset/collation |
| 테이블 수정 | 전체 | 컬럼 추가·수정·삭제, 테이블명 변경 |
| DDL 보기 | 전체 | 테이블·뷰·Materialized View·함수의 DDL 조회 (포맷팅 포함) |
| DDL 복사 | 전체 | 클립보드로 복사, 다중 오브젝트 일괄 복사 |
| 테이블 삭제 | 전체 | 컨텍스트 메뉴에서 DROP TABLE |

---

## 5. 뷰 관리 (PostgreSQL)

| 액션 | 설명 |
|------|------|
| 뷰 생성 | 이름 + SELECT 쿼리 → `CREATE OR REPLACE VIEW` |
| 뷰 수정 | 이름 변경 + 쿼리 변경 (트랜잭션 처리) |
| 뷰 삭제 | 확인 다이얼로그 + CASCADE 옵션 |

---

## 6. 인덱스 관리 (PostgreSQL)

| 액션 | 설명 |
|------|------|
| 인덱스 생성 | 이름, UNIQUE 여부, 방식 (B-tree / Hash / GIN / GiST / BRIN), 컬럼 + ASC/DESC |
| 인덱스 삭제 | DROP INDEX |

---

## 7. 쿼리 에디터

**에디터 (CodeMirror 6)**

- SQL 구문 하이라이팅 — DB 방언별 (PostgreSQL / MySQL / SQLite)
- SQL 자동완성 — 스키마·테이블·컬럼 기반, DB별 키워드
- SQL 포맷팅 (`sql-formatter` 라이브러리)
- Undo/Redo, Tab 들여쓰기
- 라이트/다크 테마 실시간 전환 (one-dark)

**실행**

- 단일 쿼리 / 다중 쿼리 실행 (`;` 기준 분리)
- stopOnError 옵션 (오류 발생 시 이후 쿼리 중단)
- 트랜잭션 모드 (성공 시 COMMIT, 실패 시 ROLLBACK)
- 쿼리 취소 (`pg_cancel_backend`)
- 실행 결과 — 다중 탭 (쿼리별 결과 탭)

**EXPLAIN 뷰어**

- SELECT 단일 쿼리 한정 활성화
- `EXPLAIN (ANALYZE, FORMAT JSON)` 실행
- 트리 형태 노드 시각화 (노드 타입, cost, actualTime, rows)
- PostgreSQL 표준 파서 + MariaDB 전용 파서

**히스토리**

- 쿼리 실행 시 자동 저장 (로컬 DB)
- 히스토리 목록 조회 + 선택 시 에디터에 로드

---

## 8. 데이터 뷰어

**조회**

- 대상: 테이블 / 뷰 / Materialized View
- 페이지네이션 (100 / 200 / 500 / 1000 / 전체)
- 총 행 수 표시
- 컬럼 헤더 클릭 정렬 (멀티 컬럼 정렬 지원)
- 검색 필터 (fulltext, 디바운스)

**표 조작**

- 컬럼 너비 드래그 리사이징
- 컬럼 고정 (freeze) — 컨텍스트 메뉴에서 토글
- JSON/JSONB 셀 — 클릭 시 포맷팅된 모달 뷰어

**편집 (테이블만 가능, 뷰/Materialized View는 읽기 전용)**

- 인라인 셀 편집
- 행 추가 (빈 행 삽입)
- 행 삭제 (선택 후 삭제)
- 변경사항 일괄 저장 (INSERT / UPDATE / DELETE를 하나의 트랜잭션으로 처리)
- 변경 전 원본 기준 PK로 행 식별

---

## 9. 세션 모니터

지원: PostgreSQL, MySQL, MariaDB

**활성 세션 탭**

- 세션 목록: ID, user, DB, 상태(뱃지), wait event, 실행 시간, 쿼리 미리보기
- 세션 강제 종료: 쿼리 취소 (active 상태만) / 연결 종료 (확인 다이얼로그 필수)

**잠금 현황 탭**

- Lock Wait 쌍: 대기 세션 ↔ 차단 세션
- 잠금 유형, 대상 테이블, 각 세션의 실행 쿼리

**테이블 통계 탭**

- 전체 크기 / 테이블 크기 / 인덱스 크기 / 추정 행 수
- PostgreSQL 전용: Dead Tuples 수, 마지막 VACUUM / Auto-VACUUM 시각

**공통**

- 자동 새로고침 (5 / 10 / 30 / 60초 주기)
- 탭 전환 시 해당 섹션 자동 fetch

---

## 10. ER 다이어그램

- 스키마 내 테이블 관계 시각화
- dagre 자동 레이아웃
- 테이블 카드에 컬럼 목록 (이름/타입) 표시
- FK 관계 엣지 렌더링
- 줌인 / 줌아웃 / 핏투스크린

---

## 11. 앱 레이아웃 / UX

| 기능 | 설명 |
|------|------|
| 탭 기반 워크스페이스 | 쿼리 / 데이터뷰어 / ERD / 세션모니터 탭 |
| 커맨드 팔레트 | `Cmd/Ctrl+P` 퍼지 검색으로 액션 실행 |
| 다크/라이트 테마 토글 | 시스템 설정 감지 + 수동 전환 |
| 앱 업데이트 | 업데이트 확인 / 다운로드 / 설치 |
| 키보드 단축키 | 새 탭(`Cmd+T`), 탭 닫기(`Cmd+W`), 쿼리 실행(`Cmd+Enter`), 포맷(`Shift+Alt+F`) |

---

## DB별 기능 지원 매트릭스

| 기능 | PostgreSQL | MySQL | MariaDB | SQLite |
|------|-----------|-------|---------|--------|
| 스키마 탐색 | ✅ | ✅ | ✅ | - |
| 스키마 CRUD | ✅ | - | - | - |
| 테이블 생성/수정 | ✅ | ✅ | ✅ | - |
| 뷰 CRUD | ✅ | - | - | - |
| Materialized View | ✅ | - | - | - |
| 인덱스 생성/삭제 | ✅ | - | - | - |
| DDL 보기 | ✅ | ✅ | ✅ | - |
| 쿼리 에디터 | ✅ | ✅ | ✅ | - |
| EXPLAIN 뷰어 | ✅ | ✅ | ✅(전용 파서) | - |
| 데이터 뷰어 | ✅ | ✅ | ✅ | - |
| 세션 모니터 | ✅ | ✅ | ✅ | - |
| ER 다이어그램 | ✅ | ✅ | ✅ | - |
| SSH 터널 | ✅ | ✅ | ✅ | - |

---

## VSC 마이그레이션 시 주요 고려사항

### 런타임 차이
- Electron IPC (`ipcMain` / `ipcRenderer`) → VSCode extension API (`vscode.commands`, `WebviewPanel`, `ExtensionContext`)
- Electron 메뉴 이벤트 → VSCode Command Palette / TreeView context menu
- `better-sqlite3` 로컬 앱 DB → `globalState` / `workspaceState` or SQLite via extension storage

### UI 전략
- Svelte 컴포넌트는 그대로 **WebviewPanel** 안에서 실행 가능
- `window.api.*` 호출은 `vscode.postMessage` ↔ extension host message passing으로 교체
- 사이드바 스키마 트리 → `vscode.TreeDataProvider` 네이티브 구현 또는 Webview 유지

### 데이터 저장
- 연결 정보 (host, port, user) → `vscode.ExtensionContext.globalState` 또는 `SecretStorage` (password)
- 쿼리 히스토리 → `globalState` 또는 extension storage 파일

### 패키징
- Node.js 네이티브 모듈 (`better-sqlite3`, `ssh2`, `pg`, `mysql2`) — VSCode extension에서 사용 가능하나 번들러 설정 필요
- `electron-builder` 제거, `vsce` 패키징으로 전환

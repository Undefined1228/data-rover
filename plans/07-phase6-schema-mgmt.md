# Phase 6: 스키마 / 테이블 / 뷰 / 인덱스 관리

## 원본 파일
- `src/main/db/schema.ts` — PostgreSQL 스키마 CRUD
- `src/main/db/table.ts` — 테이블 생성/수정, DDL 조회
- `src/main/db/ddl-builder.ts` — DDL 생성기 (PostgreSQL/MySQL)
- `src/main/db/view.ts` — 뷰 CRUD
- `src/main/db/db-index.ts` — 인덱스 CRUD
- `src/main/ipc/schema.ts`, `ipc/table.ts` — IPC 핸들러
- `src/renderer/src/components/schema/CreateSchemaDialog.svelte`
- `src/renderer/src/components/schema/EditSchemaDialog.svelte`
- `src/renderer/src/components/schema/DropSchemaDialog.svelte`
- `src/renderer/src/components/table/CreateTableDialog.svelte`
- `src/renderer/src/components/table/AlterTableDialog.svelte`
- `src/renderer/src/components/table/ColumnEditor.svelte`
- `src/renderer/src/components/table/CreateViewDialog.svelte`
- `src/renderer/src/components/table/CreateIndexDialog.svelte`
- `src/renderer/src/components/table/DDLDialog.svelte`

---

## 체크리스트

### 6-1. Extension Host — 로직 이식

#### 스키마 관리 (PostgreSQL)
- [ ] `schema.ts` → `src/drivers/postgres.ts` 이식
  - [ ] `getSchemas()`
  - [ ] `getRoles()`
  - [ ] `createSchema(name, owner?)`
  - [ ] `getSchemaOwner(schema)`
  - [ ] `alterSchema(schema, newName?, newOwner?)`
  - [ ] `dropSchema(schema, cascade)`

#### 테이블 관리
- [ ] `table.ts` → 드라이버 이식
  - [ ] `createTable()` (DDL 빌더 연동)
  - [ ] `alterTable()` (DDL 빌더 연동)
- [ ] `ddl-builder.ts` → `src/drivers/ddlBuilder.ts` 이식
  - [ ] PostgreSQL CREATE/ALTER TABLE DDL 생성
  - [ ] MySQL CREATE/ALTER TABLE DDL 생성
  - [ ] 컬럼 타입 분류 (numeric/string/datetime/boolean)

#### 뷰 관리 (PostgreSQL/MySQL)
- [ ] `view.ts` → 드라이버 이식
  - [ ] `createView(schema, name, query)`
  - [ ] `alterView(schema, name, newName?, newQuery?)` — 트랜잭션 처리
  - [ ] `dropView(schema, name, cascade)`

#### 인덱스 관리 (PostgreSQL)
- [ ] `db-index.ts` → `src/drivers/postgres.ts` 이식
  - [ ] `createIndex(schema, table, options)`
  - [ ] `dropIndex(schema, indexName)`

### 6-2. Extension Host — Panel 메시지 핸들러

각 관리 기능은 ConnectionFormPanel 또는 별도 SchemaManagementPanel에서 처리:
- [ ] `schema:create`, `schema:alter`, `schema:drop` 핸들러
- [ ] `table:create`, `table:alter` 핸들러 + `ddl-builder.ts` 연동
- [ ] `view:create`, `view:alter`, `view:drop` 핸들러
- [ ] `index:create`, `index:drop` 핸들러
- [ ] `db:object-ddl` 핸들러 (DDL 조회)
- [ ] `db:roles` 핸들러 (스키마 소유자 드롭다운용)

### 6-3. Webview — 스키마 관리 다이얼로그

각 다이얼로그는 Phase 3 사이드바 컨텍스트 메뉴에서 호출됨.  
구현 방식: 해당 WebviewPanel(쿼리 에디터 등) 내부에서 오버레이 다이얼로그로 표시하거나, 별도 소형 WebviewPanel 사용.

- [ ] `CreateSchemaDialog.svelte` 이식 (이름 + owner 선택)
- [ ] `EditSchemaDialog.svelte` 이식 (이름 변경 + owner 변경)
- [ ] `DropSchemaDialog.svelte` 이식 (CASCADE 옵션)

### 6-4. Webview — 테이블 관리 다이얼로그
- [ ] `CreateTableDialog.svelte` 이식
  - [ ] `ColumnEditor.svelte` 이식 (컬럼 추가/수정/삭제)
  - [ ] MySQL AUTO_INCREMENT, charset, collation 옵션
  - [ ] DDL 미리보기 (실시간)
- [ ] `AlterTableDialog.svelte` 이식
  - [ ] 기존 컬럼 로드 후 편집
  - [ ] 테이블명 변경

### 6-5. Webview — 뷰 / 인덱스 다이얼로그
- [ ] `CreateViewDialog.svelte` 이식 (이름 + SELECT 쿼리 에디터)
- [ ] `CreateIndexDialog.svelte` 이식 (UNIQUE, 방식, 컬럼 + ASC/DESC)

### 6-6. Webview — DDL 다이얼로그
- [ ] `DDLDialog.svelte` 이식 (DDL 표시 + 복사)
- [ ] 다중 오브젝트 일괄 복사 (체크박스 선택 + FK 의존성 정렬)

---

## 완료 기준
- [ ] PostgreSQL 스키마 CRUD
- [ ] 테이블 생성/수정/삭제 (PostgreSQL + MySQL)
- [ ] DDL 미리보기 실시간 동작
- [ ] 뷰 CRUD (PostgreSQL/MySQL)
- [ ] 인덱스 생성/삭제 (PostgreSQL)
- [ ] DDL 보기/복사 (단일 + 다중)

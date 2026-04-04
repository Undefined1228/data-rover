# Phase 3: 스키마 탐색 (사이드바)

## 원본 파일
- `src/main/db/table.ts` — 테이블/뷰/함수/컬럼/FK/인덱스 조회
- `src/main/ipc/table.ts`, `ipc/schema.ts` — IPC 핸들러
- `src/renderer/src/components/schema/SchemaTree.svelte` — 트리 UI
- `src/renderer/src/components/schema/SchemaObjectContextMenu.svelte` — 컨텍스트 메뉴

---

## 체크리스트

### 3-1. 드라이버 메서드 확인 및 이식
- [ ] `getSchemas()` — PostgreSQL: `pg_namespace`, MySQL: `SHOW DATABASES` (table.ts 발췌)
- [ ] `getSchemaObjects(schema)` — 테이블/뷰/함수/Materialized View 목록 (table.ts `getSchemaObjects` 이식)
- [ ] `getTableNames(connectionId, schema)` — 테이블명 목록
- [ ] `getColumnNames(connectionId, schema, table)` — 자동완성용
- [ ] `getObjectDDL(connectionId, schema, objectName, type)` — DDL 조회 (table.ts 이식)
- [ ] FK 조회, 인덱스 조회 로직 확인 (table.ts 내 포함 여부 확인)

### 3-2. TreeItem 클래스 (`src/providers/schemaProvider.ts`)
- [ ] `ConnectionTreeItem` (연결 노드)
- [ ] `SchemaTreeItem` (스키마/데이터베이스 노드)
- [ ] `CategoryTreeItem` (Tables / Views / Functions / Materialized Views)
- [ ] `TableTreeItem`, `ViewTreeItem`, `FunctionTreeItem`, `MatViewTreeItem`
- [ ] `ColumnGroupItem`, `FKGroupItem`, `IndexGroupItem`
- [ ] `ColumnItem` (이름 + 타입, PK/nullable 뱃지)
- [ ] `FKItem` (제약명 + `로컬컬럼 → 참조테이블(참조컬럼)`)
- [ ] `IndexItem` (인덱스명, UNIQUE 뱃지, 컬럼 목록)

### 3-3. SchemaProvider 구현
- [ ] lazy loading — 노드 펼칠 때만 자식 fetch
- [ ] 로딩 중 `$(loading~spin)` 아이콘
- [ ] fetch 에러 시 인라인 에러 노드
- [ ] `refresh(connectionId?)` — 전체 또는 특정 연결만 갱신

### 3-4. 컨텍스트 메뉴 (`package.json` menus)
- [ ] 연결 노드: 새로고침, 연결 끊기, 수정, 삭제
- [ ] 스키마 노드: 스키마 생성(PG), 스키마 수정(PG), 스키마 삭제(PG)
- [ ] 테이블 노드: 데이터 뷰어 열기, DDL 보기, DDL 복사, 테이블 수정, 테이블 삭제
- [ ] 뷰 노드: DDL 보기, DDL 복사, 뷰 수정, 뷰 삭제
- [ ] Materialized View 노드: DDL 보기
- [ ] 함수 노드: DDL 보기

### 3-5. DDL 보기 / 복사
- [ ] DDL 조회 후 읽기 전용 에디터 탭에 표시 (`.sql` 가상 파일)
- [ ] `sql-formatter`로 포맷팅 후 표시
- [ ] DDL 복사 — 클립보드에 복사 (`vscode.env.clipboard.writeText`)
- [ ] 다중 오브젝트 일괄 복사는 Phase 6에서 처리

---

## 완료 기준
- [ ] 연결 클릭 시 스키마 트리 펼쳐짐
- [ ] 테이블 → Columns / Foreign Keys / Indexes 그룹 표시
- [ ] 컬럼 PK 뱃지, FK 참조 표시
- [ ] DDL 보기 → 에디터 탭 열림
- [ ] DDL 복사 동작
- [ ] 컨텍스트 메뉴 액션 연결 완료

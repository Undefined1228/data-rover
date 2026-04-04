# Phase 5: 데이터 뷰어

## 원본 파일
- `src/main/db/data-viewer.ts` — selectAll (페이징/정렬/검색), executeDataChanges
- `src/main/ipc/data.ts` — IPC 핸들러
- `src/renderer/src/components/data-viewer/DataViewerTab.svelte` — 메인 탭
- `src/renderer/src/components/data-viewer/DataViewerTable.svelte` — 그리드 + 인라인 편집
- `src/renderer/src/components/data-viewer/DataViewerToolbar.svelte` — 페이징/검색/정렬
- `src/renderer/src/components/data-viewer/DataViewerColContextMenu.svelte` — 컬럼 우클릭
- `src/renderer/src/components/common/JsonViewerModal.svelte` — JSON 모달

---

## 체크리스트

### 5-1. Extension Host — DataViewerPanel (`src/panels/dataViewerPanel.ts`)
- [ ] 연결 ID + 스키마 + 테이블명 + 타입(table/view/matview)을 받아 패널 생성
- [ ] 탭 제목: `[테이블명] — [연결명]`
- [ ] 메시지 핸들러 (기존 IPC 채널명 유지)
  - [ ] `db:select-all` → 드라이버 `selectAll()` 호출 (data-viewer.ts 이식)
  - [ ] `db:data-changes` → 드라이버 `executeDataChanges()` 호출 (data-viewer.ts 이식)

### 5-2. Extension Host — 데이터 뷰어 로직 이식
- [ ] `src/main/db/data-viewer.ts` → `src/drivers/postgres.ts`, `src/drivers/mysql.ts` 분리 이식
  - [ ] `selectAll()` — `SELECT *` + COUNT + 페이징 + 정렬 + 검색 (LIKE)
  - [ ] `executeDataChanges()` — INSERT / UPDATE / DELETE 트랜잭션 처리
  - [ ] PK 기반 행 식별 로직

### 5-3. Webview — 데이터 뷰어 (`webview/dataViewer/`)
- [ ] `DataViewerTab.svelte` 이식
  - [ ] `window.api.*` → `postMessage` 래퍼로 교체
- [ ] `DataViewerTable.svelte` 이식
  - [ ] 인라인 셀 편집 (더블클릭)
  - [ ] 행 추가 (하단 빈 행)
  - [ ] 행 삭제 (체크박스 선택)
  - [ ] 변경 추적 (로컬 상태)
  - [ ] 컬럼 너비 드래그 리사이징
  - [ ] 컬럼 고정 (freeze) — 컨텍스트 메뉴 토글
- [ ] `DataViewerToolbar.svelte` 이식
  - [ ] 페이지네이션 (100/200/500/1000/전체)
  - [ ] 총 행 수 표시
  - [ ] 컬럼 헤더 클릭 정렬 (멀티 컬럼: Shift+클릭)
  - [ ] 검색 필터 (디바운스 300ms)
- [ ] `DataViewerColContextMenu.svelte` 이식
- [ ] `JsonViewerModal.svelte` 이식 (JSON/JSONB 셀 클릭 시 모달)
- [ ] 뷰 / Materialized View는 편집 UI 비활성화

---

## 완료 기준
- [ ] 테이블 데이터 조회 및 페이지네이션
- [ ] 정렬 (단일 / 멀티 컬럼)
- [ ] 검색 필터
- [ ] 인라인 편집 후 일괄 저장 (INSERT/UPDATE/DELETE 트랜잭션)
- [ ] 행 추가 / 삭제
- [ ] JSON 셀 모달 뷰어
- [ ] 컬럼 리사이징 / 컬럼 고정
- [ ] 뷰/Materialized View 읽기 전용 동작

# Phase 8: ER 다이어그램

## 원본 파일
- `src/main/db/table.ts` — 테이블/컬럼/FK 조회
- `src/renderer/src/components/er-diagram/ErDiagramTab.svelte` — ER 다이어그램 UI

---

## 체크리스트

### 8-1. Extension Host — ErdPanel (`src/panels/erdPanel.ts`)
- [ ] 연결 ID + 스키마명을 받아 패널 생성
- [ ] 탭 제목: `ERD — [스키마명]`
- [ ] 메시지 핸들러
  - [ ] `erd:fetch` → 스키마 내 전체 테이블 + 컬럼 + FK 일괄 조회

### 8-2. Extension Host — ERD 데이터 수집
- [ ] 드라이버에 `getErdData(schema)` 메서드 추가 (table.ts 발췌)
  - [ ] 스키마 내 전체 테이블 + 컬럼 (이름, 타입, PK)
  - [ ] 전체 FK 관계 (`로컬 테이블.로컬 컬럼 → 참조 테이블.참조 컬럼`)

### 8-3. Webview — ER 다이어그램 (`webview/erd/`)
- [ ] `ErDiagramTab.svelte` 이식
  - [ ] `window.api.*` → `postMessage` 래퍼로 교체
  - [ ] `@dagrejs/dagre` 자동 레이아웃 유지
  - [ ] 테이블 카드 렌더링 (테이블명 헤더 + 컬럼 목록 + 타입 + PK 아이콘)
  - [ ] FK 엣지 연결 (SVG 선)
  - [ ] 줌인/줌아웃 (마우스 휠)
  - [ ] 핏투스크린 버튼
  - [ ] 테이블 카드 드래그 이동

---

## 완료 기준
- [ ] 스키마 내 테이블 카드 렌더링
- [ ] FK 엣지 연결 표시
- [ ] dagre 자동 레이아웃
- [ ] 줌 / 핏투스크린 / 카드 드래그

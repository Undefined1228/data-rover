# Changelog

## [1.2.0] - 2026-04-14

### 추가
- CSV 가져오기 — 스키마 탐색기에서 테이블을 우클릭해 CSV 파일을 직접 임포트. 헤더·구분자 자동 감지, 컬럼 매핑, 진행률 표시 지원

### 수정
- 쿼리 에디터 실행 단축키(`Cmd+Enter` / `Ctrl+Enter`) OS별 동작 불일치 수정 — `EditorView.domEventHandlers` 방식을 CodeMirror `Prec.highest(keymap.of([...]))` 방식으로 교체

## [1.1.1] - 2026-04-13

### 수정
- Marketplace 아이콘 추가 및 `.vscodeignore` 누락 항목 보완

## [1.1.0] - 2026-04-13

### 추가
- 쿼리 에디터 찾기/바꾸기 기능 (`@codemirror/search`)

## [1.0.1] - 2026-04-11

### 수정
- `pg`, `mysql2`, `ssh2`를 번들에 포함하도록 변경 — 배포 환경에서 DB 드라이버 누락으로 연결 생성 시 에러가 발생하던 문제 해결
  - `build.mjs` external 목록에서 제거하고 선택적 네이티브 바이너리(`pg-native`, `cpu-features`, `bufferutil`, `utf-8-validate`)만 external로 유지
  - `ssh2` 내부 네이티브 바이너리(`sshcrypto.node`) 처리를 위해 esbuild `loader: { '.node': 'copy' }` 추가

## [1.0.0] - 2026-04-10

### 추가
- PostgreSQL · MySQL · MariaDB 연결 관리 (SSH 터널 포함)
- 스키마 탐색 사이드바 (TreeView)
- 쿼리 에디터 (SQL 자동완성, EXPLAIN 뷰어, 히스토리)
- 데이터 뷰어 (인라인 편집, CSV/JSON 내보내기)
- 스키마 관리 (테이블·뷰·인덱스·스키마 CRUD)
- ER 다이어그램
- 세션 모니터

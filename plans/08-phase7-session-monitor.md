# Phase 7: 세션 모니터

## 원본 파일
- `src/main/db/monitor.ts` — 세션/잠금/테이블 통계 조회
- `src/main/ipc/monitor.ts` — IPC 핸들러
- `src/renderer/src/components/monitor/MonitorTab.svelte` — 모니터링 UI

---

## 체크리스트

### 7-1. Extension Host — SessionMonitorPanel (`src/panels/sessionMonitorPanel.ts`)
- [ ] 연결 ID를 받아 패널 생성
- [ ] 탭 제목: `Monitor — [연결명]`
- [ ] 자동 새로고침 타이머 (패널 숨김 시 정지, 표시 시 재시작)
- [ ] 메시지 핸들러 (기존 IPC 채널명 유지)
  - [ ] `monitor:sessions` → 드라이버 `getSessions()` 호출
  - [ ] `monitor:kill-session` → 드라이버 `killSession()` 호출
  - [ ] `monitor:locks` → 드라이버 `getLocks()` 호출
  - [ ] `monitor:table-stats` → 드라이버 `getTableStats()` 호출

### 7-2. Extension Host — 모니터링 로직 이식
- [ ] `src/main/db/monitor.ts` → `src/drivers/postgres.ts`, `src/drivers/mysql.ts` 분리 이식
  - [ ] `getSessions()` — 활성 세션 조회
    - PostgreSQL: `pg_stat_activity`
    - MySQL/MariaDB: `SHOW PROCESSLIST`
  - [ ] `killSession(pid, type)` — 쿼리 취소 / 연결 종료
    - PostgreSQL: `pg_cancel_backend` / `pg_terminate_backend`
    - MySQL: `KILL QUERY` / `KILL CONNECTION`
  - [ ] `getLocks()` — PostgreSQL 잠금 현황 (`pg_locks` JOIN)
  - [ ] `getTableStats()` — 테이블 크기/행수/VACUUM 정보
    - PostgreSQL: `pg_stat_user_tables` JOIN `pg_total_relation_size`
    - MySQL: `information_schema.TABLES`

### 7-3. Webview — 세션 모니터 (`webview/sessionMonitor/`)
- [ ] `MonitorTab.svelte` 이식
  - [ ] `window.api.*` → `postMessage` 래퍼로 교체
  - [ ] 활성 세션 탭 (ID, user, DB, 상태 뱃지, wait event, 실행 시간, 쿼리 미리보기)
  - [ ] 쿼리 취소 버튼 (active 상태만 활성화)
  - [ ] 연결 종료 버튼 (확인 다이얼로그)
  - [ ] 잠금 현황 탭 (대기 세션 ↔ 차단 세션, 잠금 유형, 대상 테이블)
  - [ ] 테이블 통계 탭 (전체/테이블/인덱스 크기, 추정 행 수)
  - [ ] PostgreSQL 전용: Dead Tuples 수, 마지막 VACUUM/Auto-VACUUM 시각
  - [ ] 자동 새로고침 주기 선택 (5/10/30/60초)
  - [ ] 탭 전환 시 해당 섹션 자동 fetch

---

## 완료 기준
- [ ] 활성 세션 목록 조회 (PostgreSQL / MySQL / MariaDB)
- [ ] 자동 새로고침 동작
- [ ] 쿼리 취소 / 연결 종료
- [ ] 잠금 현황 표시 (PostgreSQL)
- [ ] 테이블 통계 표시 (PostgreSQL Dead Tuples 포함)

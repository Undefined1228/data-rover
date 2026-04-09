# DataRover

VS Code에서 PostgreSQL · MySQL 데이터베이스를 탐색하고 관리하는 확장 프로그램.

---

## 기능

### 연결 관리
- PostgreSQL / MySQL(MariaDB) 연결 추가·편집·삭제
- SSH 터널 지원
- 비밀번호 SecretStorage 암호화 보관

### 스키마 탐색
- 사이드바 TreeView로 DB 구조 탐색
- 테이블 · 뷰 · 함수 · 시퀀스 목록

### 쿼리 에디터
- SQL 구문 강조 및 자동완성 (CodeMirror 6)
- 결과 테이블 — 정렬 · 컬럼 너비 조절 · CSV/JSON 내보내기
- `EXPLAIN` 실행 계획 뷰어
- 연결별 쿼리 히스토리 (최근 100건)

### 데이터 뷰어
- 테이블 데이터 인라인 편집
- 행 추가·삭제, 변경사항 일괄 커밋
- JSON 셀 뷰어

### 스키마 관리
- 스키마 생성 · 수정 · 삭제 (PostgreSQL)
- 테이블 생성 · 컬럼 편집 · 삭제
- 뷰 생성 · 수정 · 삭제
- 인덱스 생성
- DDL 복사 · 패널 보기

### ER 다이어그램
- 스키마 전체 테이블 관계 시각화
- 드래그·줌 인터랙션

### 세션 모니터
- 실행 중인 쿼리 목록 실시간 조회
- 슬로우 쿼리 강조, 세션 강제 종료

---

## 지원 데이터베이스

| DB | 버전 |
|----|------|
| PostgreSQL | 12 이상 |
| MySQL | 8.0 이상 |
| MariaDB | 10.5 이상 |

---

## 설치

### Marketplace
VS Code Extensions 패널에서 `DataRover` 검색 후 설치.

### VSIX 직접 설치
```bash
code --install-extension data-rover-x.x.x.vsix
```
또는 Extensions 패널 → `...` → **Install from VSIX**.

---

## 릴리즈 노트

[CHANGELOG.md](CHANGELOG.md) 참고.

# AI_WANTED 태스크 개발 워크플로우

이 문서는 사람이 제품 결정을 하고 AI가 합의한 범위만 구현하도록 만드는 공통 작업 기준이다. 기획안과 HTML 프로토타입은 큰 흐름을 설명한다. UI/UX, API, DB 사용 방식은 **태스크마다** 구체적으로 논의하고 확정한다.

## 한 태스크의 순서

```text
현재 상태 조사
→ 태스크 카드 작성
→ 사람과 논의·합의
→ 최신 main pull
→ 새 feature 브랜치
→ 합의 범위 구현
→ 검증·작업 일지 갱신
→ diff 리뷰
→ feature 브랜치 push
→ PR 리뷰·머지
→ 다음 태스크는 다시 최신 main부터
```

### 1. 태스크 카드로 먼저 논의한다

AI 또는 담당자는 코드를 바꾸기 전에 다음을 보여준다. `docs/task-logs/TEMPLATE.md`를 복사해 해당 태스크 일지에 기록한다.

| 항목 | 적을 내용 |
|---|---|
| 목표 | 누구에게 어떤 동작이 생기는가 |
| 화면 | 사용자가 보는 문구, 행동, 상태, 실패·재시도 |
| 프론트 | 컴포넌트, 페이지, 상태, 접근성 |
| 백엔드 | API 요청·응답·오류 계약, 서버 권한 |
| DB | 읽고 쓰는 테이블·컬럼, 마이그레이션 여부 |
| 수정 파일 | 담당 소유권과 공용 파일 영향 |
| 이번에 제외 | 다음 태스크로 넘길 기능 |
| 미정 사항 | 구현 전에 사람이 결정할 것 |
| 검증 | 브라우저 행동, 검사, DB 결과, 데이터 정리 |
| 외부 영향 | 패키지, secret, Cloud 데이터, AI 비용, 배포 |

사람이 화면과 기능 범위에 동의하기 전에는 제품 코드를 구현하지 않는다. 동의가 명시된 요청이면 다시 확인을 요구하지 않는다. 범위가 바뀌면 변경 이유와 새 카드를 설명하고 재합의한다.

### 2. 태스크마다 새 브랜치를 판다

기존 브랜치를 다음 기능에 재사용하지 않는다. 작업 중인 변경이 있다면 먼저 안전하게 보관하고, 깨끗한 상태에서 최신 `main`을 받는다.

```bash
git status --short --branch
git switch main
git pull --ff-only origin main
git switch -c feature/<이름>-<태스크>
```

예: `feature/yumin-student-opening`, `feature/yumin-voice-recording`. 저장소 관리 작업도 하나의 태스크로 기록하고 feature 브랜치에서 수행한다. 태스크 진행 중에는 자기 브랜치에서만 commit·push한다. 여러 병렬 세션이 같은 Git 저장소를 동시에 수정한다면 충돌을 먼저 조정한다.

### 3. 일지를 브랜치에 함께 남긴다

각 브랜치는 `docs/task-logs/YYYY-MM-DD-<태스크>.md`를 하나 이상 포함한다. 일지는 회의록 전체가 아니라 **합의한 결정과 실제 작업의 증거**를 남긴다.

필수 기록:

- 태스크 목표, 담당자, 브랜치, 상태
- 합의된 사용자 흐름과 프론트·백엔드·DB 범위
- 결정한 문구·계약과 보류한 사항
- 날짜별 작업 내용과 바뀐 파일
- 실행한 검증과 결과, 남은 제한
- 테스트 데이터 생성·정리, 외부 영향
- commit·push·PR·merge 상태

합의 후 구현이 시작되면 같은 일지를 갱신한다. 구현 중 발견한 변경이 합의 범위를 넘으면 작업을 멈추고 재논의한 내용을 일지에 추가한다. PR에는 이 일지 링크를 넣는다.

### 4. 검증하고 리뷰한다

기능 규모에 맞게 `npm run lint`, `npm run build`, 실제 화면 행동, DB 행과 권한, 실패·재시도를 확인한다. 저장소 파일 검사는 태스크마다 실행한다.

```bash
node scripts/check-repo-files.mjs
git diff --check
git status --short
```

AI는 결과, 수정 파일, 검증 증거, 남은 제한, Git diff를 사람에게 설명한다. 검증 없이 “완료”라고 쓰지 않는다.

### 5. feature 브랜치를 push하고 PR로 합친다

```bash
git add <이번 태스크 파일과 일지>
git commit -m "feat: <태스크 결과>"
git push -u origin feature/<이름>-<태스크>
gh pr create --base main --head feature/<이름>-<태스크>
```

이후 수정은 같은 태스크 브랜치에 commit·push한다. PR이 리뷰·머지되면 다음 태스크에서 다시 `main`을 pull하고 **다른 브랜치**를 만든다. `main`에 직접 push하지 않는다.

## 담당 경계와 공용 변경

파일 담당은 `docs/ARCHITECTURE.md`, 테이블 쓰기 담당은 `docs/planning/살핌_DB_스키마_v0.3.md`를 따른다. 다른 사람 파일이나 공용 설정·레이아웃·패키지를 바꿔야 하면 작업 카드에 명시하고 담당자와 먼저 조정한다. Supabase Cloud 마이그레이션, 외부 AI 공급자, 유료 호출, 실제 학생 데이터는 별도 결정으로 다룬다.

## Salesforce 파일 유입 방지

이 저장소는 Salesforce 프로젝트가 아니다. `.sf/`, `.sfdx/`, `force-app/`, `sfdx-project.json`, Apex·metadata 파일은 Git에 넣지 않는다. `.gitignore`는 새 파일을 막고, `scripts/check-repo-files.mjs`와 PR 검사(`.github/workflows/repository-hygiene.yml`)는 **이미 추적된 파일까지** 차단한다.

2026-09-14 팀원 브랜치에서 `.sf/.../metadata-catalog/catalog.json`이 머지됐다. 뒤이어 `.sf/`를 ignore해도 추적 상태가 유지돼 이 태스크에서 삭제한다. PR이 `main`에 머지되면 새 checkout에는 들어오지 않는다. 과거 Git 기록까지 지우는 작업은 별도이며, 발견된 파일은 작은 CLI 카탈로그로 확인됐다.

## 새 AI 세션의 시작 요청

```text
AI_WANTED 저장소에서 docs/WORKFLOW.md, docs/ARCHITECTURE.md와
이번 태스크 일지를 먼저 읽어줘. 현재 브랜치와 Git 상태를 확인해.
코드 전에 태스크 카드(화면·프론트·백엔드·DB·파일·제외 범위·검증)를
작성하고 내 동의를 기다려. 합의한 뒤 최신 main에서 새 feature 브랜치를
만들어 작업하고, 일지·검증·diff·push·PR 상태를 보고해.
Salesforce 경로는 절대 추적하지 마.
```

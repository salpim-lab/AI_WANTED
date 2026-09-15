# 태스크 WF-001: 작업 워크플로우와 Salesforce 파일 차단

| 항목 | 내용 |
|---|---|
| 담당 | 이유민 |
| 브랜치 | `feature/yumin-workflow-harness` |
| 상태 | PR #4 리뷰 중 |
| 시작일 | 2026-09-15 |

## 합의 기록

2026-09-15 사용자가 다음을 명시적으로 요청했다.

- Salesforce 파일이 AI_WANTED Git에 들어오지 않도록 처리
- 태스크마다 최신 코드를 받고 별도 feature 브랜치에서 작업해 push
- 태스크마다 먼저 논의하고 동의한 뒤 개발
- 태스크별 작업 일지를 문서로 보존
- 이 순서를 반복하도록 저장소에 워크플로우와 AI 지침 구축

이 요청을 WF-001 태스크의 구현 승인으로 기록한다. 이후 제품 기능 태스크는 개별 작업 카드를 먼저 논의한다.

## 작업 전 상태와 원인

- 2026-09-14 다른 팀원의 브랜치가 `main`에 머지되면서 `.sf/orgs/.../metadata-catalog/catalog.json`이 Git 추적 파일에 추가됐다.
- `.gitignore`에 `.sf/`가 뒤늦게 추가됐지만 이미 추적된 파일에는 적용되지 않았다.
- 발견 파일은 약 245바이트의 Salesforce CLI 카탈로그였다. 개인 Salesforce 문서나 API 토큰은 발견되지 않았다.
- 이유민 첫 화면의 미커밋 변경은 stash로 보관하고 최신 `origin/main`에서 이 브랜치를 만들었다.

## 구현 범위

| 영역 | 이번 태스크 | 제외 범위 |
|---|---|---|
| 프론트·백엔드·DB | 변경 없음 | 학생 첫 화면 기능 구현 |
| Git 위생 | `.sf` 추적 파일 제거, 새 Salesforce 파일 ignore 및 추적 목록 검사 | 과거 Git 기록 재작성 |
| AI 작업 방식 | `AGENTS.md`, `docs/WORKFLOW.md`, README 순서 | 팀원 외부 연락 |
| 리뷰·기록 | 태스크 일지 템플릿, PR 템플릿, PR 자동 검사 | `main` 직접 push·자동 merge |

## 작업 일지

| 날짜 | 실제 변경·결정 | 파일·데이터 영향 |
|---|---|---|
| 2026-09-15 | `origin/main`의 `.sf` 원인 조사 | Cloud DB·제품 데이터 변경 없음 |
| 2026-09-15 | Git 추적 파일 검사 추가. 기존 `.sf` 경로에서 실패함을 확인 | `scripts/check-repo-files.mjs` |
| 2026-09-15 | `.sf` 파일을 Git 추적 목록과 작업 트리에서 제거. 검사 재실행 통과 | `.sf/.../catalog.json` 삭제, `.gitignore` 보강 |
| 2026-09-15 | 작업 카드→합의→브랜치→일지→검증→push→PR 순서 문서화 | `docs/WORKFLOW.md`, `AGENTS.md`, `README.md` |
| 2026-09-15 | PR마다 Salesforce 경로와 태스크 일지를 검사하도록 설정 | `.github/workflows/repository-hygiene.yml`, `scripts/check-task-log.mjs` |

## 검증·리뷰

- Salesforce 경로 검사: 삭제 전 실패, 삭제 후 통과
- Git 추적 목록: `.sf/**` 없음
- Node 스크립트 문법 검사, Git diff 검사, ESLint 실행: 통과. 기존 미구현 코드 경고 7개
- PR 태스크 일지 검사: `GITHUB_BASE_REF=main`으로 통과
- PR 자동 검사: GitHub Actions `Repository hygiene` 통과 (PR #4 최신 push 기준)
- DB 마이그레이션·Cloud 데이터·API 비용: 변경 없음
- 남은 제한: 삭제 커밋이 `main`에 머지되기 전에는 최신 `main` checkout에 기존 파일이 남는다. 과거 Git 기록에는 삭제 이전 blob이 남는다.

## Git·PR

- commit: `d97fba2` — 워크플로우와 파일 차단 최초 구현
- push: `origin/feature/yumin-workflow-harness` 완료
- PR: [#4](https://github.com/leejihyeon114/AI_WANTED/pull/4) — `main` 대상, 리뷰 중
- merge: 사람의 리뷰 이후 진행

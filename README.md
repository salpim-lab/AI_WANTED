# 살핌

AI 기반 학생 정서 체크인 + 교사 업무 지원 서비스. Next.js(App Router) + TypeScript + Tailwind / Supabase / OpenAI.

## 시작하기 전에 꼭 읽을 것 (순서대로)

1. **이 README** — 개발 환경 설정
2. [`docs/WORKFLOW.md`](docs/WORKFLOW.md) — 태스크 합의·새 브랜치·작업 일지·PR 순서 (필수)
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — 폴더 구조, 담당 매핑, 충돌 방지 규칙 (필수)
4. [`docs/DATABASE_GUIDE.md`](docs/DATABASE_GUIDE.md) — 현재 Cloud DB 상태와 팀 개발 방법
5. [`docs/planning/살핌_DB_스키마_v0.3.md`](docs/planning/살핌_DB_스키마_v0.3.md) §1(설계 원칙) + §13(담당자별 작업 경계)
6. [`docs/planning/PLANNING.md`](docs/planning/PLANNING.md) 중 자기 담당 화면 부분 — 각 컴포넌트 파일 상단 주석에 관련 섹션이 링크돼 있음
7. [`docs/planning/살핌_기획안.md`](docs/planning/살핌_기획안.md)는 전체를 다 읽지 않아도 됨. AI/기술 설계 관련 담당자는 아래 섹션만:
   - **이유민**: 8.1(음성은 저장하지 않음), 8.6(후속 질문 중단 정책), 8.10(지연 예산)
   - **이지현**: 8.4(계층적 기억), 8.7(톤 분석)
   - **김현우**: 8.9(이름 치환), 9(기록의 무결성)
   - **전체**: 10(가드레일)

## 개발 환경

- **Node 20 이상 필수** (18.x에서는 `next dev`가 `EFAULT` 에러로 안 뜰 수 있음 — 버전 확인: `node -v`)
- 패키지 매니저: npm

```bash
npm install
cp .env.local.example .env.local   # 값은 아직 비어있음 — Supabase/OpenAI 키는 별도 공지 예정
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인. `/checkin`, `/checkout`(학생), `/dashboard`, `/students`, `/observation`, `/consultation`(교사)로 각 화면 진입 가능.

> 지금은 모든 화면이 **mock 데이터**로 동작합니다 (`components/**/mockData.ts`, `mockScenarios.ts`). 실제 Supabase/OpenAI 연동은 각자 담당 화면에서 `app/api/ai/**` 라우트부터 채워나가면 됩니다.

## 외부 서비스 SDK

Supabase SDK(`@supabase/supabase-js`, `@supabase/ssr`)는 설치되어 있습니다. `openai`는 AI API 공급자를 결정한 뒤 설치합니다. Supabase 키는 Git에 올리지 않고 팀에 별도로 공유합니다.

3D 에셋 작업 파일은 [`assets/3d/`](assets/3d/)에서 관리합니다. 최종 GLB와 썸네일은 Supabase Storage에 저장하고, DB의 `asset_catalog`에는 Storage 경로와 에셋 메타데이터를 저장합니다.

## 스타일

프로토타입 HTML의 CSS를 화면별로 그대로 옮겨둔 상태입니다 (`src/styles/prototype-*.css`). Tailwind는 설치돼 있지만 아직 안 쓰고 있어요 — **각자 담당 화면을 실제로 구현할 때 Tailwind로 바꾸면서 자기 담당 CSS 파일을 지워나가는 것**이 방침입니다 (자세한 건 `docs/ARCHITECTURE.md` 원칙 6번).

## 배포

Vercel + Supabase Cloud (무료 티어).

# AI_WANTED 공용 DB 가이드

> 대상: AI_WANTED 개발팀 5명
>
> 기준 스키마: `docs/planning/살핌_DB_스키마_v0.3.md`
>
> Cloud 반영일: 2026-09-13

## 1. 지금 DB는 어떤 상태인가

공용 Supabase Cloud 프로젝트는 이미 만들어졌고 DB 스키마 v0.3이 적용돼 있다.

| 항목 | 현재 상태 |
|---|---|
| Supabase 조직 | `AI_WANTED` 전용 조직으로 이전 완료 |
| Supabase 프로젝트 | `AI_WANTED` |
| Project ref | `kdalcsyomdxbdrwmkfqt` |
| 리전 | 서울 (`ap-northeast-2`) |
| DB 구조 | v0.3 migration 8개 적용 완료 |
| 개발 데이터 | 가상 학생 20명과 예시 체크인 2건 |
| 실제 개인정보 | 없음 |
| 앱 연결 | Supabase SDK와 DB 타입 준비 완료, 화면은 아직 mock 데이터 사용 |
| 로그인 | 학생·교사 Auth 미구현 |
| Git 상태 | `feature/yumin-db-v03`의 PR #1 검토 중, 아직 `main` 미반영 |

여기서 **Cloud DB**와 **Git 코드**는 구분해야 한다.

- Cloud DB에는 v0.3 구조와 가상 데이터가 이미 들어가 있다.
- 팀원이 같은 구조로 개발하려면 migration, SDK, 타입이 담긴 PR #1이 `main`에 먼저 머지돼야 한다.
- 화면은 아직 mock 데이터를 보여준다. DB가 만들어졌다고 화면이 자동으로 DB를 읽는 것은 아니다.

## 2. v0.3을 어떻게 반영했나

Supabase Dashboard에서 테이블을 하나씩 만든 것이 아니라, Git에 저장된 SQL migration을 순서대로 실행했다.

```text
1000_core
  학교·학급·교사·학생·재학·동의

1010_checkin
  등하교 체크인·대화 메시지·면담 신청

1020_island
  섬·3D 에셋 카탈로그·학생 아이템·아이템 배치

1030_work_records
  업무 기록·갈등 진술·학부모 상담·교사 피드백

1040_agent
  AI 분석 실행 결과·선생님 Agent 대화

1050_views
  현재 재학생 View·위험 신호 View·학생 컨텍스트 RPC

9000_integrity
  원본 수정 방지·대화 해시 체인·봉인·감사 로그

9010_rls
  학생과 교사의 읽기 범위·브라우저 쓰기 차단
```

실제 SQL은 `supabase/migrations/`에 있다. Cloud에 적용된 migration 파일은 나중에 내용을 고치지 않는다. 변경이 필요하면 더 늦은 번호의 새 migration을 추가한다.

`supabase/seed.sql`은 migration이 테이블을 만든 다음 실행했다. 그래서 로그인이나 화면이 없어도 가상 학생 행을 넣을 수 있었다. `students.id`가 Supabase Auth와 분리되어 있고 `auth_user_id`는 비어 있어도 되기 때문이다.

## 3. 가장 먼저 이해할 ID 네 개

| ID | 의미 | 어디에서 쓰나 |
|---|---|---|
| `student_id` | 학생 자체의 ID | 화면 URL, 학생 선택 |
| `enrollment_id` | 특정 학기의 학생-학급 관계 ID | 체크인, 상담, 섬, 교사 기록 |
| `session_id` | 등교 또는 하교 체크인 한 번의 ID | 대화, AI 분석, 면담 신청 |
| `message_id` | 대화 한 문장의 ID | 아이템 생성과 분석의 근거 |

화면에서는 `student_id`를 사용하고, 기록을 저장하기 전에 `v_students_current`에서 현재 학기의 `enrollment_id`를 찾는다. 학생이 진급해도 이전 학기의 기록이 섞이지 않게 하기 위한 구조다.

```text
학생 선택(student_id)
→ 현재 재학 정보 조회(enrollment_id)
→ 체크인 생성(session_id)
→ 문장별 대화 저장(message_id)
```

## 4. 앱에서는 DB를 어떻게 사용하나

### 읽기

로그인이 구현된 뒤에는 브라우저나 Server Component에서 RLS가 적용되는 클라이언트를 사용한다.

```ts
import { createClient } from "@/lib/supabase/client";
```

서버에서 로그인 사용자의 쿠키를 유지하며 읽을 때는 다음 클라이언트를 사용한다.

```ts
import { createClient } from "@/lib/supabase/server";
```

현재는 Auth가 없기 때문에 익명 브라우저가 publishable key로 학생 데이터를 조회하면 빈 결과가 나온다. 해커톤 개발 중 실제 DB 조회·저장은 우선 Next.js API Route를 거친다.

### 쓰기

쓰기 요청은 React 컴포넌트에서 Supabase로 직접 보내지 않는다.

```text
React 화면
→ Next.js API Route
→ 요청 값·사용자·학급·동의 검증
→ createAdminClient()
→ Supabase INSERT/UPDATE
```

서버 API에서 검증을 마친 뒤 다음 클라이언트를 사용한다.

```ts
import { createAdminClient } from "@/lib/supabase/admin";
```

`createAdminClient()`는 RLS를 우회할 수 있다. 따라서 ID를 요청에서 받았다는 이유만으로 바로 저장하면 안 된다. 해당 학생과 학급에 접근할 수 있는 사용자인지 서버 코드가 먼저 확인해야 한다.

### 타입

`src/lib/supabase/database.types.ts`는 현재 Cloud 스키마에서 자동 생성한 타입이다. 직접 편집하지 않는다.

```ts
import type { Database } from "@/lib/supabase/database.types";

type CheckinSession = Database["public"]["Tables"]["checkin_sessions"]["Row"];
```

스키마가 Cloud에 반영된 뒤 담당자가 타입을 다시 생성해 커밋한다.

```bash
npx supabase gen types typescript --linked --schema public \
  > src/lib/supabase/database.types.ts
```

## 5. 학생 체크인 예시

학생이 아침에 초록색을 고르고 음성으로 답하는 흐름은 다음과 같다.

```text
1. student_id로 현재 enrollment_id 조회
2. checkin_sessions에 morning + green + started 저장
3. 브라우저에서 음성 녹음
4. /api/ai/transcribe가 오디오를 STT로 처리
5. 오디오는 폐기하고 확정된 텍스트만 conversation_messages에 저장
6. 필요한 경우 AI 후속 질문도 다음 sequence 메시지로 저장
7. 면담이 필요하면 meeting_requests에 저장
8. 체크인이 끝나면 session status를 completed로 변경
9. `item_candidates`에 대표 아이템 후보와 근거 `session_id`/`message_id`를 저장
```

`conversation_messages`는 한 번 저장하면 수정하거나 삭제할 수 없다. STT 중간 결과를 계속 UPDATE하지 말고, 한 번의 발화가 확정된 뒤 한 행으로 INSERT한다.

## 6. 담당자별로 주로 사용할 테이블

| 담당 | 기능 | 주요 테이블·View |
|---|---|---|
| 이유민 | 학생 음성·대화·면담·아이템 후보 | `checkin_sessions`, `conversation_messages`, `meeting_requests`, `feedback_drafts`, `item_candidates` |
| 강윤지 | 3D 에셋·섬·아이템 배치 | `islands`, `asset_catalog`, `student_items`, `island_placements` |
| 진승혜 | 교사 대시보드 | `v_students_current`, `v_signal_flags`와 읽기 집계 |
| 이지현 | 선생님 Agent | `analysis_runs`, `agent_threads`, `agent_messages`, `get_student_context()` |
| 김현우 | 학생 상세·업무·학부모 상담 | `work_records`, `work_record_students`, `conflict_statements`, `parent_consultations` |

자기 화면에서 다른 담당자의 쓰기가 필요하면 그 담당자의 서버 API를 호출한다. 다른 담당자의 DB repository 구현을 직접 수정하지 않는다.

## 7. 팀원이 개발을 시작하는 순서

PR #1이 `main`에 머지된 뒤 다음 순서로 시작한다.

```bash
git switch main
git pull origin main
npm install
cp .env.local.example .env.local
git switch -c feature/이름-기능
npm run dev
```

`.env.local`에는 다음 세 값이 필요하다. 실제 값은 Git이나 문서에 적지 않는다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

- URL과 publishable key는 앱 식별용이다. RLS가 데이터 접근을 제한한다.
- secret key는 서버 전용이며 브라우저 번들에 들어가면 안 된다.
- 변수명 앞에 `NEXT_PUBLIC_`이 붙은 값만 브라우저에 노출될 수 있다.

팀원은 Supabase Dashboard의 Table Editor에서 가상 데이터를 확인하고 SQL Editor에서 읽기 쿼리를 시험할 수 있다. 공용 스키마는 Dashboard에서 직접 수정하지 않는다.

## 8. DB 구조를 바꿔야 할 때

모든 팀원이 migration을 작성할 수 있다.

```bash
npx supabase migration new 기능_이름
```

생성된 SQL 파일에 변경 내용을 적고 자기 기능 PR에 포함한다.

```text
기능 브랜치에서 migration 작성
→ PR 검토
→ main 머지
→ 공용 Cloud DB에 db push
→ database.types.ts 재생성
```

현재 GitHub Actions 자동 `db push`는 아직 설정되지 않았다. 자동화를 붙이기 전에는 동시에 여러 사람이 공용 DB에 직접 push하지 않는다. 적용 순서가 엇갈리면 Git의 migration 이력과 Cloud DB가 달라질 수 있다.

## 9. 가상 데이터 사용 범위

현재 시드는 가상 학생 20명, 학급 하나, 완료된 아침 체크인 2건, 대화 예시 2문장으로 구성된다.

- 실제 학생 이름·음성·상담 내용을 넣지 않는다.
- 음성 파일은 DB와 Storage에 저장하지 않는다.
- 3D GLB와 썸네일은 비공개 Supabase Storage 버킷(`3d-assets`, `3d-thumbnails`)에 저장하고, `asset_catalog`에는 object path를 저장한다.
- 시드 변경은 `supabase/seed.sql`에서 관리한다.
- 일반 `db push`에는 시드를 포함하지 않는다.
- 시연 데이터를 추가할 때도 가상 데이터만 사용한다.

## 10. 아직 구현되지 않은 것

DB 구조가 준비됐다는 것이 MVP 기능 완성을 뜻하지는 않는다. 다음은 후속 개발 대상이다.

- 학생·교사 Supabase Auth
- 학생 체크인 화면과 실제 DB 연결
- 음성 녹음과 STT 공급자 연결
- LLM 대화와 아이템 추출
- 3D 에셋 생성·Storage 버킷·섬 렌더링
- 교사 화면의 실제 집계 쿼리
- Vercel 환경변수와 배포
- `main` merge 후 자동 migration을 수행할 GitHub Actions

현재 화면의 mock 데이터를 한 기능씩 서버 API와 Supabase 데이터로 교체하면서 MVP를 완성한다.

## 11. 하지 말아야 할 것

- `.env.local`이나 secret key를 Git에 커밋하지 않는다.
- React 컴포넌트에서 `createAdminClient()`를 import하지 않는다.
- 이미 적용된 migration 파일을 수정하지 않는다.
- Dashboard에서 공용 테이블과 컬럼을 직접 추가·삭제하지 않는다.
- 대화 원문을 AI 분석 결과로 덮어쓰지 않는다.
- STT 중간 transcript나 음성 파일을 DB에 저장하지 않는다.
- 가상 학생 데이터를 실제 학생 데이터와 섞지 않는다.

# Production 배포 및 후속작업 인수인계 (2026-09-20)

> **읽는 사람**: Production 배포 담당자(동료), 대시보드·학생 화면·교사 화면·민준이의 섬 담당자.
> **작성 기준**: 현재 `main` 코드와 기존 검증 기록(`docs/데모_방문자_격리_적용_절차.md`, `docs/Vercel_Preview_배포_체크리스트.md`, `docs/인수인계_공개데모_방문자격리.md`). 이 문서를 쓰는 동안 **코드·DB·Vercel 설정·환경변수·테스트는 건드리지 않았다.**
> **비밀값은 이 문서에 적지 않는다 — 환경변수는 이름만.**
> 표기: **✅ 완료** / **⬜ 미완료** / **👁 수동 확인 완료(브라우저)** / **🤖 자동 테스트 통과** / **❓ 미확인**.

---

## 1. 현재 완료 상태

| 항목 | 상태 | 근거·비고 |
|---|---|---|
| `main` 기준 커밋 | ✅ | **구현 코드 기준 main 커밋은 `f99fc8a`**(2026-09-20 `feature/jihyeon-session-summary-db`를 fast-forward 병합·일반 push, `ea895e5..f99fc8a`). 이전 코드 병합 지점 `9434544`(1094·섬 격리)는 과거 기록으로 보존한다. `f99fc8a` 이후 main에는 문서 커밋만 추가될 수 있다 — 최신은 `git log -1 main`으로 확인. |
| Supabase **1094** 적용 | ✅ | 2026-09-20 공유 DB(`kdalcsyomdxbdrwmkfqt`)에 MCP `apply_migration`으로 1회 적용, 자기 검증 통과. |
| 원격 마이그레이션 버전 | ✅ | **`20260920012819`** (`1094_demo_shared_island`). 로컬 파일 `supabase/migrations/20260920012819_1094_demo_shared_island.sql`. |
| 공용 섬 시드 **15종** | ✅ | 공용 `student_items` 15 · 공용 섬 1 · 공용 배치 15 · 서로 다른 자산 15 · 부모 링크 0. 좌표는 `scripts/demo-island-seed/coords.json`(사용자 화면 확인·승인). |
| 공용 아이템 `locked:true` | ✅ 👁 | `/api/island` 응답의 공용 gift는 `locked:true`(이동·삭제 불가). 서버(`demoIsland.ts`)·DB 트리거·RLS로 이중 차단. Preview에서 이동 불가 확인. |
| 방문자 개인 아이템·섬·배치 격리 | ✅ 🤖 👁 | 익명 `auth.uid()`별 격리(DB 컬럼 `demo_owner_id`, 트리거, RLS, 서버 검증). 앱 A/B 95/95, 라이브 REST 30/30, 그리고 아래 Preview 스모크. |
| 실제 Vercel **Preview** A/B 스모크 | 👁 (일부) | Preview `ai-wanted-47gjufrrt-jihyeon.vercel.app`(커밋 `599dcdc`)에서 확인 — 공용 15개 표시·이동 불가 / A 체크인 후 개인 아이템 '풍선' 생성 / 배치 후 `/api/island`에서 `locked:false`+x/z 확인 / 별도 브라우저 B는 공용 15개만, `locked:false` 0개, A의 '풍선' 0개 / 교사 화면에서 B에 A의 신규 녹음이 안 보이고 공용 데모 기록만 표시 / `/api/dev/login` 404. **미확인 항목은 §10.** |
| Supabase **브라우저 클라이언트 정적 환경변수 참조** 수정 | ✅ | `src/lib/supabase/client.ts`가 `process.env.NEXT_PUBLIC_*`를 직접 참조(커밋 `42c13c5`). 예전 동적 `process.env[name]`은 프로덕션 브라우저 번들에서 `undefined`가 돼 `/demo-init`이 실패했다. |
| **아이템 폴링 취소 문제** 수정 | ✅ 🤖 | `src/lib/items/itemGenerationClient.ts`·`ItemPreparation.tsx`(커밋 `599dcdc`). 예전엔 진행 중인 GET을 1초마다 취소해 Vercel에서 결과를 못 받았다. 회귀 테스트 `npm run test:item-polling` 9개. Preview에서 '풍선' 수신으로 확인. |
| 사용자 Vercel 프로젝트 GitHub 연결 | ⬜ (미연결) | `JIHYEON/ai-wanted`는 **GitHub와 연결되지 않았다**(`vercel link` 중 자동 연결 시도는 저장소 접근 권한 문제로 실패, 프로젝트에 Git 항목 없음). 푸시해도 자동 배포가 생기지 않는다. |
| 현재 **보호된 임시 Production**과 **Preview** | ✅ (보호됨) | 아래 §11 참고. Deployment Protection = **All Deployments + Vercel Authentication**. |
| 동료의 Vercel 프로젝트와의 관계 | ✅ | **독립적**이다. 동료가 자기 계정/팀에 새 Vercel 프로젝트를 만들어도 현재 프로젝트(`JIHYEON/ai-wanted`)의 배포·환경변수·도메인과 아무 관계가 없다(환경변수를 새로 등록해야 한다 — §5). |
| AI 하루 요약 DB 저장(**1095**) | ✅ **공유 DB 적용·검증 완료**(2026-09-20, 원격 `20260920063259`, 재적용 금지) · ✅ **main 병합**(`f99fc8a`) · 🟡 **Preview `d2be404` 수동 검증 통과(일부)** | DB: 사전 14/14·사후 13/13·행동 검증 14/14(롤백)·기존 데이터 불변 — 절차 문서 §17-10. **현재 Preview는 `d2be404`**(`ai-wanted-hulxm60ay-jihyeon.vercel.app`): A 상세 화면의 등교 요약 표시·DB 저장·상세/챗봇 같은 행·생성 후 챗봇 반영·B 챗봇에 A 내용 없음(**요약·챗봇 A/B 격리 통과**) — §17-11. **미확인**: 새로고침 후 유지, 재배포 후 유지. **stopped 하교 수정(`2c1a621`)은 main에 포함**돼 있고 로컬 회귀 테스트(`test:session-summaries` 46/46)는 통과했으나 **배포 환경 검증은 미확인이며 현재 Preview에는 미포함**(§17-12). 챗봇은 요약을 자동 생성하지 않고 상세 화면 분석 경로에서 저장된 요약을 읽는다. 최종 상태·인계: §17-13. |

---

## 2. 공유 DB 주의사항 (Supabase `kdalcsyomdxbdrwmkfqt`)

**절대 금지**
- **1094 마이그레이션을 다시 적용하지 않는다.** 이미 적용돼 있고 원격 이력에 있다.
- **`scripts/demo-island-seed/seed-public-island.sql`을 다시 실행하지 않는다.** (스스로 중복 실행을 거부하도록 만들었지만, 어떤 경우에도 실행하지 않는다.) 배포 순서에 재적용 단계는 없다.
- **기존 `student_items` 42건(레거시), 공용 15건, 테스트 잔재를 임의로 삭제·수정하지 않는다.**

**봉인(불변)**
- `student_items`는 `student_items_immutable` 트리거로 **UPDATE/DELETE가 전부 거부**된다(공용·방문자·레거시 모두). 공용 섬·배치는 `islands_guard`/`island_placements_guard` 트리거로 **시드 관리 세션(`salpim.seed_admin`)이 아니면** 수정·삭제·신규 공용 생성이 거부된다(service_role이어도).
- 그래서 테스트가 남긴 익명 계정·체크인·아이템·개인 섬·배치·자산은 **지워지지 않는다.**
- **테스트 데이터 정리가 필요하면 별도 승인·계획이 필요하다.** 봉인 트리거를 우회해야 해서(1093 때 `work_records` 4건 삭제를 승인받아 특별 처리한 것과 같은 성격) 사고 위험이 크다. 삭제 대신 정책 잠금을 우선 고려한다(§9).

**코드·DB 호환성**
- **새 앱 코드는 1094가 적용된 DB에서만 실행할 수 있다**(`demo_owner_id` 등 새 컬럼·RPC를 쓴다). 1094 이전 DB에 새 코드를 붙이면 아이템 지급이 실패한다.
- **구(舊) 앱 코드도 1094 위에서 동작한다.** `student_items_owner_guard`가 소유자를 생략한 INSERT에 부모 세션의 소유자를 자동 기록하는 하위 호환 트리거다(다른 uid를 명시하면 거부). 그래서 순서는 "DB 먼저 → 코드는 그 뒤"이고 그 사이 구간은 안전하다.

**롤백**
- **전체 롤백**(`supabase/rollbacks/1094_demo_shared_island_rollback.sql`): 1093 상태(인덱스·제약·정책·트리거·컬럼·함수)를 그대로 복원한다. **방문자·공용 데이터가 1건이라도 생긴 뒤에는 스크립트 첫 블록이 예외로 거부한다** — 새 컬럼을 지우면 데이터가 사라지고, 구 유니크 인덱스는 소유자가 다른 행들 때문에 재생성이 불가능하며, 봉인 정책상 데이터를 삭제할 수도 없기 때문이다.
- **정책 잠금 롤백(부분 롤백)**: 컬럼·인덱스·행은 그대로 두고 방문자 직접 접근 정책만 1093 수준으로 되돌려 잠근다. 데이터가 생긴 뒤에는 **이것만 쓴다.** 정확한 SQL은 롤백 파일 맨 아래 주석 블록을 **그 파일에서** 확인한다(이 문서에 복사하지 않는다).
- 새 코드를 쓰는 동안 DB를 1093으로 되돌리면 안 된다(§9).

**마이그레이션 이력·적용 방식**
- 원격 이력 테이블에는 `1081_mvp_item_slots`, `1082_item_job_final_attempt` 기록이 **없다**(효과는 DB에 이미 반영됨, 이력만 없음). 그래서 **`supabase db push`를 무작정 쓰면 이 두 파일을 "미적용"으로 잡는다.**
- **먼저 `docs/데모_방문자_격리_적용_절차.md` §2-0(이력 불일치)·§2(적용 순서)·§13~§14를 읽는다.** 지금까지의 적용 방식은 MCP `apply_migration` 단건 적용이고, 적용 뒤 로컬 파일명을 원격이 기록한 버전으로 맞췄다. 팀 합의 없이 이력을 고치지 않는다(`supabase migration repair` 필요 시 별도 합의).
- **1095(AI 하루 요약 DB 저장)는 2026-09-20 공유 DB에 적용 완료됐다(원격 `20260920063259`) — 재적용하지 않는다.** 앱 코드는 main에 병합됐고(`f99fc8a`) Preview는 `d2be404`까지 배포했다(Production 미배포). 새 앱을 배포하면 DB 가드가 이미 있어 저장 시 중복·혼합이 DB에서 막힌다(이전 앱은 요약을 DB에 쓰지 않으므로 DB 적용의 영향이 없다). 롤백(`supabase/rollbacks/1095_session_summary_guard_rollback.sql`)은 데이터 손실이 없지만, 앱 배포 뒤에는 앱 코드도 함께 되돌린다. 적용 결과·검증 SQL은 절차 문서 §17-9·§17-10. 신규 mock INSERT에는 예외가 없다(시드 요약의 *읽기* 호환만 정확한 조건으로 허용).

---

## 3. 담당자별 인수인계

### 3-1. 대시보드 담당자
- **`src/lib/supabase/queries/dashboardScope.ts`의 역할**: 대시보드의 **상담 신청**(`loadOpenMeetingRequests`)과 **갈등 기록**(`loadVisibleConflictRecords`, `filterVisibleConflictRecords`)을 **방문자 범위로만** 읽는 함수. `dashboardSnapshot.ts`가 `getDemoScope()`를 한 번 읽어 이 함수들에 넘긴다(스코프를 인자로 받아 실제 DB 대조 테스트가 가능).
- **경고 — service_role/admin 클라이언트는 RLS를 우회한다.** 앱 서버 코드는 `createAdminClient()`로 읽기 때문에 RLS가 데이터를 막아주지 않는다. 방문자 격리는 **서버 코드가 직접** 건 스코프 필터가 책임진다.
- **왜 `enrollment_id`/`class_id`만으로 조회하면 안 되나**: 방문자 **전원이 같은 학생(민준, `enrollment_id`)·같은 반**을 공유한다. 그 키로만 읽으면 **다른 방문자가 만든 체크인·상담 신청·갈등 기록이 그대로 섞인다.**
- **규칙**: 상담 신청 = `source_session_id`의 부모 세션 소유자가 **공용 시드(NULL) 또는 현재 방문자**인 것만(세션 없는 신청은 방문자에게 안 보임). 갈등 기록 = **내가 쓴 것 + (담임이 썼고 시드로 확인된 것)**(`recordVisible`).
- **새 쿼리를 추가할 때**: 반드시 방문자 스코프를 적용하고, **대조군**(공용·본인 데이터가 보이는지)까지 테스트에 넣는다. origin/main 병합 때 main이 새로 넣은 조회 2건에서 실제로 격리 구멍이 발견돼 막았다.
- **검증**: `npm run test:dashboard-scope` (공유 DB **읽기 전용 SELECT만**, `.env.local`에 Supabase URL·SECRET 키 이름의 변수가 있어야 실제 DB 테스트가 실행됨).
- **현재 결과 `10 PASS / 1 SKIP / 0 FAIL`의 의미**: SKIP 1개는 "**공용(시드 세션) 열린 상담 신청** 대조군" — 공유 DB의 열린 상담 신청 29건이 전부 방문자 세션 소유라 공용 신청 대조군을 만들 수 없어서 건너뛴다(**실패가 아님**). 공용 신청이 생기면 자동 실행된다. 그동안은 쿼리 모양 테스트가 "공용 NULL 포함 필터"를 대신 검증한다. 또 갈등 기록의 "상대 방문자 기록 부재"는 DB에 방문자가 쓴 갈등 기록이 없어 순수 필터 테스트가 담당한다.

### 3-2. 학생 화면 담당자
- **`/demo-init` 익명 세션 생성 흐름**(`src/app/demo-init/page.tsx`): 세션 확인 → (없으면) [Turnstile 토큰] → **브라우저에서** `signInAnonymously()` → `POST /api/demo/init`(프로필·담당 학급 준비) → 원래 경로. 프록시(`src/proxy.ts`)가 세션 없는 방문자를 `/demo-init?next=…`로 보낸다. 익명 로그인은 이 화면 **한 곳**에서만 한다.
- **Preview URL이 바뀌면 익명 세션도 새로 생성되는 이유**: 쿠키(Supabase 세션 포함)는 **origin(호스트) 단위**이고 Vercel은 배포마다 다른 호스트를 준다. 새 URL에서는 이전 세션이 없어 새 익명 계정이 만들어지며, 이전 URL에서 만든 개인 아이템이 안 보이는 것이 **정상**이다.
- **주의 — 이전 개인 기록이 안 보인다고 DB 저장 실패로 판단하지 않는다.** 새 Preview 호스트(배포마다 다름)에서는 이전 익명 세션이 자동으로 이어지지 않아 새 익명 계정이 만들어진다. 이전 호스트에서 만든 개인 아이템·요약은 DB에 남아 있지만 다른 익명 계정(다른 `demo_owner_id`) 소유라 새 세션에서는 보이지 않는 것이 정상이다. 저장 여부는 같은 호스트·같은 브라우저 세션에서 확인하거나 DB를 읽기 전용으로 조회해 확인한다.
- **`src/lib/supabase/client.ts`는 `process.env.NEXT_PUBLIC_SUPABASE_URL` / `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 직접(정적으로) 참조해야 한다.** Next.js는 이름을 직접 쓴 `process.env.NEXT_PUBLIC_*`만 빌드 때 브라우저 번들에 넣는다.
- **경고**: `process.env[name]` 같은 **동적 접근으로 되돌리면 프로덕션 빌드에서 깨진다**(브라우저에서 값이 `undefined` → `/demo-init`이 "환경변수가 필요합니다"로 실패, 로컬 `next dev`에서는 우연히 동작해서 놓치기 쉽다). 서버 전용 파일(`admin.ts`, `server.ts`, `proxy.ts`)의 동적 접근은 서버 런타임이라 문제 없다.
- **아이템 생성 폴링 구조**(`itemGenerationClient.ts` → `pollItemGeneration`): **순차 요청**(동시에 하나) · **개별 GET 타임아웃 12초** · **응답이 ready가 아니면 그 응답이 끝난 뒤 1초 대기** 후 다음 요청 · **네트워크 오류·시간 초과는 백오프(1s→2s→4s)** 뒤 재시도, 연속 5회면 오류 화면 · **언마운트 시 외부 `AbortSignal`로 즉시 중단.**
- **되돌리지 말 것**: **"1초마다 진행 중인 fetch를 취소하는" 옛 구조**(폴링 창 시간으로 fetch를 abort). Vercel(미국 동부 함수 ↔ DB 왕복)처럼 응답이 1초를 넘는 환경에서는 결과를 **영원히** 못 받는다(실제 Preview에서 발생). 회귀 테스트: `npm run test:item-polling`.
- **체크인 완료 후 흐름**: `/checkin` 체크인 완료 → `ItemPreparation`이 `POST /api/ai/item-generation`으로 작업 접수 후 폴링 → 아이템 도착 → `IslandBoard`(섬 화면, 공용 15 + 내 배치 조회)에서 아이템을 놓으면 서버에 배치 저장(`/api/island`) → 섬에서 "배치 종료"(`onIslandComplete`) → **하교(`/checkout`) 화면으로 이동**(`goToCheckout`), 하교 쪽 섬 종료는 교사 화면(`goToTeacher`)으로.
- **UX 후속**: 현재 **저장된 섬을 다시 방문해서 보는 화면(재방문 UI)이 없다.** 저장된 배치는 체크인 흐름의 섬 화면에서만 보이고, `/island`는 저장 섬을 불러오지 않는다.

### 3-3. 교사 화면 담당자
- **A 방문자의 녹음·관찰·상담 데이터가 B에게 노출되면 안 된다.** 반면 **공용 데모 시드 기록은 A·B 모두에게 보일 수 있다**(대조군이자 의도된 동작).
- **👁 실제 Preview에서 확인**: B의 교사 화면에 **A의 신규 녹음이 보이지 않았고 공용 데모 기록만 표시**됐다.
- **`viewerTeacherId` 및 demo scope 유지**: 조회 함수(`consultationLog.ts`, `observationLog.ts`, `teacherStudents.ts` 등)는 `viewerTeacherId`/`src/lib/demo/scope.ts`(`getDemoScope`, `ownerOrFilter`, `recordVisible`, `ownerVisible`, `scopedKey`)를 적용한다. `viewerTeacherId`는 조회 함수의 **선택 인자**다(안 주면 시드 담임 것만 보임). 다만 DEMO_MODE에서는 `getDemoScope()`가 요청 쿠키에서 방문자를 직접 읽어 **인자를 빠뜨려도 격리가 유지**된다. 이 스코프 읽기를 제거하거나 우회하지 않는다.
- **admin 클라이언트 조회에는 항상 명시적 소유자(방문자) 필터가 필요**하다. RLS는 앱 서버 경로를 막아주지 않는다.
- **❓ 업무기록 직접 작성 Preview A/B 수동 테스트는 생략됐다**(Preview 브라우저 검증 없음).
- **❓ 상담 신청 격리**는 자동 테스트(`test:dashboard-scope`, 앱 A/B)로 검증됐지만 **Preview 브라우저에서는 미확인**이다.
- **AI 하루 요약(상세 화면·챗봇)**: 실제 세션의 요약은 DB(`analysis_runs`)에 저장·조회하도록 바뀌었다(**DB는 1095 적용 완료, 앱 코드는 main 병합 완료(`f99fc8a`), Preview는 `d2be404`까지 배포**). 표시·생성 규칙: ① **본인 체크인이 있는 날짜에는 공용 요약 대신 본인 요약**을 쓴다(본인 요약이 없으면 "없음") ② **아이 발화가 있는 하교 기록이 있지만 통합(full) 요약이 없으면 챗봇은 색만** 쓴다(발화 없이 중단된 하교는 하교로 세지 않고 등교 요약을 쓴다 — main 포함(`2c1a621`)·로컬 회귀 테스트 통과·**배포 환경 검증 미확인**, 현재 Preview `d2be404`에는 미포함, §17-12) ③ **챗봇은 요약을 자동 생성하지 않고**, 상세 화면에서 생성·저장된 요약을 읽는다. 공용 세션과 방문자 세션을 한 요약에 섞지 않는다. 챗봇 컨텍스트 빌더(`context.ts`)는 대화 원문을 읽지 않는다 — 원문을 넣으려면 개인정보 정책 결정이 먼저다.
- **현재 한계·후속 검토**: 시드(mock) 요약을 AI 요약과 구분 표기하지 않음 · 공용·개인 요약 병기 없음 · 공용 세션 요약의 생성 권한·횟수 제한 없음(`/api/ai/daily-analysis`에 앱 수준 호출 제한 없음). **기간 요약(`consultation_period_summary`)은 이번 범위 밖**이라 여전히 서버 메모리(인스턴스가 바뀌면 사라짐)다. 절차 문서 §17-8.

### 3-4. 민준이의 섬 담당자
- **DEMO_MODE에서는 DB 공용 15종 + 현재 방문자 개인 배치만 표시**한다(`IslandBoard.tsx`: `/api/island`가 `persisted:true`일 때).
- **공용 아이템은 이동·삭제 불가**(`locked:true`, 서버·DB 이중 차단).
- **개인 아이템은 같은 익명 uid에서 여러 체크인에 걸쳐 누적**된다(`student_items.demo_owner_id` 기준 조회, 개인 섬은 첫 배치 때 생성).
- **`/island`는 독립 확인 화면**이고 **저장형 섬이 아니다**(`src/app/island/page.tsx`는 `IslandExperience`만 렌더 — `/api/island`를 부르지 않아 공용 15종·개인 아이템을 불러오지 않는다).
- **실제 확인 경로는 `/checkin` 완료 후 섬 화면**이다.
- **main의 코드 기반 민준 18개 배치(`MINJUN_DEMO_GIFTS`)는 DEMO_MODE에서 사용하지 않는다.** `persisted:false`(DEMO_MODE=false)일 때만 폴백으로 남아 있다. 조회 중·실패 중에는 아무것도 그리지 않는다(DEMO_MODE에서 코드 기반 배치가 비치지 않게).
- **후속 사항**: **공용 15종에는 기존 민준 섬의 `note` 연출이 없다.** `note` 추가는 후속 작업(공용 15종에 큐레이션한 `note`를 별도 컬럼/테이블로 두는 방안, 또는 공용 시드를 민준 18개로 교체하는 방안 — 부모 체크인·발화 비공개 원칙은 유지).
- **공용 시드 좌표나 아이템을 바꿀 때 DB 행을 직접 수정하지 않는다.** 봉인돼 있고 공용 행 트리거가 막는다. 변경이 필요하면 좌표 JSON·시드 SQL을 다시 생성(`npm run demo-island:coords`, `npm run demo-island:seed-sql`)하는 **별도 승인 절차**(봉인 트리거 처리 포함)로만 한다.
- **`/api/island` 응답에 세션·job·발화 정보가 들어가면 안 된다.** 응답 필드는 `id·kind·name·x·z·assetFormat·geometrySpec·locked`만(앱 A/B가 이를 검사한다).

---

## 4. Production 배포 전 필수 작업

### P0 (배포 전 반드시)
- [ ] **실제 배포를 담당할 Vercel 계정·프로젝트 결정** (현재 프로젝트는 사용자 개인 팀의 임시 프로젝트 — §11).
- [ ] **Vercel GitHub 앱에 private 저장소(`leejihyeon114/AI_WANTED`) 접근 권한 부여** — 지금 연결이 실패한 원인. 권한은 저장소 소유자/조직 설정에서 부여해야 한다.
- [ ] **GitHub `main` 연결** (연결 후 푸시마다 배포가 생성되므로, 환경변수를 **먼저** 등록한 뒤 연결한다).
- [ ] **Production 환경변수 등록** (§5) — 값은 로컬 `.env.local`·각 서비스 콘솔에서 안전한 경로로 옮긴다. 채팅·문서·커밋에 값을 남기지 않는다.
- [ ] **`DEMO_MODE=true` 확인** — 정확히 문자열 `true`. 없으면 격리·`/api/demo/init`·공용 섬이 모두 꺼진다.
- [ ] **Supabase·AI 환경변수를 배포 전에 등록** — `NEXT_PUBLIC_*`는 빌드 때 고정된다(변경하면 재배포).
- [ ] **Preview는 Deployment Protection 유지** (끄지 않는다).
- [ ] **Production 공개 전에 `/item-lab/*` 차단** — 현재 프로덕션 빌드에서도 페이지가 열린다(`/item-lab`, `/pipeline`, `/village`, `/wait`, `/minjun-island`, `/demo-island-preview`). 404 처리(`notFound()`) 또는 인증/접근 제한. **이번 작업에서는 구현하지 않았다.**
- [ ] **`/api/dev/*`가 Production에서 404인지 확인** — 라우트 5개(`login`, `reset-today`, `item-inference`, `demo-placements`, `demo-island-preview`)는 `NODE_ENV=production`에서 404(`demo-island-preview`는 `DEMO_ISLAND_PREVIEW=1`이면 열리므로 **그 변수 미설정**). 현재 확인은 Preview의 `/api/dev/login`뿐(§10).
- [ ] **Turnstile/CAPTCHA 구현·설정·검증** — 코드는 있다(`/demo-init`이 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`가 있으면 위젯 사용). **미활성, 브라우저 쪽(위젯 렌더→토큰→로그인) 미검증.** 순서 규칙: **① Cloudflare Turnstile 위젯 생성(도메인: 실제 Production 도메인·localhost) → ② 사이트 키를 Vercel에 등록한 배포를 먼저 완료 → ③ Supabase Anonymous Sign-Ins는 켠 상태로 Authentication → Attack Protection → CAPTCHA를 켜고 시크릿 키 입력(시크릿은 **앱/Vercel이 아니라 Supabase 대시보드에만**).** 순서를 뒤집으면 **모든 방문자의 로그인이 실패**한다. 캡차를 켜면 서버 밖 익명 로그인이 막혀 **`test:demo-ab`·라이브 REST 스크립트는 캡차 꺼진 환경 전제라 그대로는 못 돌린다**(캡차 켠 뒤의 검증 방법은 별도로 정할 것).
- [ ] **실제 Production 도메인 설정** (현재 없음 — §10).
- [ ] **Supabase Auth의 허용 도메인·URL 설정 검토** — Site URL·Redirect URLs가 새 Production 도메인과 맞는지 확인(익명 로그인 자체는 리다이렉트를 쓰지 않지만 프로젝트 설정 점검 항목으로 둔다). 이 환경에서는 대시보드 설정을 조회하지 않았다 ❓.

### P1 (공개 전 설계·구현 권장)
- [ ] **전체 AI 경로의 호출 제한 설계.**
- **현재 사실**: 앱에 구현된 제한은 **`/api/ai/teacher-agent`(협진 챗봇) 한 경로에만**, **로그인/익명 uid 기준(세션이 없으면 IP) 시간당 30회**다(`src/lib/ai/rateLimit.ts` + DB `ai_rate_limits`, `increment_ai_rate_limit()`). 프로젝트 전체 합계가 아니라 **방문자별**이며, 쿠키를 지우면 새 uid로 초기화된다.
- **경고**: **학생 대화(`/api/ai/chat`)·음성 전사(`transcribe`)·아이템 생성(`item-generation`)·일일 분석·코멘트 초안·어휘 성장·`item-extract`에는 앱 수준 호출 제한이 없다.**
- **OpenAI·Anthropic 콘솔의 월 사용금액 한도**는 각각 설정돼 있다(담당자 확인 사항, 별도의 안전장치). 두 업체 비용을 합산하는 앱 내부 통합 상한은 없다.
- 설계할 것: **프로젝트 일일 총량 상한 · 방문자별 제한 · IP 보조 제한 · 비상 차단**(기존 `docs/데모_방문자_격리_적용_절차.md` §11 제안 참고) / **한도 소진 시 폴백(고정 응답·캐시·목업)과 사용자 안내 메시지** / **운영 로그와 비용 알림 설정**.
- [ ] **AI 하루 요약 DB 저장(1095) 배포 환경 검증** — DB 적용·main 병합은 완료(2026-09-20). 남은 것(최신 main을 배포하는 프로젝트에서): **새로고침 후 상세 요약 유지**, **재배포 후 유지**, **stopped 하교 수정의 배포 환경 확인**(현재 Preview `d2be404`에는 미포함), 실제 AI 1회 생성·챗봇 확인·A/B 격리 재확인. 새 Preview 호스트에서는 익명 세션이 이어지지 않는다(§3-2). 절차 문서 §17-7·§17-13.

### P2 (후속 개선)
- [ ] **섬 재방문 UI** (저장된 내 섬을 체크인 밖에서 다시 보는 화면).
- [ ] **공용 아이템 `note` 연출.**
- [ ] **`/island` 화면의 목적 정리 또는 제거.**
- [ ] **AI 요약 현재 한계·후속 검토**: 시드(mock) 요약 구분 표기, 공용·개인 요약 병기 여부, 공용 세션 요약의 생성 권한·횟수 제한(P1 AI 호출 제한과 함께). **기간 요약의 DB 저장**은 이번 범위 밖(`source_type='student'`, `demo_owner_id` 서버 채움 설계 필요).
- [ ] **테스트 잔재 정리 절차**(봉인 트리거 때문에 별도 승인·계획 필요, §2).
- [ ] **성능 개선과 Vercel/Supabase 리전 검토** — Supabase는 서울(`ap-northeast-2`, `docs/DATABASE_GUIDE.md`). **Vercel 함수 실행 리전은 확정하지 못했다 ❓**(프로젝트 설정의 Functions Region에서 확인) — Preview `d2be404`의 *빌드*는 `iad1`(Washington, D.C.)에서 실행됐으나 이를 함수 실행 리전으로 확정하지 않는다. 함수와 DB 리전이 멀면 API 왕복이 누적돼 느려진다(폴링 문제에서 응답이 1초를 넘은 배경일 수 있음 — 추정).

---

## 5. Vercel 환경변수 (이름만 · 값 출력 금지)

**유형 권장**: `Secret` = 값이 숨겨지는 Sensitive 유형(서버 전용 비밀). `Config` = 일반 변수(브라우저에 공개되는 `NEXT_PUBLIC_*` 포함).
**현재 상태**: Preview에 아래 10개가 등록돼 있다(비밀 3개는 Secret, 나머지 Config). **Production·Development에는 아무것도 없다.** 동료의 새 프로젝트에는 모두 **새로 등록**해야 한다.

### 필수 (없으면 앱이 뜨지 않거나 격리가 꺼진다)
| 변수 | 권장 유형 | Preview | Production | 비고 |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Config (공개) | ✅ 등록됨 | ⬜ 등록 필요 | 빌드 시 번들에 고정 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config (공개, publishable 키) | ✅ 등록됨 | ⬜ 등록 필요 | 빌드 시 번들에 고정 |
| `SUPABASE_SECRET_KEY` | **Secret** (서버 전용, `NEXT_PUBLIC_` 금지) | ✅ 등록됨 | ⬜ 등록 필요 | service_role. 유출 시 즉시 교체 |
| `DEMO_MODE` | Config | ✅ 등록됨 | ⬜ 등록 필요 | **정확히 `true`**여야 격리 켜짐 |

### AI 사용 시
| 변수 | 권장 유형 | Preview | Production | 비고 |
|---|---|---|---|---|
| `AI_ENABLED` | Config | ✅ 등록됨 | ⬜ | `false`면 AI 차단(목업 칩 흐름). 비용 통제용 스위치, 미설정=켜짐 |
| `OPENAI_API_KEY` | **Secret** | ✅ | ⬜ | 없으면 대화·전사·조립·분석이 503, 아이템은 폴백(선물 상자) |
| `ANTHROPIC_API_KEY` | **Secret** | ✅ | ⬜ | 없으면 아이템 추론·협진 챗봇 실패 → 폴백 |
| `OPENAI_ITEM_MODEL` | Config | ✅ | ⬜ | 미설정 시 코드 기본값 |
| `OPENAI_ITEM_ASSEMBLY_MODEL` | Config | ✅ | ⬜ | 미설정 시 `OPENAI_ITEM_MODEL` |
| `ANTHROPIC_AGENT_MODEL` | Config | ✅ | ⬜ | 미설정 시 코드 기본값 |
- 모델 변수는 **로컬과 같은 품질**을 원할 때만 맞춘다(미설정=코드 기본값). `CHAT_MODEL`, `STT_MODEL`, `ANTHROPIC_ITEM_MODEL`, `OPENAI_VOCAB_MODEL`, `OPENAI_ANALYSIS_MODEL`은 **미설정**이 기본이다.

### 조건부 / 후속
| 변수 | 권장 유형 | 언제 |
|---|---|---|
| `ITEM_WORKER_SECRET` | **Secret** | 외부 크론이 `/api/internal/item-generation/worker`를 부를 때만. 앱 흐름은 `GET /api/ai/item-generation` 폴링의 `after()`가 job을 실행하므로 **없어도 된다**(미설정이면 워커 라우트는 503으로 안전) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Config (공개) | CAPTCHA를 켤 때. **Supabase 캡차를 켜기 전에** 이 값이 들어간 배포가 먼저 나가야 한다(§4 P0). 현재는 비워 둠 |
| CAPTCHA 관련 **서버 비밀값**(Turnstile 시크릿 키) | (Vercel에 두지 않음) | **앱/Vercel이 아니라 Supabase 대시보드(Authentication → Attack Protection → CAPTCHA)에만 입력**한다 |
| `DEMO_LOCKDOWN` | Config | **평소 미설정.** 비상 정지용 스위치(§9) — 값을 `true`로 설정하고 재배포/재적용해야 켜진다 |

### 설정 금지 또는 주의
| 변수 | 이유 |
|---|---|
| `DEMO_ISLAND_PREVIEW` | 로컬 미리 보기 전용. 켜면 프로덕션 빌드에서도 `/api/dev/demo-island-preview`가 열린다 — **Preview·Production 모두 설정 금지** |
| `SUPABASE_ACCESS_TOKEN` | 로컬 CLI/MCP용. 앱은 읽지 않는다 — **Vercel에 등록하지 않는다** |
| `VERCEL_OIDC_TOKEN` | `vercel link`가 로컬 `.env.local`에 추가한 **단기 토큰**. 앱은 읽지 않는다 — **Vercel에 등록하지 않는다.** (로컬 `.env.local`에 남아 있으니 커밋되지 않게 주의, 원하면 그 줄만 제거) |
| `DAILY_ANALYSIS_ONLY_STUDENT_IDS`, `TEACHER_REAL_CHECKINS`, `TEACHER_MOCK_FIXTURE`, `MOCK_TODAY_AFTERNOON`, `DEV_STUDENT_ID` | 개발·목업 스위치. 로컬 `.env.local`에도 없다 → **미설정**(설정하면 분석 범위·목업 판정이 바뀐다) |
| `NODE_ENV` | Vercel이 자동으로 `production`. 직접 설정하지 않는다 |
- **`NEXT_PUBLIC_*`는 빌드 시 고정**된다. 값을 바꾸면 **재배포해야** 반영된다. 반드시 **변수 등록 → 배포** 순서.
- 비밀값을 채팅·문서·커밋·스크린샷에 남기지 않는다. 키를 공유한 적이 있으면 회전(재발급)을 검토한다.

---

## 6. 권장 배포 순서

> **DB 1094·공용 시드·1095는 이미 적용됐으므로 이 순서에 DB 적용·재적용 단계는 없다.** 1095 앱 코드는 이미 main(`f99fc8a`)에 있어 별도 병합 단계도 없다 — 배포하는 프로젝트가 최신 main을 배포하면 함께 나가며, 배포 뒤 확인은 절차 문서 §17-7·§17-13. **동료가 별도 Vercel 프로젝트에 배포한다면 그 프로젝트의 환경변수(§5)와 접근 보호를 3~4번에서 별도로 설정**해야 한다.

1. **동료 Vercel 프로젝트 생성**(담당 계정/팀 결정 후).
2. **GitHub `main` 연결**(먼저 Vercel GitHub 앱의 저장소 접근 권한 부여). 환경변수를 등록하기 **전에** 연결하면 변수 없는 자동 빌드가 생길 수 있으니 3번 뒤에 연결해도 된다.
3. **Preview/Production 환경변수 구분 등록**(§5).
4. **Deployment Protection 설정**(Preview 보호 유지 + Production 공개 정책 결정).
5. **`/item-lab/*` 차단과 CAPTCHA 코드 반영**(P0. 캡차는 순서 규칙 준수).
6. **타입체크·린트·빌드·비파괴 테스트**(§7).
7. **Preview 배포**.
8. **Preview 스모크**(§8의 항목을 Preview 도메인에서).
9. **Production 도메인·Supabase Auth 설정**.
10. **Production 배포**.
11. **최종 스모크**(§8).
12. **로그·AI 비용·오류 모니터링**.
13. **기존 임시 Vercel 프로젝트(`JIHYEON/ai-wanted`) 유지/삭제 결정**(§11).

---

## 7. 테스트 명령과 데이터 영향

기존 문서와 스크립트를 읽고 정리했다. "공유 DB 변경" = 공유 Supabase에 행을 만들거나 바꾸는가.

| 명령 | 무엇을 검증 | 공유 DB 변경 | AI 호출 | 테스트 데이터 남음 | 반복 실행 |
|---|---|---|---|---|---|
| 타입체크 `npx tsc --noEmit -p .` | 타입 | 없음 | 없음 | 없음 | ✅ 가능 |
| 린트 `npm run lint` | ESLint(현재 오류 0, 경고 11 — 기존과 동일) | 없음 | 없음 | 없음 | ✅ 가능 |
| 빌드 `npm run build` | 프로덕션 빌드 | 없음 | 없음 | 없음(`.next` 생성) | ✅ 가능 |
| `npm run test:1094-local` | 1094 마이그레이션·롤백·트리거·RLS·RPC를 **임베디드 Postgres(PGlite, 메모리)** 에서 검증(22개) | **없음**(공유 DB 미사용) | 없음 | 없음 | ✅ 가능 |
| `npm run test:island` | 공용 좌표 규칙·좌표 JSON 결정성(7개) | 없음 | 없음 | 없음 | ✅ 가능 |
| `npm run test:dashboard-scope` | 대시보드 상담 신청·갈등 기록 A/B 격리(11개: 10 통과·1 SKIP) | **없음 — 읽기 전용 SELECT만**(`.env.local`의 service 키로 조회, 행 생성·수정 없음) | 없음 | 없음 | ✅ 가능(`.env.local` 키가 없으면 DB 테스트는 건너뜀) |
| `npm run test:item-polling` | 폴링 회귀(가짜 fetch, 9개) | 없음 | 없음 | 없음 | ✅ 가능 |
| `npm run test:1095-local` | 1095(요약 유니크 인덱스·가드 트리거)·롤백·적용 직전/직후 검증 SQL 리허설을 **PGlite**에서 검증(35개) | **없음**(공유 DB 미사용) | 없음 | 없음 | ✅ 가능 |
| `npm run test:session-summaries` | 요약 저장·조회·A/B 격리·재사용·멱등·인스턴스 변경(메모리 DB + **가짜 fetch**, 46개) | 없음 | **없음**(가짜 fetch) | 없음 | ✅ 가능 |
| `npm run test:demo-ab -- <서버주소>` | 앱 경로 A/B 전체(체크인·아이템 생성·배치·직접 REST, 95개) | **있음 — 쓴다** | **있음**(아이템 생성 경로: 추론·조립) | **남는다**(아래) | 🚫 **반복 금지** |
- 참고(요청 목록 밖): `node scripts/verify-1094/verify-1094-live-rest.mjs <서버주소>`(`SEEDED=1`)는 익명 계정과 프로필·학급 등록 행만 만들고 데이터 행은 만들지 않는다(앱 서버의 `/api/demo/init` 필요). `npm run demo-island-seed:*` 계열은 파일만 생성하며 **생성된 시드 SQL을 실행하지 않는다.**
- 참고: 섬 단위 테스트 파일 일부(`placement` 2개, `puzzle` 로드 실패, `islandTerrain` 1개, `pieceLandscape`의 `PROP_REACH` 1개)와 `scripts/test-item-generation-wait.cjs`는 **이번 변경 이전부터 실패하는 기존 문제**다(기준선 비교로 확인). `npm run test:island`에는 포함되지 않는다.

### ⚠️ `npm run test:demo-ab` — 반복 실행 금지
- **실제 익명 계정**(2개), 프로필·담당 학급 등록, **체크인 세션**, 전사 저장, 상담 신청, **아이템 생성 job**(AI 호출 포함), **`student_items`**(방문자 소유), **`asset_catalog` 자산**, **개인 섬·배치**를 공유 DB에 만든다.
- 이 행들은 **봉인 트리거·불변 정책 때문에 지워지지 않는다.** 실행할 때마다 잔재가 쌓인다.
- **AI 비용이 발생**한다(방문자마다 아이템 생성 1~2회, 실제 OpenAI·Anthropic 호출). 마지막 실행에서 job 3건이 실제로 완료됐다.
- 필요 조건: `DEMO_MODE=true` 앱 서버, Anonymous Sign-Ins 켜짐, **CAPTCHA 꺼짐**, 1094 적용.
- **정말 필요할 때 한 번만** 실행하고, 결과를 문서에 기록한다.

---

## 8. Production 최종 스모크

> 배포 후 **한 번만**, 하나의 Production URL에서 처음부터 끝까지. 스모크는 익명 계정·체크인·아이템·개인 섬·배치·자산을 **지워지지 않는 테스트 잔재로 남긴다**(반복 금지).

- [ ] **Vercel 보호/공개 범위 확인**(누가 접근 가능한지, Preview는 보호 유지).
- [ ] **A·B 익명 방문자 생성**(서로 다른 브라우저/프로필, `/checkin` → `/demo-init`).
- [ ] **공용 15종 동일성**(A·B 섬 화면의 모양·위치가 같음).
- [ ] **공용 아이템 이동·삭제 차단**(`locked:true`).
- [ ] **A 개인 아이템 생성·배치·누적**(첫 체크인 + 하교 체크인 → 내 아이템 2개 + 공용 15개).
- [ ] **B에서 A의 아이템·녹음·상담 데이터 미노출.**
- [ ] **교사 화면 공용 시드와 개인 데이터 구분**(공용 기록은 둘 다, 개인 기록은 본인에게만).
- [ ] **`/api/island` 응답 위생**(`name`·모양·좌표·`locked` 외 세션·job·발화 정보 없음).
- [ ] **`/api/dev/*` 404**(`login`, `reset-today`, `item-inference`, `demo-placements`, `demo-island-preview` 각각).
- [ ] **`/item-lab/*` 차단**(404 또는 인증).
- [ ] **CAPTCHA 정상·실패·우회 시도**(토큰 없이 익명 로그인 시도가 거부되는지 포함).
- [ ] **AI 호출 제한 및 폴백**(teacher-agent 30회/시간 429, 한도·키 문제 시 폴백 동작).
- [ ] **오류 로그와 비용 증가 확인**(Vercel Runtime Logs, OpenAI·Anthropic 사용량).
- [ ] **테스트 데이터를 남긴다는 경고 확인**(정리 계획 없이 반복 금지).

---

## 9. 롤백·비상 대응

- **`DEMO_LOCKDOWN`의 목적과 사용 조건**: `DEMO_LOCKDOWN=true`이면 프록시(`src/proxy.ts`)가 **데이터·학생·교사 경로 전체를 세션과 무관하게 503**으로 막는다. 방문자 데이터를 **즉시 닫아야 할 때**(유출 의심, 비용 폭주 등)만 쓴다. **`DEMO_MODE=false`는 안전한 복구가 아니다** — 방문자 격리도 같이 꺼져서 교사 화면에 방문자 데이터가 노출된다. 환경변수를 바꾸면 재배포가 필요할 수 있으니 켜는 절차를 미리 익혀 둔다.
- **앱 코드 롤백과 DB 롤백은 별개**다. 앱만 이전 커밋으로 되돌리는 것은 DB와 독립적이다(구 코드도 1094 위에서 아이템 지급이 되는 하위 호환 트리거가 있다).
- **새 코드에서 DB를 1093으로 되돌리면 안 되는 이유**: 새 코드는 `demo_owner_id`·`is_public_demo`·`footprint_radius` 컬럼과 `place_demo_item`/`remove_demo_placement` RPC를 쓴다. DB를 1093으로 되돌리면 이것들이 사라져 **새 코드의 아이템 지급·섬 조회가 실패**한다. DB를 되돌려야 하면 **새 코드도 함께** 되돌려야 한다.
- **방문자 데이터 생성 후 전체 롤백 금지**: 컬럼·행을 지우면 데이터가 사라지고, 봉인 정책 때문에 삭제 자체가 불가능하며, 구 유니크 인덱스도 재생성할 수 없다(§2). 롤백 스크립트가 스스로 거부한다.
- **데이터 삭제 대신 정책 잠금 우선**: 방문자 직접 접근을 닫아야 하면 컬럼·행은 두고 **정책만 잠그는 부분 롤백**을 쓴다.
- **Production 장애 시 검토 순서**: ① **보호 활성화**(Deployment Protection·필요 시 `DEMO_LOCKDOWN`) → ② **AI 비활성화**(`AI_ENABLED=false`) → ③ **앱 롤백 또는 정책 잠금**.
- **정확한 SQL은 `supabase/rollbacks/1094_demo_shared_island_rollback.sql`을 직접 참조한다**(전체 롤백 블록과 맨 아래 "부분 롤백(정책 잠금)" 주석 블록). 이 문서에 SQL을 복사하지 않는다. 상세 배경은 `docs/데모_방문자_격리_적용_절차.md` §8·§13-4.

---

## 10. 확인된 한계와 미확인 항목

| 항목 | 상태 |
|---|---|
| 상담 신청 **Preview 브라우저** 격리 | ❓ 미확인(자동 테스트로는 검증됨) |
| Preview **재입장** 수동 스모크(쿠키 삭제 후 새 익명 계정) | ❓ 미확인 |
| `/api/dev/reset-today`, `/api/dev/demo-island-preview` **개별 404** | ❓ 미확인(`/api/dev/login`만 확인됨) |
| 교사 **업무기록 작성** Preview A/B 수동 테스트 | ❓ 미확인(생략) |
| 실제 공개 **Production 도메인** | ⬜ 미설정 |
| Turnstile/**CAPTCHA** | ⬜ 미활성(브라우저 쪽 미검증) |
| **Production 배포·최종 스모크·모니터링** | ⬜ 미수행 |
| 공용 15종 **note 연출** | ⬜ 없음(후속) |
| `/island`는 **저장형 섬이 아님** | 한계(설계상 독립 확인 화면) |
| **Vercel 함수 리전**, Vercel 플랜의 **함수 최대 실행 시간 한도** | ❓ 함수 실행 리전 미확정(Preview 빌드는 iad1에서 실행됐으나 빌드 리전 ≠ 실행 리전 — 확인 전까지 미확정) · 플랜 한도 미확인(아이템 생성 라우트 `maxDuration=180`, 대화·전사 등 60. Supabase는 서울) |
| Supabase Auth **허용 도메인·URL** 설정 | ❓ 조회하지 않음 |
| 앱 **전체 AI 호출 한도**, 프로젝트 일일 총량·통합 금액 상한 | ⬜ 없음(P1) |
| **1095 앱 배포 환경 검증** | 🟡 일부 확인 — Preview(`d2be404`, 당시 feature 브랜치·이후 main `f99fc8a`에 병합)에서 요약 표시·DB 저장·상세/챗봇 조회 행 일치·생성 후 챗봇 반영·A/B 격리 통과(§17-11). ⬜ 미확인: **새로고침 후 유지, 재배포 후 유지**, **stopped 하교 수정의 배포 환경 검증**(main 포함·로컬 회귀 통과, 현재 Preview 미포함), 최신 main의 Preview·Production 배포 |
| AI 요약 **현재 한계**(시드 구분 표기 없음·공용/개인 병기 없음·공용 세션 요약 생성 제한 없음)와 **기간 요약 DB 저장** | ⬜ 후속 검토(기간 요약은 이번 범위 밖) |
| 테스트 잔재(익명 계정·체크인·아이템·개인 섬·배치·자산) | 남아 있음(봉인으로 삭제 불가) |

---

## 11. 기존 사용자 Vercel 프로젝트 (`JIHYEON/ai-wanted`)

- **GitHub 미연결.** 푸시해도 배포되지 않는다. 배포는 CLI 수동(`npx vercel deploy --target=preview --yes --scope jihyeon`, **`--prod` 금지** — 첫 배포가 Production이 되는 함정이 이미 한 번 있었다).
- **보호된 임시 Production과 Preview가 있다.**
  - **임시 Production 1건**: 첫 `vercel` 배포가 자동으로 Production 타깃이 되어 생겼다. 환경변수를 Preview 스코프에만 등록했으므로 Production에는 변수가 **없다**(따라서 이 배포는 정상 동작하지 않는다). Deployment Protection(All Deployments + Vercel Authentication)으로 **보호**돼 있고 프로덕션 도메인이 로그인으로 리다이렉트되는 것을 확인했다. 실제 서비스가 아니다.
  - **Preview 여러 건**: 브라우저 클라이언트 env 결함 버전 → 클라이언트 수정 버전 → **최신 `ai-wanted-47gjufrrt-jihyeon.vercel.app`(커밋 `599dcdc`, 폴링 수정 포함)** 순으로 배포했다(정확한 개수·목록은 Vercel 대시보드에서 확인). 스모크는 최신 배포에서 진행했다. 모두 보호돼 있다.
  - **현재(최신) Preview**: `https://ai-wanted-hulxm60ay-jihyeon.vercel.app`(커밋 `d2be404`) — 요약 DB 저장·챗봇 반영·B 비노출을 실제 확인했다(§17-11). **stopped 하교 수정(main `2c1a621`)은 이 Preview에 포함되지 않았다.** 위 `47gjufrrt`(`599dcdc`) Preview는 과거 검증 기록으로 보존한다.
  - Preview 환경변수는 Preview 스코프에 10개 등록(§5).
- **동료의 별도 Vercel 프로젝트와 독립적**이다. 동료 배포에 이 프로젝트의 환경변수·도메인·보호 설정은 적용되지 않는다.
- **동료가 별도 Vercel 프로젝트에 최신 main을 배포하는 경우**: 그 프로젝트의 **환경변수(§5)와 접근 보호(Deployment Protection)를 별도로 설정**하고, 남은 검증(§10과 절차 문서 §17-13의 미확인 항목)을 그 배포에서 진행해야 한다. **이 사용자 개인 프로젝트의 유지·삭제는 별개 결정**이다.
- **동료 배포 확인 후 사용자가 결정**: ① **유지** ② **배포만 삭제**(임시 Production·Preview 배포 삭제) ③ **프로젝트 삭제**.
- **Vercel 프로젝트를 삭제해도 GitHub `main`과 Supabase DB는 삭제되지 않는다**(Vercel은 코드 사본을 배포할 뿐).
- **Supabase 프로젝트나 DB는 Vercel 프로젝트와 함께 삭제하면 안 된다.** 공유 Supabase(`kdalcsyomdxbdrwmkfqt`)는 팀 전체가 쓰는 데이터다.

---

## 12. 관련 문서
- `docs/인수인계_공개데모_방문자격리.md` — 담당자별 핵심 인수인계 요약.
- `docs/Vercel_Preview_배포_체크리스트.md` — Preview 환경변수·A/B 스모크·AI 비용 제한 현황·`/item-lab` 인계·스모크 결과.
- `docs/데모_방문자_격리_적용_절차.md` — 격리 설계·마이그레이션 적용 순서·롤백·검증 이력(§13 1094, §14 적용·시드·최종 검증, §15 main 병합, §16 후속 결정·대시보드 회귀 테스트).

# Vercel Preview 배포 준비 체크리스트 (2026-09-20)

> 범위: **Preview 배포 준비만.** 코드·DB 변경, main 병합, Production 배포, CAPTCHA 활성화는 이 문서의 대상이 아니다.
> 기준 코드: `feature/jihyeon-demo-anon-isolation` (origin/main 병합 완료, 공유 DB에 1094 + 공용 시드 15종 적용 완료).
> **비밀값은 이 문서에 적지 않는다 — 변수 이름만.** 값은 로컬 `.env.local`(gitignore 대상)과 각 서비스 콘솔에서만 다룬다.

## 1. 환경변수 전수 조사 결과 (코드가 실제로 읽는 이름)
조사 방법: `src/`·`next.config.ts` 전체에서 `process.env.*` 참조를 전수 grep. `vercel.json`·`.env.example`은 없고 `.env.local.example`만 있다. `next.config.ts`는 환경변수를 읽지 않는다.

### A. Preview에 **반드시** 필요 (없으면 앱이 뜨지 않거나 방문자 격리가 꺼진다)
| 변수 | 종류 | 없으면 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 공개(빌드 시 번들에 인라인) | 브라우저·서버 Supabase 클라이언트 생성 실패 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개(빌드 시 인라인, publishable 키라 노출 OK) | 익명 로그인·세션 게이트 실패 |
| `SUPABASE_SECRET_KEY` | **Sensitive**, 서버 전용 (`NEXT_PUBLIC_` 금지) | admin 클라이언트가 예외 → 거의 모든 API 실패 |
| `DEMO_MODE` = `true` | 서버 | 익명 격리·`/api/demo/init`(404)·공용 섬 조회(`persisted:false`)가 모두 꺼진다. 값은 정확히 `true` |

### B. AI 기능까지 Preview에서 확인하려면 필요 (없어도 앱은 뜨고 **폴백으로 동작**)
| 변수 | 종류 | 없으면 |
|---|---|---|
| `OPENAI_API_KEY` | **Sensitive** | 학생 대화·음성 전사·아이템 조립·일일 분석·어휘 성장이 `AI_NOT_CONFIGURED`(503) → 대화는 칩 흐름, 아이템은 폴백(선물 상자) |
| `ANTHROPIC_API_KEY` | **Sensitive** | 아이템 추론(Claude)·선생님 agent 실패 → 아이템은 폴백(선물 상자), agent 응답 불가 |
- 방문자 격리·공용 섬만 확인하려면 이 표의 두 키 없이도 가능하다(개인 아이템이 폴백 "선물 상자"가 될 뿐, 저장·격리 동작은 같다). **서로 다른 모양의 개인 아이템을 보는 스모크 #3~#5에는 두 키가 모두 필요**하다(둘 중 하나만 없어도 폴백 아이템이 된다).

### C. 선택 (기본값이 있거나 없어도 안전) — 로컬과 같은 동작을 원할 때만
| 변수 | 용도 | 권장 |
|---|---|---|
| `AI_ENABLED` | `false`면 AI 호출 차단(학생 화면은 목업 칩 흐름) | 과금 없이 화면만 볼 때 `false`. 기본(미설정)=켜짐 |
| `DEMO_LOCKDOWN` | `true`면 데이터·학생·교사 경로 전체 503(비상 정지) | 평소 **미설정**. 비상 시에만 |
| `OPENAI_ITEM_MODEL`, `OPENAI_ITEM_ASSEMBLY_MODEL` | 아이템·조립 모델 오버라이드(기본 `gpt-4.1-mini`) | 로컬에 설정돼 있으니 **품질을 로컬과 맞추려면 같은 값**으로. 아니면 미설정(기본값) |
| `ANTHROPIC_AGENT_MODEL` | 선생님 agent 모델(기본 haiku) | 로컬에 설정돼 있으니 동일 기준으로 |
| `ANTHROPIC_ITEM_MODEL`, `OPENAI_VOCAB_MODEL`, `OPENAI_ANALYSIS_MODEL` | 각 모델 오버라이드 | 로컬에 없음 → **미설정** |
| `CHAT_MODEL`, `STT_MODEL` | 대화·전사 모델 | `.env.local.example`이 "비워 두라"고 명시 → **미설정** |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile 위젯 | **비워 둔다**(CAPTCHA 활성화는 이번 범위 밖 — §10 순서 규칙: 사이트 키 배포가 먼저, Supabase 캡차는 그다음). 로컬 값도 현재 비어 있음 |
| `ITEM_WORKER_SECRET` | **Sensitive.** `/api/internal/item-generation/worker`(외부 크론이 부르는 라우트) 인증 | Preview에서는 **불필요** — 앱 흐름은 `GET /api/ai/item-generation` 폴링 안의 `after()`가 job을 실행한다. 미설정이면 워커 라우트는 503(안전). 크론을 붙일 때만 설정 |

### D. Preview에 **설정하면 안 되는 것**
| 변수 | 이유 |
|---|---|
| `DEMO_ISLAND_PREVIEW` | 로컬 미리 보기 전용 — 켜면 프로덕션 빌드에서도 `/api/dev/demo-island-preview`가 열린다 |
| `SUPABASE_ACCESS_TOKEN` | 로컬 Supabase CLI/MCP용. 앱 코드는 읽지 않는다(로컬 `.env.local`에는 있음) |
| `DAILY_ANALYSIS_ONLY_STUDENT_IDS` | 로컬 `.env.local`에 없다(설정하면 다른 학생의 일상 분석이 501, 목업 범위 판정이 바뀐다) — 로컬과 같은 동작을 위해 **미설정** |
| `TEACHER_REAL_CHECKINS`, `TEACHER_MOCK_FIXTURE`, `MOCK_TODAY_AFTERNOON`, `DEV_STUDENT_ID` | 개발·목업 스위치. 미설정이 기본 동작 |
| `NODE_ENV` | Vercel이 자동으로 `production`. 그래서 `/api/dev/*`(로그인 우회·item-inference·reset-today·demo-placements)가 404가 된다 |

## 2. Vercel 설정 체크리스트 (배포 전)
- [ ] **변수 스코프는 Preview만**(Production·Development에는 넣지 않는다). Sensitive는 위 표시 4개(`SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ITEM_WORKER_SECRET`).
- [ ] **`NEXT_PUBLIC_*`는 빌드 때 번들에 고정**된다 → 값을 바꾸면 재배포가 필요하다. 변수를 **먼저** 넣고 나서 Preview를 빌드한다(이 저장소가 Vercel에 연결돼 있으면 feature 브랜치 푸시마다 Preview 빌드가 자동 생성된다 — 변수 없이 빌드된 Preview는 오동작하므로 무시하고 다시 배포. 연결 여부는 이 환경에서 확인하지 못했다).
- [ ] **Deployment Protection은 유지한다**: Preview 기본값(Vercel 로그인 필요)을 끄지 않고 공개 링크로 열지 않는다. Preview의 접근 제한은 이 보호가 담당한다(AI 비용 제한 현황은 §5).
- [ ] 함수 실행 시간: `item-generation`은 `maxDuration=180`, `chat`·`transcribe`·`vocab-growth`·`item-extract`는 60이다. **Vercel 플랜의 함수 최대 실행 시간 한도를 확인**한다(한도를 넘으면 배포 또는 실행에서 실패할 수 있다 — 이 환경에서는 확인 못 함).
- [ ] 빌드: `npm run build`(로컬 통과). `vercel.json` 없음(기본 설정).
- [x] AI 제공자 콘솔의 **월 사용금액 한도**: OpenAI·Anthropic 각각 **이미 설정돼 있다**(담당자 확인 사항 — 이 저장소·환경에서는 검증하지 못함). 스모크 1회에 두 업체 호출이 여러 번 생기므로 알림 설정 여부만 확인.

## 3. Supabase·DB 사전 조건 (이미 충족 — 배포 직전 재확인만)
- [x] 마이그레이션 1094 적용, 공용 시드 15종 적용(§14-7·§14-8·§14-10).
- [x] Anonymous Sign-Ins **켜짐**, CAPTCHA **꺼짐**(켜지 않는다).
- [ ] 익명 로그인 레이트리밋(브라우저 IP당 시간당 30회, §1-1): 같은 사무실 IP에서 여러 명이 스모크를 하면 소진될 수 있다 → 테스트 인원·횟수를 제한.
- [ ] 스모크가 남기는 것: 익명 계정, 체크인·아이템·개인 섬·배치·자산(봉인 트리거로 지워지지 않는 잔재). 반복 실행을 피한다.

## 4. Preview 배포 후 브라우저 A/B 스모크 테스트 (10개)
준비: **A = 시크릿 창(또는 크롬 프로필 1)**, **B = 다른 브라우저 또는 다른 프로필**. 둘 다 Vercel Preview 로그인이 필요하다. 고유 문장을 미리 정한다(A: `A-마커-0921`, B: `B-마커-0921`).
1. **입장**: A로 Preview `/checkin` 접속 → 자동으로 `/demo-init`을 거쳐 체크인 화면이 뜬다(로그인 화면 없음). B도 동일. (Supabase Users에 익명 계정 2개 생성 확인)
2. **공용 섬 동일**: A·B 모두 섬 화면에서 **공용 15종의 모양·위치가 같다**. 공용 아이템은 옮기거나 지울 수 없다.
3. **A 체크인 완료 → 아이템**: A가 발화에 `A-마커`를 넣어 체크인을 끝내면 "아이템 생성 중…" 뒤 아이템이 나오고 섬에 놓을 수 있다. 새로고침해도 A의 아이템이 **그 자리에 남는다**(서버 저장).
4. **B 격리**: B의 섬에는 **A의 아이템이 없다**. B도 자기 체크인·아이템을 만들고 **A와 같은 자리에도 놓을 수 있다**.
5. **누적**: A가 하교(두 번째) 체크인 아이템을 놓으면 A 섬에 **내 아이템 2개 + 공용 15개**, B에는 여전히 A 것이 없다.
6. **교사 화면 격리**: A의 발화(`A-마커`)가 B의 교사 화면(학생 상세·관찰일지·대시보드)에는 **안 보이고**, A 자신의 화면에는 보인다. 대조군: 공용 시드 문장(예: `2026-09-10`의 "발표 잘했어요")은 A·B 모두에게 보인다.
7. **상담 신청 격리**: A가 상담을 신청하면 A의 `/consultation`·대시보드 브리핑에는 뜨고 B에는 안 뜬다(main 병합으로 새로 들어온 조회의 격리 확인).
8. **응답 위생**: A의 브라우저 개발자 도구 Network에서 `/api/island` 응답에 `name`·모양·좌표·`locked` 외의 정보(세션 id·job·발화 문구)가 **없다**.
9. **개발용 경로 차단**: `/api/dev/login`, `/api/dev/reset-today`, `/api/dev/demo-island-preview`가 **404**다(`NODE_ENV=production`, `DEMO_ISLAND_PREVIEW` 미설정). 참고: `/item-lab/*` 화면은 프로덕션 빌드에서도 열린다(저장 API는 404라 동작하지 않는 개발용 화면). Preview에서는 Deployment Protection 아래 **내부 확인 용도로만** 쓴다. **Production 공개 전 필수 인계 항목은 §6.**
10. **재입장**: A의 쿠키를 지우고(또는 새 시크릿 창) 다시 들어오면 **새 익명 계정**이라 이전 개인 아이템은 안 보이고 공용 15종만 보인다. (이 단계가 익명 계정을 늘리므로 마지막에 한 번만)

통과 기준: 1~10 전부 예상대로. 하나라도 어긋나면 **즉시 중단**하고 `DEMO_LOCKDOWN=true`(비상 정지)로 데이터 경로를 닫은 뒤 원인을 확인한다.

## 5. AI 비용 제한 현황 (코드·DB로 확인한 사실, 2026-09-20)
**한 문장 요약(정정본)**: 앱은 **협진 챗봇(`/api/ai/teacher-agent`) 호출만** **방문자별(익명 세션 uid, 세션을 못 읽으면 IP)로 시간당 30회**로 제한한다. **그 외 AI 경로에는 앱 수준 호출 제한이 없다.** OpenAI·Anthropic 콘솔에는 각각 월 사용금액 한도가 설정돼 있다. 앱 내부에는 **두 업체의 비용을 합산하는 월간 통합 금액 상한이 없으며**(이번 Preview 범위에서 구현하지 않음), Preview는 **Vercel Deployment Protection**으로 접근을 제한한다.

| 계층 | 상태 | 근거 |
|---|---|---|
| 앱: 시간당 30회 | **`teacher-agent`(협진 챗봇) 한 경로에만**, **방문자별** — 프로젝트 전체 한도가 아님 | `src/app/api/ai/teacher-agent/route.ts`: `checkAndIncrementRateLimit(subject, { windowSeconds: 3600, maxCalls: 30 })`. subject = `user:<auth.uid>`(익명 방문자 포함), 세션이 없으면 `ip:<x-forwarded-for>`. `lib/ai/rateLimit.ts`를 쓰는 곳은 이 라우트 하나뿐 |
| DB 카운터 | 주체(subject)별 행 하나씩 세는 원자적 카운터 — 전체 합계를 세지 않는다 | `ai_rate_limits(subject pk, window_start, count)` + `increment_ai_rate_limit()`(1091). 실행 권한은 service_role만(anon·authenticated는 false — 2026-09-20 공유 DB에서 확인). 초과 시 429, 확인 실패 시 502(fail-closed). 조회 시점 `ai_rate_limits` 0행(이 제한 경로가 아직 사용된 적 없음) |
| 앱: 그 외 AI 경로 | **호출 제한 없음** — 학생 대화(`/api/ai/chat`)·음성 전사(`transcribe`)·아이템 생성(`item-generation`)·일일 분석·코멘트 초안·어휘 성장(`vocab-growth`)·`item-extract` | 위 경로들은 `rateLimit.ts`를 부르지 않는다(`docs/데모_방문자_격리_적용_절차.md` §11 표). 아이템 생성은 세션당 job 1개지만 체크인 세션 수에는 제한이 없다 |
| 우회 가능성 | 방문자별 키라서 쿠키를 지우면 새 익명 uid가 생겨 카운터가 새로 시작된다(IP 키는 세션을 못 읽을 때만 쓰임). 그래서 **방문자별 한도만으로는 총 비용을 못 막는다** | `docs/데모_방문자_격리_적용_절차.md` §11 |
| 공급자 콘솔 | OpenAI·Anthropic **각각 월 사용금액 한도 설정됨**(담당자 확인 — 이 환경에서 검증 불가). 두 업체를 합산한 한도는 아님 | — |
| 앱 내부 통합 금액 상한 | **없음.** 두 업체 비용을 합산하는 월간 통합 금액 제한은 코드에 없고 **이번 Preview 범위에서 추가 구현하지 않는다** | — |
| Preview 접근 제한 | **Vercel Deployment Protection 유지**(끄지 않는다, 공개 링크로 열지 않는다) | §2 |

**Production 공개 전 후속 검토 항목(이번에는 구현하지 않음)**
- **프로젝트 전체 일일 호출 상한**: 현재 30회/시간은 방문자별이라 총량이 아니다. Production 공개 전에 `docs/데모_방문자_격리_적용_절차.md` §11 제안(3단: 방문자·IP·전체 일일 총량, `AI_DAILY_MAX_<ROUTE>` 환경변수)을 검토한다.
- `teacher-agent` 외 AI 경로(대화·전사·아이템 생성·분석·어휘)의 방문자/IP 호출 제한과 한 요청당 처리량(예: 어휘 성장의 한 요청 12세션) 제한.
- 두 업체 비용을 합산하는 통합 월간 금액 상한(앱 내부 계산 또는 외부 모니터링).
- 총량 소진 시 우아한 저하(고정 응답·캐시·목업)와 화면 안내.

## 6. Production 배포 담당자에게 넘길 필수 인계 항목 — `/item-lab/*` (이번 Preview 범위에서는 구현하지 않음)
- **현황**: `/item-lab`, `/item-lab/pipeline`, `/item-lab/village`, `/item-lab/wait`, `/item-lab/minjun-island`, `/item-lab/demo-island-preview` 페이지는 **프로덕션 빌드에서도 열린다**(정적 페이지로 빌드됨, 인증·환경 게이트 없음). 저장 등 서버 동작은 `/api/dev/*`가 `NODE_ENV=production`에서 404라 동작하지 않지만, 개발용 화면 자체가 외부에 노출된다.
- **이번 Vercel Preview**: Deployment Protection 아래에서만, **내부 확인 용도**로만 사용한다.
- **필수 조치(Production을 외부에 공개하기 전)**: `/item-lab/*`를 **404 처리하거나 인증/접근 제한**한다(예: 프로덕션에서 `notFound()`, 또는 `proxy.ts` 게이트). **Production 담당자가 반드시 수행해야 하는 필수 인계 항목이며, 이번 작업에서는 코드를 바꾸지 않았다.**
- **`DEMO_ISLAND_PREVIEW` 환경변수는 Vercel(Preview·Production 모두)에 설정하지 않는다**(§1-D 원칙 유지). 설정하면 프로덕션 빌드에서도 `/api/dev/demo-island-preview`가 열린다.

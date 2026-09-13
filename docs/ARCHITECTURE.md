# 폴더 구조 & 담당 매핑

기술 스택: Next.js(App Router) + TypeScript + Tailwind / Supabase(Postgres+Auth+Realtime) / OpenAI API(서버에서만 호출) / SVG·CSS 섬(추후 Three.js 검토) / Vercel + Supabase Cloud 배포.

DB 테이블 설계와 담당자별 테이블 경계는 `docs/planning/살핌_DB_스키마_v0.3.md` §13이 원본이다. 이 문서의 담당 매핑은 "화면" 기준, 그 문서는 "테이블" 기준이라 대부분 일치하지만 2곳은 다르다(아래 API 목록에 표시) — **테이블 쓰기는 항상 DB 문서 기준을 따르고, UI가 다른 사람 화면에 있으면 그 UI는 API route를 fetch로만 호출한다(그 사람의 lib/supabase 파일을 직접 import하지 않는다).**

## 담당

| 담당 | 영역 |
|---|---|
| 이유민 | 학생 화면 — 섬 제외 전체 (교사 코멘트 확인, 색 선택, AI 대화(녹음 기반), 아이템 생성) |
| 강윤지 | 학생 화면 — 섬 배치 |
| 진승혜 | 교사 화면 — 대시보드 |
| 이지현 | 교사 화면 — 선생님 agent (모든 교사 화면에 뜨는 전역 챗봇) |
| 김현우 | 교사 화면 — 아이 상세 / 학생관찰일지 / 학부모상담기록 |

## 폴더 구조

```
src/
  app/
    (student)/
      layout.tsx              # 디바이스 프레임 + progress-dots — 이유민
      checkin/page.tsx        # 등교 5단계 조립 — 이유민 (5단계 섬만 강윤지 컴포넌트 호출)
      checkout/page.tsx       # 하교 3단계 조립 — 이유민
    (teacher)/
      layout.tsx              # 소유자 없음(조립만) — TabNav/TeacherAgentWidget을 배치만 함, 거의 안 고침
      dashboard/page.tsx      # 진승혜
      students/page.tsx       # 자리 배치도 — 김현우
      students/[id]/page.tsx  # 아이 상세 — 김현우
      observation/page.tsx    # 학생관찰일지 — 김현우
      consultation/page.tsx   # 학부모상담기록 — 김현우
    api/ai/
      transcribe/route.ts       # 이유민 — STT, 오디오는 처리 즉시 폐기 (저장 금지)
      chat/route.ts              # 이유민 — 꼬리질문/고정질문 대화
      item-extract/route.ts      # 이유민 — 발화 → 아이템
      comment-draft/route.ts     # 이유민 — 교사 코멘트 초안 (feedback_drafts 테이블 소유자 기준. UI는 김현우 화면, fetch로만 호출)
      daily-analysis/route.ts    # 이지현 — 아이 상세 AI 분석 (analysis_runs 테이블 소유자 기준. UI는 김현우 화면, fetch로만 호출)
      pattern-alert/route.ts     # 진승혜 — 패턴 경고 (규칙 기반, LLM 미사용)
      vocab-growth/route.ts      # 진승혜 — 감정 어휘 성장 집계
      teacher-agent/route.ts     # 이지현 — 협진 챗봇 (3 system prompt 병렬 → 합치기)

  components/
    student/          # 이유민 (TeacherComment/ColorPicker/ChatPanel/VoiceRecorder/ItemReveal
                       #        + mockScenarios.ts, useCheckinFlow.ts)
                       # + IslandBoard.tsx는 강윤지 (자기 파일 안에서 자체 드래그 state 관리, 훅 공유 안 함)
    teacher/
      TabNav.tsx       # 진승혜 (단독 소유 — layout.tsx에서 분리해둠)
      agent/           # 이지현
      dashboard/       # 진승혜 (컴포넌트 7개 + mockData.ts, 전부 이 폴더 안에서만 참조)
      students/        # 김현우 (컴포넌트 3개 + mockData.ts)
      observation/     # 김현우 (Board+Modal + mockData.ts)
      consultation/    # 김현우 (Board+Modal+DataExportBox + mockData.ts)
    shared/            # 전부 김현우 단독 소유 (ColorBadge, Modal, TagInput).
                       # 다른 사람은 import만, 구현 수정은 김현우에게 요청.
                       # (지금은 실제로도 김현우 자기 파일들에서만 쓰고 있어서 충돌 여지 없음)

  lib/
    supabase/
      client.ts / server.ts   # 브라우저용 / 서버용 클라이언트 (거의 안 바뀜)
      raw/                     # 원본(불변) insert — 도메인별 파일 분리, update/delete 금지
        signalCheckIn.ts        # 이유민
        observationLog.ts       # 김현우
        consultationLog.ts      # 김현우
        index.ts                 # 배럴 — export 한 줄만 추가
      interpretation/           # 해석/버전 데이터(코멘트, AI 분석) upsert — 도메인별 파일 분리
        teacherComment.ts        # 이유민 (feedback_drafts) — UI는 김현우 화면이지만 파일 소유는 이유민
        dailyAnalysis.ts         # 이지현 (analysis_runs) — UI는 김현우 화면이지만 파일 소유는 이지현
        index.ts
      queries/                   # 대시보드 집계 읽기 전용 쿼리 — 섹션별 파일 분리
        colorSummary.ts / morningBriefing.ts / relationshipMap.ts
        conflictLog.ts / classroomToday.ts     # 전부 진승혜
        index.ts
    openai/client.ts          # 서버에서만 import
    openai/prompts/           # system prompt는 route.ts에 인라인하지 말고 파일로 분리
    constants/colors.ts       # 이유민 (단독 소유) — 4색 신호등 "값"만, 타입은 types/signal.ts가 원본
    types/                    # 도메인별 파일 분리 (student.ts / signal.ts / teacherRecord.ts)
                              # + index.ts는 배럴(export만, 타입 직접 정의 금지)
    hooks/useVoiceRecorder.ts # 이유민

  styles/  # 프로토타입 CSS 이식본. "화면별로" 쪼개놨고, import도 그 화면의 page.tsx/컴포넌트에서만 한다
           # (레이아웃에는 공용 파일만 import) — 그래야 CSS 파일도 소유자가 1명씩 된다.
    prototype-student-shared.css    # 소유자 없음(공용, 거의 안 바뀜) — device-frame/status-bar/screen/btn 등 뼈대. (student)/layout.tsx에서 import
    prototype-student-chat.css      # 이유민 — s1~s4. checkin/checkout page.tsx에서 import
    prototype-student-island.css    # 강윤지 — s5. IslandBoard.tsx에서 import
    prototype-teacher-shared.css    # 소유자 없음(공용, 거의 안 바뀜) — 색 변수/헤더/탭바/card·chip·btn 등 프리미티브. (teacher)/layout.tsx에서 import
    prototype-teacher-dashboard.css # 진승혜 — dashboard/page.tsx에서 import
    prototype-teacher-students.css  # 김현우 — students/page.tsx, students/[id]/page.tsx에서 import
    prototype-teacher-board.css     # 김현우 — observation/page.tsx, consultation/page.tsx에서 import

supabase/
  migrations/        # DB 스키마 변경 이력
  seed.sql           # 개발용 시드 데이터

docs/
  planning/           # 기획 문서 원본 (PLANNING.md, 살핌_기획안.md, image.png)
  prototype/           # 프로토타입 HTML 원본 (마크업/애니메이션 참고용으로 남겨둔 것, 이미 src/로 이식 완료. 로직은 참고 안 함)
```

## 원칙

1. **AI 호출은 `app/api/ai/**`에서만.** 컴포넌트/클라이언트에서 OpenAI에 직접 fetch 금지.
2. **원본은 불변, 해석은 버전.** 등하교 대화, 관찰일지, 상담기록처럼 "기록"은 `lib/supabase/raw/*` 로만 쓰고 수정 API를 만들지 않는다. 교사 코멘트·AI 분석처럼 "해석"은 `lib/supabase/interpretation/*`로 upsert.
3. **음성은 저장하지 않는다.** `transcribe` 라우트는 오디오를 STT 처리 직후 폐기하고 텍스트만 반환/저장한다.
4. **선생님 agent는 레이어지 탭이 아니다.** `(teacher)/layout.tsx`에서 한 번만 마운트 — 각 탭 page에 중복으로 넣지 않는다.
5. **프로토타입 HTML(docs/prototype/)은 마크업·CSS만 참고.** vanilla JS 상태 전환 로직(getElementById 등)은 React state로 새로 짤 것, 그대로 옮기지 않는다.

## 충돌 방지 규칙 (바이브코딩 5인 동시 작업 전제)

바이브코딩은 한 번에 큰 덩어리를 갈아엎기 때문에, "여러 명이 같은 파일을 고치는 상황"이 제일 위험하다. 그래서 위 구조는 **파일 단위로 소유자가 1명**이 되도록 쪼개놨다. 이걸 지키는 게 핵심.

1. **내 폴더 밖은 import만, 구현 수정 금지.** 다른 사람 파일의 동작을 바꿔야 할 일이 생기면 먼저 그 사람한테 얘기하고 고친다. AI에게 "이 프로젝트 전체를 봐서 고쳐줘" 식으로 시키면 남의 파일까지 갈아엎을 수 있으니, 프롬프트에 "내 담당 폴더(`src/components/student/**`, `src/app/api/ai/{chat,item-extract,transcribe}/**` 등)만 수정해"라고 항상 범위를 명시할 것.
2. **배럴 파일(`index.ts`)은 export 한 줄만 추가.** 새 함수/타입이 생기면 자기 담당 파일에 추가하고, 배럴에는 `export * from "./새파일"` 한 줄만 더한다. 배럴 안에 로직을 직접 넣지 않는다.
3. **루트 설정 파일은 손대기 전에 단톡 공지.** `app/layout.tsx`(루트), `globals.css`, `next.config.ts`, `tsconfig.json`, `package.json`, `(student)/layout.tsx`, `(teacher)/layout.tsx`, `styles/prototype-*-shared.css`는 여러 사람 코드가 다 걸쳐있는 파일이라, 고칠 일이 생기면 미리 말하고 바로 머지한다 (묵혀두면 충돌 커짐).
4. **패키지 설치(`npm install`)는 각자 브랜치에서.** `package.json`/`package-lock.json`이 동시에 바뀌면 lock 파일은 손으로 병합하지 말 것 — `package.json`만 병합하고 `npm install`을 다시 돌려서 lock을 재생성한다.
5. **브랜치 전략**: `feature/<이름>-<기능>` (예: `feature/yumin-chat-panel`) 브랜치에서 작업 → PR → main 머지. main에 바로 push 금지.
6. **작게, 자주 커밋/푸시.** 바이브코딩 세션 한 번 끝나면 바로 커밋하고 원격에 올릴 것 — 로컬에 며칠치 diff를 쌓아두면 충돌 해결이 훨씬 어려워진다.

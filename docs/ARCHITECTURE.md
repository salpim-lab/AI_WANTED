# 폴더 구조 & 담당 매핑

기술 스택: Next.js(App Router) + TypeScript + Tailwind / Supabase(Postgres+Auth+Realtime) / OpenAI API(서버에서만 호출) / SVG·CSS 섬(추후 Three.js 검토) / Vercel + Supabase Cloud 배포.

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
      layout.tsx              # 탭 네비게이션(진승혜) + TeacherAgentWidget 마운트(이지현)
      dashboard/page.tsx      # 진승혜
      students/page.tsx       # 자리 배치도 — 김현우
      students/[id]/page.tsx  # 아이 상세 — 김현우
      observation/page.tsx    # 학생관찰일지 — 김현우
      consultation/page.tsx   # 학부모상담기록 — 김현우
    api/ai/
      transcribe/route.ts       # 이유민 — STT, 오디오는 처리 즉시 폐기 (저장 금지)
      chat/route.ts              # 이유민 — 꼬리질문/고정질문 대화
      item-extract/route.ts      # 이유민 — 발화 → 아이템
      comment-draft/route.ts     # 김현우 — 교사 코멘트 초안
      daily-analysis/route.ts    # 김현우 — 아이 상세 AI 분석
      pattern-alert/route.ts     # 진승혜 — 패턴 경고 (규칙 기반, LLM 미사용)
      vocab-growth/route.ts      # 진승혜 — 감정 어휘 성장 집계
      teacher-agent/route.ts     # 이지현 — 협진 챗봇 (3 system prompt 병렬 → 합치기)

  components/
    student/          # 이유민 (TeacherComment/ColorPicker/ChatPanel/VoiceRecorder/ItemReveal)
                       # + IslandBoard.tsx는 강윤지
    teacher/
      agent/           # 이지현
      dashboard/       # 진승혜
      students/        # 김현우
      observation/     # 김현우
      consultation/    # 김현우
    shared/            # 공용 (ColorBadge, Modal, TagInput) — 초반에 담당 정하고 시작

  lib/
    supabase/
      client.ts / server.ts   # 브라우저용 / 서버용 클라이언트
      raw.ts                  # 원본(불변) insert 전용 — update/delete 넣지 말 것
      interpretation.ts       # 해석/버전 데이터(코멘트, AI 분석) upsert 전용
    openai/client.ts          # 서버에서만 import
    openai/prompts/           # system prompt는 route.ts에 인라인하지 말고 파일로 분리
    constants/colors.ts       # 4색 신호등 의미 — 색 관련 값은 항상 여기 참조
    types/                    # 도메인 타입 (Supabase 타입 생성되면 합류)
    hooks/useVoiceRecorder.ts # 이유민

supabase/
  migrations/        # DB 스키마 변경 이력
  seed.sql           # 개발용 시드 데이터

docs/
  planning/           # 기획 문서 원본 (PLANNING.md, 살핌_기획안.md, image.png)
  prototype/           # 프로토타입 HTML (컴포넌트 이식 시 마크업/애니메이션 참고용, 로직은 참고 안 함)
```

## 원칙

1. **AI 호출은 `app/api/ai/**`에서만.** 컴포넌트/클라이언트에서 OpenAI에 직접 fetch 금지.
2. **원본은 불변, 해석은 버전.** 등하교 대화, 관찰일지, 상담기록처럼 "기록"은 `lib/supabase/raw.ts` 로만 쓰고 수정 API를 만들지 않는다. 교사 코멘트·AI 분석처럼 "해석"은 `interpretation.ts`로 upsert.
3. **음성은 저장하지 않는다.** `transcribe` 라우트는 오디오를 STT 처리 직후 폐기하고 텍스트만 반환/저장한다.
4. **선생님 agent는 레이어지 탭이 아니다.** `(teacher)/layout.tsx`에서 한 번만 마운트 — 각 탭 page에 중복으로 넣지 않는다.
5. **프로토타입 HTML(docs/prototype/)은 마크업·CSS만 참고.** vanilla JS 상태 전환 로직(getElementById 등)은 React state로 새로 짤 것, 그대로 옮기지 않는다.

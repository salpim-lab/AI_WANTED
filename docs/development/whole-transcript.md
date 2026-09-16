# 상담 전문 한 번 저장

새 상담은 `checkin_sessions.transcript` JSONB에 전체 대화를 한 번 저장한다.
배열 순서가 발화 순서이며 학생 발화와 AI 응답을 모두 포함한다.

```json
[
  { "speaker": "assistant", "content": "오늘은 어땠어?", "input_method": "fixed" },
  { "speaker": "student", "content": "고양이랑 놀았어요.", "input_method": "text" }
]
```

1. 상담 시작 시 기존 `checkin_sessions` 행을 생성한다.
2. 대화 중에는 메시지 배열을 유지한다. 메시지별 DB insert는 하지 않는다.
3. 서버에서 로그인 사용자, 상담 소유권·학급·동의를 검증한다.
4. `src/lib/supabase/raw/wholeTranscript.ts`의 `saveWholeTranscript(client, sessionId, messages, { status: "completed" })`를 호출한다.
5. 중단은 `{ status: "stopped", reason: "..." }`을 전달한다.
6. 반환된 세션 ID를 아이템 생성 단계로 전달한다.
7. 아이템 생성 서버에서 `readWholeTranscript(client, sessionId)`로 전문을 조회한다.

전문 저장·종료 상태·완료 시각은 하나의 DB update로 적용된다.
동일한 종료 요청의 재시도는 허용하고 다른 전문으로 덮어쓰기는 거부한다.
저장 후 전문은 DB 트리거가 수정·삭제를 막는다.
`[]`는 대화 없는 종료이며 `NULL`은 전문 미저장 또는 이전 세션이다.

현재 쓰기는 서버 검증 뒤 admin client로 수행한다. 브라우저에 secret key를 전달하지 않는다.
로그인/RLS 클라이언트의 읽기는 기존 세션 읽기 정책을 그대로 적용한다.

기존 `conversation_messages`는 기록과 외래키 호환을 위해 유지한다.
마이그레이션이 기존 메시지를 세션별·순서별로 전문에 모은다.
새 상담을 메시지별 조회하는 기존 소비자는 `readWholeTranscript`로 전환해야 한다.
`src/app/api/checkins/transcript` POST가 로그인 학생의 세션 소유권을 확인한 뒤 저장 함수를 호출한다. 요청 형식은 `{ session_id, transcript, status: "completed" | "stopped", reason? }`이다. 상담 화면은 이 API를 상담이 끝났다고 판단한 한 지점에서 호출하면 된다.

어떤 버튼 또는 자동 전환을 상담 종료로 볼지는 아직 결정하지 않았다. 현재 mock 화면에는 자동으로 다음 단계로 넘어가는 경로와 `배치 종료`가 섞여 있으므로, 상담 UI 작업이 끝난 뒤 실제 종료 이벤트를 확정한다. 그 전까지 이 API를 임의의 버튼에 연결하지 않는다.
완료 전 브라우저 종료 시 대화 복구 기능은 이번 변경에 포함하지 않는다.

DB migration: `20260916100000_1060_whole_transcript.sql`.

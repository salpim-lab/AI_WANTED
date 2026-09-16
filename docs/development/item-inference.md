# 상담에서 아이템 추론

프롬프트: `src/lib/openai/prompts/item-inference.ts`.
AI 호출: `src/lib/openai/inferItem.ts`.
결과 규격·검증: `src/lib/items/itemInference.ts`.

상담 전문 저장 성공 후 로그인된 학생 브라우저에서 호출한다.

```ts
const response = await fetch('/api/ai/item-extract', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session_id: savedSessionId }),
});
const result = await response.json();
if (!response.ok) {
  // result.code에 따라 설정 필요, 재시도, 상담 저장 대기를 표시한다.
} else {
  // result.inference를 다음 3D 설계 단계로 전달한다.
}
```

성공 응답: `{ session_id, promptVersion, inference }`.
`inference`에는 coreExperience, evidence, itemName, subject,
selectionReason, studentMessage, sizeClass, appearance가 있다.
소재 목록과 특정 아이템 예시는 프롬프트에 없다. 크기 분류는 소재 선택을 제한하지 않는다.
이 응답은 3D 도형 명세가 아니며, 현재 단계는 DB에 추론 결과를 저장하거나 아이템을 지급하지 않는다.
다음 3D 설계·검증·지급 단계 및 상담 화면의 호출은 별도로 연결해야 한다.

키를 받으면 `.env.local`의 `OPENAI_API_KEY`를 설정하고 개발 서버를 재시작한다.
배포 환경은 해당 서버 환경변수에 설정한다. 브라우저 코드에 키를 넣지 않는다.
모델 기본값은 `gpt-4.1-mini`이며 `OPENAI_ITEM_MODEL`로 변경할 수 있다.
이 모델 선택은 실측 전 초기 설정이며, 사용할 키의 모델 접근 권한과 실제 품질을 확인해야 한다.

서버는 로그인, 상담 소유권, 기존 보호자 동의·학교 승인, 전문 저장 상태를 확인한다.
RLS 클라이언트를 사용하며 admin key로 학생 접근 제한을 우회하지 않는다.
키가 없으면 `503 AI_NOT_CONFIGURED`를 반환하고 대체 아이템을 만들지 않는다.
학생 발화가 없으면 `422 INSUFFICIENT_TRANSCRIPT`를 반환한다.
다른 주요 오류: 400 INVALID_REQUEST, 401 UNAUTHORIZED, 403 CONSENT_REQUIRED,
409 TRANSCRIPT_NOT_READY, 429 AI_REQUEST_FAILED, 502 INVALID_AI_OUTPUT, 504 AI_UNAVAILABLE.
입력은 현재 30,000자 제한, 호출 제한 시간은 45초, 자동 재시도는 없다.
키가 없으므로 실제 AI 품질·속도는 아직 검증하지 않았다.

OpenAI Responses API의 strict JSON Schema 출력과 `store: false`를 사용한다.
형식 검사와 별도로 근거 인용이 실제 학생 발화에 포함되는지 검증한다.
API 사용 규격은 [OpenAI 공식 Structured Outputs 안내](https://developers.openai.com/api/docs/guides/structured-outputs)를 참고했다.
동시 중복 요청 억제, 비용 제한, 생성 작업 큐는 다음 운영 단계에서 별도로 정해야 한다.

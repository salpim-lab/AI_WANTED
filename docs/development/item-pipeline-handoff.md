# 상담 기반 신규 3D 아이템: 다음 세션 인계

2026-09-17 기준. 이 문서부터 읽고 이어간다. 사용자는 API 키 연결을 다음으로 미뤘고, 신규 외관 확인은 생략했다. 각 다음 단계는 설명하고 논의한 뒤 진행한다. 이번 승인 범위인 1번 조립 호출 준비는 완료했다.

## 목표와 합의

학생·AI 상담 → 전문 전체 저장 → 핵심 경험과 소재 추론 → 도형 조립 JSON → Three.js 렌더링 → 학생 소유 아이템 저장·휴대·배치.

강윤지 담당은 상담 내용에서 소재 추론 및 아이템 제작이다. 유민님은 상담 종료 시 전문 저장과 후속 호출을 연결해야 한다. 상담 프런트 실제 연결은 아직 필요하다.

210개 사전 아이템 검색 구조가 아니라 매번 새 설계를 만든다. 소재 선택 목록과 고양이·깃발 예시는 프롬프트에 넣지 않는다. 작은 소재를 우선하되 큰 대상 자체가 핵심이면 허용한다. 소재별 상대 크기는 다르게 하고 개인별 대형 아이템 할당 제한은 없다. 사용자는 마을 확대를 원하지 않는다. 기존 마을 크기 실험의 상한은 통합 전에 확인한다.

도형은 넉넉하게 제공하고 추가 가능하다. 조립 명령 30개 / 대칭·반복 확장 후 부품 60개다. 속이 빈 용기도 구현했다. 중간 소재 추론을 별도 DB에 저장할 필요는 없다. 최종 설계 JSON과 설명·크기는 재접속 복원을 위해 저장해야 한다. 부품마다 DB 행을 만들지 않는다.

## 구현된 부분

- `src/lib/supabase/raw/wholeTranscript.ts`: 전문 전체 저장·읽기. checkin_sessions.transcript JSONB 마이그레이션은 적용 완료. 기존 conversation_messages는 보존했다. 상세는 whole-transcript.md.
- `src/app/api/ai/item-extract/route.ts`: POST `{session_id}`. 본인 상담, 저장 상태, 기존 동의 조건을 확인하고 소재 추론 JSON만 반환한다. 조립·저장·지급은 하지 않는다.
- `src/lib/openai/inferItem.ts`: 소재 AI 호출. `src/lib/openai/prompts/item-inference.ts`와 `src/lib/items/itemInference.ts`에 프롬프트·스키마·실제 학생 인용 검증. 상세는 item-inference.md.
- `src/lib/openai/assembleItem.ts`: 조립 서버 함수 assembleItem(inference), 요청 생성 buildItemAssemblyRequest. 실제 AI에는 itemName/subject/appearance만 보내고 전문·인용은 재전달하지 않는다.
- `src/lib/openai/prompts/item-assembly.ts`: 자유 소재를 정해진 도형으로 조립하는 프롬프트와 카탈로그.
- `src/lib/items/itemAssembly.ts`: 도형별 Structured Outputs 스키마, 엄격한 필드 검사 및 parseLabItem 연결. 이름도 추론 결과와 같아야 한다.
- `src/lib/items/assembledItem.ts`, `itemShapes.ts`, `extrudedItem.ts`: JSON 검증·Three.js 제작·정규화·해제. 속이 빈 용기는 내벽과 바닥을 가진 회전체다. 임의 도형 간 Boolean 차집합은 없다.
- `/item-lab`: 수동 JSON 실험실. docs/development/examples/mug.json은 수동 테스트 설계이며 AI 출력이나 프롬프트 예시가 아니다.
- `/item-lab/village`: 기존 마을의 크기·배치 용량 실험. 실제 소유·휴대·배치 파이프라인과 신규 JSON 제작기는 아직 연결되지 않았다.
- `scripts/test-item-assembly.cjs`: `node scripts/test-item-assembly.cjs`로 오프라인 검사 재실행. 실제 환경 변수와 네트워크를 사용하지 않는다.

## API 연결 위치와 출력 규격

키는 OPENAI_API_KEY를 .env.local 또는 배포 서버 환경 변수에 등록한 뒤 서버 재시작한다. 실제 .env.local은 이번에 변경하지 않았다. 비밀을 저장소·문서·프런트엔드에 넣지 않는다.

소재 모델: OPENAI_ITEM_MODEL 또는 gpt-4.1-mini.
조립 모델: OPENAI_ITEM_ASSEMBLY_MODEL → OPENAI_ITEM_MODEL → gpt-4.1-mini.

assembleItem은 준비됐지만 기존 라우트나 생성 작업에서 호출하지 않는다. 키만 등록해도 전체 파이프라인이 실행되는 상태는 아니다. 다음 생성 작업에서 inferItem의 결과를 assembleItem에 전달해야 한다.

API strict JSON은 mirror/repeat가 모든 부품에 필수이며 미사용은 null이다. 각뿔 sides도 필수다. 검증 후 null 선택 필드를 제작기용 undefined로 바꾼다. 기존 수동 예제는 생략이 가능하므로 parseLabItem에는 계속 사용 가능하지만 그대로 parseItemAssembly에 넣을 수는 없다.

스키마는 17개 도형 키다. 이전 대화의 도형 개수와 차이가 나는 것은 둥근 상자와 각뿔 종류 등이 파라미터 변형으로 합쳐졌기 때문이다. 키·스키마 대응은 타입과 오프라인 검사로 확인한다. 새 도형은 제작기·파서·카탈로그·스키마를 함께 확장한다.

조립 함수는 자동 재시도·형태 교정·DB 기록을 하지 않는다. 오류: AI_NOT_CONFIGURED(503), INVALID_ASSEMBLY_INPUT(422), ASSEMBLY_UNAVAILABLE(504), ASSEMBLY_REQUEST_FAILED(429/502), INVALID_ASSEMBLY_OUTPUT(502). 제한 시간 60초와 출력 토큰 상한 12000은 실측 전 설정이다.

## 다음으로 할 일: 2번부터 사용자와 논의

1번 조립 호출 준비는 완료했다. 다시 구현하지 않는다.

생성 실패 시에만 고정 대체 아이템을 지급하고, 제한된 백그라운드 재시도로 완성되면 같은 자리에서 교체한다는 정책을 `item-generation-jobs.md`에 정리했다. 작업당 AI 시도는 2회다. 무한 재시도나 무기한 선물 상자는 사용하지 않는다. `20260917110000_1070_item_generation_jobs.sql`로 작업 상태·시도 횟수·fallback/generated 참조와 RLS를 추가했지만, 아직 Supabase 적용과 작업 실행기 연결은 하지 않았다.

2. 생성 작업 관리: 기존 상담 완료·아이템 지급 흐름과 DB 정책을 먼저 확인한다. 생성 중·완료·실패 상태 저장 위치, 한 상담당 지급 횟수, 중복 생성 방지와 재시도 규칙을 논의한다. 배포 환경에서 계속 실행 가능한 작업 방식을 결정한다. 큐/별도 워커 필요성은 배포 환경을 확인한 뒤 판단한다. 프로세스 재시작 시 중간 단계 재개가 필요한지도 정한다.
3. 최종 저장·지급: 기존 student_items → asset_catalog 관계와 지급 규칙을 확인하고 JSON·이름·설명·크기 저장 구조를 논의한다. 현재 student_items에 조립 JSON 필드는 없다. 동일 지급의 DB 차원 중복 방지가 필요하다.
4. 실제 마을: 저장 JSON 렌더링, 휴대와 배치 크기, 포인터 영역, 위치 저장·재접속 복원을 연결한다.
5. 키 등록 후 실제 테스트: 스키마 수용·형태 품질·응답 시간·실패를 확인하고 프롬프트와 한도를 조정한다. 스키마만으로 접합·의미 반영 품질을 보장하지 않는다.

예상 실행 흐름: 전문 저장 완료 → 생성 작업 접수 → inferItem(transcript) → assembleItem(inference) → 최종 결과 저장 → 화면에서 완료 상태 조회.

기존 item-extract 라우트 maxDuration은 60초, 소재 호출 제한은 45초, 조립 호출 제한은 60초다. 두 호출을 기존 요청에 단순 직렬로 붙이면 요청 상한을 넘을 수 있다. 응답 뒤 프로세스 안에서 무보장 실행하는 방식은 피하고 배포 환경의 작업 보장 방식을 정한다. 두 함수 연결과 작업 상태·최종 저장은 아직 구현하지 않았다.

## 검증과 제한

타입·린트, 가짜 소재 AI 응답, 도형 생성·컵 내부 레이 검사·기존 샘플 호환성, 17개 조립 스키마 분기, 누락/추가 필드·잘못된 도형/이름/벽 두께/좌표/ID/부품 한도, 입력 정보 최소화, 가짜 조립 API 성공·거절·불완전 출력·429·통신 실패를 확인했다.

실제 AI 요청은 하지 않았다. 실제 모델의 스키마 수용·출력 품질·신규 도형 브라우저 외관은 미검증이다. 관련 상세 문서는 whole-transcript.md, item-inference.md, item-assembly.md.

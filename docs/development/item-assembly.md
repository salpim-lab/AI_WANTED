# 추론 결과 → 3D 조립 JSON

## 이번 단계

`src/lib/openai/prompts/item-assembly.ts`에 도형 목록과 조립 프롬프트를 저장했다. 입력은 앞 단계의 `ItemInference`다. 상담 전문을 다시 전달하지 않는다. 대상과 의미를 다시 고르지 않고 `subject`, `appearance`, `itemName`을 실제 입체 부품으로 변환한다.

출력은 기존 제작기의 `{version:1,name,parts}`다. `parseLabItem`으로 검증하고 `createLabItem`으로 생성한다. `sizeClass`와 학생 설명은 추론 결과에 남기고, 실제 마을 크기 적용과 최종 저장 단계에서 설계 JSON과 함께 사용한다. 중간 DB 변경은 없다.

도형 이름은 프롬프트의 `ITEM_SHAPE_CATALOG`를 따른다. 둥근 상자는 `box.roundness`, 삼각뿔·사각뿔·다각뿔은 `pyramid.sides`처럼 같은 제작기에 설정을 달리한다. 이후 추가 도형은 제작기, 파서, 프롬프트 목록을 함께 확장한다.

각 부품의 공통 값은 `id`, `shape`, `position`, `rotation`, `color`다. 도형별 값과 선택적 `mirror:"x"`, `repeat:{count,step}`를 더한다. 반복 횟수는 원본 포함, 이동 후 X 대칭 순서다. 명령 최대 30개, 확장 부품 최대 60개다.

Y 위, +Z 정면, XYZ 라디안 회전이다. 로컬 도형을 회전한 후 이동한다. 완성품은 가장 긴 축 1과 바닥 y=0으로 정규화한다. 각뿔은 밑면, 반구는 평평한 바닥이 로컬 y=0이며 나머지 기본 도형은 중심 원점이다. 윤곽과 곡선은 점 배열이 로컬 위치를 정한다.

## 속이 빈 머그컵 확인

`examples/mug.json`은 AI 출력이 아니라 제작기 검증용 수동 설계다. `/item-lab`의 JSON 입력에 붙여 넣어 확인할 수 있다. 추론·제작 프롬프트에는 특정 아이템 예시를 넣지 않았다.

`hollowContainer`는 회전체로 외벽, 윗 테두리, 내벽, 내부 바닥, 외부 바닥을 만든다. 윗면을 막는 판은 없다. 바닥 두께 0이면 관이다. 손잡이는 양 끝이 닫힌 `torusArc`로 벽과 겹쳐 붙인다. 일반적인 임의 도형 간 차집합이나 복잡한 손잡이 구멍을 자동으로 뚫는 기능은 아니다.

타입·린트와 실제 지오메트리 생성 검사를 진행했다. 컵 중앙 위쪽에서 레이를 내려 내부 바닥에 닿는지, 확장 도형의 좌표가 유한한지, 정규화 바닥 위치, 60개 반복·대칭 한도, 기존 고양이·깃발 호환성을 검사했다. AI 출력 품질과 브라우저에서의 이번 신규 도형 외관은 아직 검증하지 않았다.

## 다음 연결 단계

이번에는 조립 규격, 프롬프트와 Three.js 제작기를 준비했다. 아직 AI 조립 API를 연결하거나 `/api/ai/item-extract`의 반환 동작을 변경하지 않았다. API 연결 시 도형별 Structured Outputs 스키마를 추가하고, 반환값에 `parseLabItem`을 적용해야 한다. 이후 최종 아이템 저장과 마을 배치 연결은 별도 단계다.

## 갱신: 2026-09-17 조립 호출 준비 완료

위의 다음 연결 단계 중 AI 호출 함수와 도형별 스키마 준비는 완료했다. `src/lib/openai/assembleItem.ts`의 assembleItem(inference)가 서버 API를 호출하고, `src/lib/items/itemAssembly.ts`의 parseItemAssembly가 엄격한 출력 형식과 parseLabItem의 제작 제약을 검사한다. 실제 요청에는 itemName/subject/appearance만 전달한다.

API strict 출력에서는 모든 부품의 mirror/repeat가 필수이며 미사용은 null이다. 각뿔 sides도 필수다. 검증 후 기존 제작기에 맞게 선택 필드를 정규화한다. 모델 선택은 OPENAI_ITEM_ASSEMBLY_MODEL → OPENAI_ITEM_MODEL → gpt-4.1-mini다. 키 설정은 OPENAI_API_KEY를 서버 환경 변수에 등록하고 서버를 재시작한다.

오프라인 테스트: `node scripts/test-item-assembly.cjs`. 타입·린트와 가짜 성공·실패 응답 검사를 완료했다. 실제 API 요청은 하지 않았다. 기존 item-extract 라우트는 소재 추론만 수행하며 조립 호출을 아직 연결하지 않았다.

다음은 생성 상태·중복 방지·배포 환경의 작업 실행 구조를 논의하는 단계다. 최신 상세 상태와 다음 작업은 item-pipeline-handoff.md의 2026-09-17 갱신을 우선한다.

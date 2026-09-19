# 브랜드 이미지

## 지금 쓰는 배경 (2026-09-19 정리)

| 파일 | 쓰는 곳 |
|---|---|
| `checkin_home2.webp` | **등교 배경은 이것 하나만 쓴다.** 등교 홈, 첫 페이지(`landing.css`), 교사 화면 뒤 흐린 배경(`SalpimBackdrop`) |
| `checkout_home-배경만.webp` | 하교 홈 (노을 버전) |

> 예전 등교 배경 `checkin_home-배경만.webp` 는 지웠다. 화면마다 다른 버전을 쓰고 있어서
> 하나로 맞췄다. 새 화면에서 등교 배경이 필요하면 `/brand/checkin_home2.webp` 를 쓴다.

---

아래는 처음 에셋을 준비할 때의 계획 메모다(파일 이름은 그 뒤 바뀌었다).

첫 화면(등·하교)에 쓰는 이미지를 여기에 넣는다. Next.js 는 `public/` 만 URL 로 서빙하므로
저장소 루트의 `assets/`(강윤지님 3D 작업 공간)가 아니라 반드시 여기여야 한다.

## 넣을 파일 3장

| 파일 | 내용 | 비율 | 투명 |
|---|---|---|---|
| `scene-morning.webp` | 등교 배경 통짜 — 하늘·구름·언덕·학교·나무·마스코트·손글씨 | 4:3 (2048×1536 권장) | 불필요 |
| `scene-dusk.webp` | 하교 배경 통짜 — 위와 같은 구성의 노을 버전 | 4:3 | 불필요 |
| `envelope.webp` | 봉투만 | 자유 (너비 1200px 이상) | **필요** |

> 봉투만 따로 빼는 이유: 편지가 X 버튼으로 봉투 안에 접혀 들어가는 동작이 있어서
> 배경에 구워버리면 편지와 겹치는 위치를 맞출 수 없다.

## 배경에 구워도 되는 것 / 안 되는 것

**구워도 됨** — 하늘, 구름, 언덕, 학교, 나무, 덤불, 해, 마스코트,
손글씨 메모("오늘도 좋은 하루가 되길!", "오늘도 수고했어!")

**반드시 HTML 로 남겨야 함** — 안 바뀌는 게 아니라 바뀌기 때문이다.

- 제목 — 학생 이름이 들어간다
- 선생님 편지 본문 — DB 에서 온다
- CTA 버튼 — 눌려야 한다
- 학생 칩, 로고

## 생성 프롬프트

기존 목업 이미지를 그대로 재현하되 UI 만 빼면 된다. 끝에 다음을 붙인다.

```
no text, no UI elements, no buttons, no speech bubbles,
4:3 aspect ratio, full bleed scene
```

등교/하교 두 장의 **그림체·캐릭터·학교 모양이 같아야** 화면 전환이 자연스럽다.
한 번에 두 장을 요청하거나, 첫 장을 레퍼런스로 주고 두 번째를 만드는 편이 안전하다.

## 연결 방법

파일을 넣은 뒤 `checkin/page.tsx` 와 `checkout/page.tsx` 에서 prop 만 넘기면 된다.
컴포넌트 수정은 필요 없다.

```tsx
<StudentOpening
  active={flow.step === 1}
  period="morning"
  onNext={() => flow.goTo(2)}
  scenePlate={{ src: "/brand/scene-morning.webp", includesNotes: true }}
/>
```

- `scenePlate` 를 주면 SVG 풍경이 통째로 대체된다
- `includesNotes: true` 면 HTML 손글씨 메모가 꺼진다 (배경에 이미 있으므로)
- 마스코트도 배경에 포함되어 있으면 SVG 캐릭터가 자동으로 꺼진다

자세한 배경은 `docs/planning/ILLUSTRATION_PLAN.md` 참고.

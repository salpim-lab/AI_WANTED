// 담당: 김현우 (단독 소유) — 아이 상세 / 학생관찰일지 / 학부모상담기록 화면 공용 Tailwind 클래스 묶음.
// 프로토타입 CSS(prototype-teacher-{students,board}.css)를 Tailwind로 옮기면서 반복되던 조합을 모았다.
// 버튼(btn, btn-primary …)과 칩(chip-*)은 공용 prototype-teacher-shared.css 클래스를 그대로 쓴다.
// Tailwind가 클래스를 찾을 수 있도록 항상 완성된 문자열로 적는다 (템플릿 문자열로 클래스 이름을 조합하지 말 것).
//
// 톤: 살핌 학생 화면(student-home.css)의 팔레트·글꼴을 세 화면 전체에 쓴다.
//   남색 글자 #102a56 · 보조 글자 #7d849b · 보라 강조 #635bff / #8b83ff · 연보라 #ede9ff / #f5f3ff / #ded8ff
//   크림 편지지 #fdf9ef / #ece0c9 · 제목은 둥근 Jua(--font-cute), 본문은 Noto Sans KR(--font-sans-kr)
//   글꼴 변수는 app/layout.tsx가 <html>에 건다. 신호등 4색(signalStyles.ts)은 의미가 있는 색이라 그대로 둔다.

// ── 살핌 톤 기본 조각 ──────────────────────────────────────

/** 화면 바깥 틀 — 글꼴·기본 글자색 (배경 일러스트는 SalpimBackdrop) */
export const salpimScreen = "font-[family-name:var(--font-sans-kr)] text-[#102a56]";

/** 카드·섹션 제목 — 둥근 Jua */
export const salpimTitle = "font-[family-name:var(--font-cute)] font-normal tracking-[-0.2px] text-[#102a56]";

/** 반투명 흰 카드 — 배경 일러스트가 은은하게 비친다 */
export const salpimCard =
  "rounded-[26px] border border-white/80 bg-white/85 shadow-[0_2px_6px_rgba(16,42,86,.05),0_14px_36px_rgba(99,91,255,.10)] backdrop-blur-md";

/** 크림색 편지지 카드 — 선생님의 한마디 */
export const salpimPaperCard =
  "rounded-[26px] border border-[#ece0c9] bg-[#fdf9ef] shadow-[0_2px_6px_rgba(16,42,86,.05),0_14px_36px_rgba(185,178,245,.25)]";

/** 보조 글자 (학생 화면 --sh-muted) */
export const salpimMuted = "text-[#7d849b]";

/** 연보라 안쪽 상자 — AI 분석, 선택된 칸 배경 */
export const salpimSoftBox = "rounded-2xl border border-[#ded8ff] bg-[#f5f3ff]";

/** 두 개 중 하나 고르는 작은 토글 버튼 (선택/미선택) */
export const salpimToggleOn = "rounded-full bg-[#635bff] px-3 py-1 text-xs font-bold text-white shadow-sm";
export const salpimToggleOff = "rounded-full px-3 py-1 text-xs font-semibold text-[#7d849b] hover:text-[#102a56]";

/** 자리 배치도 바깥 카드 — salpimCard와 같은 모양이지만 반투명·흐림 없이 흰색 (배경 일러스트가 비치지 않게) */
export const seatChartCard =
  "rounded-[26px] border border-white/80 bg-white shadow-[0_2px_6px_rgba(16,42,86,.05),0_14px_36px_rgba(99,91,255,.10)]";

/** 자리 배치도 판(교실 바닥) — 보기·자리 바꾸기 편집기가 같이 쓴다 */
export const seatBoard = "rounded-[22px] border border-[#ece9fb] bg-white";

/** 넓은 화면 자리 칸 높이 — 얼굴 + 이름이 들어간다 */
export const seatCellHeight = "h-[76px]";

// ── 화면 공용 묶음 (위 톤으로) ────────────────────────────

export const pageContainer = "mx-auto max-w-[900px] px-6 py-5";

export const pageTitle = "font-[family-name:var(--font-cute)] text-[22px] font-normal tracking-[-0.3px] text-[#102a56]";

/** 게시판 화면(학생관찰일지·학부모상담기록) 바깥 틀 — 대시보드(.page-dashboard)와 같은 폭·여백이라 제목이 같은 자리에 온다. */
export const boardPageContainer = "mx-auto max-w-[1320px] px-[34px] pt-[30px] pb-11 max-[760px]:px-4 max-[760px]:pt-5 max-[760px]:pb-8";

/** 게시판 화면 제목 */
export const boardPageTitle =
  "m-0 font-[family-name:var(--font-cute)] text-[26px] font-normal tracking-[-0.3px] text-[#102a56]";

export const card = salpimCard;

/** 눌러서 여는 카드 — 올리면 살짝 뜨고 보라 테두리·그림자, 누르면 가라앉는다 */
export const clickableCard =
  "cursor-pointer transition duration-150 hover:-translate-y-0.5 hover:border-[#b9b2f5] hover:shadow-[0_10px_24px_rgba(99,91,255,.18)] active:translate-y-0 active:shadow-[0_4px_12px_rgba(99,91,255,.14)]";

export const fieldLabel = "mt-3.5 mb-1.5 block text-xs font-bold tracking-[0.5px] text-[#7d849b]";

export const textInput =
  "rounded-xl border-[1.5px] border-[#e6e2fb] bg-white/90 px-3 py-[7px] text-[13px] text-[#102a56] outline-none transition-colors focus:border-[#8b83ff]";

export const textArea =
  "w-full resize-none rounded-2xl border-[1.5px] border-[#e6e2fb] bg-white/90 px-3.5 py-2.5 text-[13px] leading-[1.7] text-[#102a56] outline-none transition-colors focus:border-[#8b83ff]";

export const timestampText = "font-mono text-[11px] text-[#7d849b]";

export const immutableBadge = "ml-auto rounded-full bg-[#f1efff] px-2 py-0.5 text-[10px] font-semibold text-[#7d849b]";

export const helperNote = "mt-2 flex items-center gap-1 text-[11px] text-[#7d849b]";

export const errorText = "mt-2 text-xs font-semibold text-red-600";

export const emptyState = "py-10 text-center text-[#7d849b]";

export const backButton =
  "inline-block rounded-full border-[1.5px] border-[#e6e2fb] bg-white/80 px-4 py-[7px] text-[13px] font-semibold text-[#7d849b] transition-colors hover:border-[#8b83ff] hover:text-[#635bff]";

/** 사용법: <label><input type="radio" className="peer sr-only" /><span className={choicePill}>…</span></label> */
export const choicePill =
  "inline-block cursor-pointer rounded-full border-[1.5px] border-[#e6e2fb] bg-white/80 px-3.5 py-[5px] text-xs font-semibold text-[#7d849b] transition-colors hover:border-[#8b83ff] hover:text-[#635bff] peer-checked:border-[#635bff] peer-checked:bg-[#ede9ff] peer-checked:text-[#3f37c9] peer-focus-visible:ring-2 peer-focus-visible:ring-[#b9b2f5]";

export const studentTagLink =
  "rounded-full bg-[#ede9ff] px-2 py-0.5 text-[11px] font-semibold text-[#3f37c9] transition-colors hover:bg-[#ded8ff]";

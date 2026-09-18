// 담당: 김현우 (단독 소유) — 아이 상세 / 학생관찰일지 / 학부모상담기록 화면 공용 Tailwind 클래스 묶음.
// 프로토타입 CSS(prototype-teacher-{students,board}.css)를 Tailwind로 옮기면서 반복되던 조합을 모았다.
// 버튼(btn, btn-primary …)과 칩(chip-*)은 공용 prototype-teacher-shared.css 클래스를 그대로 쓴다.
// Tailwind가 클래스를 찾을 수 있도록 항상 완성된 문자열로 적는다 (템플릿 문자열로 클래스 이름을 조합하지 말 것).

export const pageContainer = "mx-auto max-w-[900px] px-6 py-5";

export const pageTitle = "text-lg font-extrabold tracking-[-0.3px]";

/** 게시판 화면(학생관찰일지·학부모상담기록) 바깥 틀 — 대시보드(.page-dashboard)와 같은 폭·여백이라 제목이 같은 자리에 온다. */
export const boardPageContainer = "mx-auto max-w-[1320px] px-[34px] pt-[30px] pb-11 max-[760px]:px-4 max-[760px]:pt-5 max-[760px]:pb-8";

/** 게시판 화면 제목 — 대시보드 제목(.dashboard-title)과 같은 크기 */
export const boardPageTitle = "m-0 text-[19px] font-extrabold tracking-[-0.5px]";

export const card = "rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,.06),0_4px_16px_rgba(0,0,0,.04)]";

export const fieldLabel = "mt-3.5 mb-1.5 block text-xs font-bold tracking-[0.5px] text-gray-500";

export const textInput =
  "rounded-[9px] border-[1.5px] border-gray-200 bg-white px-3 py-[7px] text-[13px] outline-none transition-colors focus:border-indigo-500";

export const textArea =
  "w-full resize-none rounded-[9px] border-[1.5px] border-gray-200 px-3 py-2.5 text-[13px] leading-[1.7] outline-none transition-colors focus:border-indigo-500";

export const timestampText = "font-mono text-[11px] text-gray-500";

export const immutableBadge = "ml-auto rounded bg-gray-100 px-[7px] py-0.5 text-[10px] font-semibold text-gray-500";

export const helperNote = "mt-2 flex items-center gap-1 text-[11px] text-gray-500";

export const errorText = "mt-2 text-xs font-semibold text-red-600";

export const emptyState = "py-10 text-center text-gray-500";

export const backButton =
  "inline-block rounded-lg border-[1.5px] border-gray-200 bg-[#f8f7f4] px-3.5 py-[7px] text-[13px] font-semibold text-gray-500 transition-colors hover:border-indigo-500 hover:text-indigo-500";

/** 사용법: <label><input type="radio" className="peer sr-only" /><span className={choicePill}>…</span></label> */
export const choicePill =
  "inline-block cursor-pointer rounded-lg border-[1.5px] border-gray-200 bg-[#f8f7f4] px-3 py-[5px] text-xs font-semibold text-gray-500 transition-colors hover:border-indigo-500 hover:text-indigo-500 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-300";

export const studentTagLink =
  "rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100";

// 담당: 이유민 (Claude 세션)
// 등교 홈의 선생님 편지.
//
// 구조: 반듯한 편지지 "한 장"이 보라색 봉투에서 위로 꺼내져 있는 모습.
//  - 편지지는 회전·기울기 없음. 겹친 종이 없음.
//  - 봉투는 편지지 뒤/아래에 있고 내용을 가리지 않는다.
// 선생님 프로필 사진은 나중에 업로드하므로 지금은 빈 원형이다.

export type LetterData = {
  teacherName: string;
  studentName: string;
  /** 편지 본문. 실제로는 feedback_drafts.final_text (status='sent') 가 들어온다.
      빈 줄로 문단을 나누고, **강조** 로 감싼 부분에 라벤더 형광펜이 칠해진다. */
  text?: string;
};

const DEMO_TEXT = `어제 수학 시간에 발표하는 모습이 **정말 멋졌어!**
처음엔 조금 긴장한 것 같았는데,
끝까지 씩씩하게 해내는 모습이 대단했어.

오늘도 너의 하루가
즐겁고 행복하길 바라! 💜`;

/** **강조** 를 형광펜 span 으로 바꾼다 */
function renderLine(line: string, key: number) {
  const parts = line.split(/\*\*(.+?)\*\*/g);
  return (
    <span key={key} className="block">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="sh-mark">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
}

export default function TeacherLetter({
  data,
  closing,
  onClose,
}: {
  data: LetterData;
  closing: boolean;
  onClose: () => void;
}) {
  return (
    // 클립 바닥 77.6cqh는 유지한다. 봉투 높이를 늘리되 bottom:0으로 바닥을 맞춘다.
    // 열린 몸통: 78cqh × 260/600 = 33.8cqh. 닫힐 때는 바닥을 고정해 참고 봉투 비율(600:366)로 깊어진다.
    <div
      className={`sh-letter-scene ${
        closing ? "sh-letter-leaving" : ""
      }`}
    >
      <div className="sh-letter-assembly">
      {/* 봉투 뒤판 — 편지지 "뒤"(z-1). 종이 좌우로 보라색이 비쳐 보인다. */}
      <div className="sh-envelope-depth absolute left-1/2 bottom-0 z-[1] w-[78cqh] max-w-[64cqw] -translate-x-1/2">
        <svg viewBox="0 0 600 366" className="sh-envelope-rear block w-full" aria-hidden="true">
          {/* 같은 덮개를 접는 선 기준으로 뒤집는다. 열린 전용 윤곽을 따로 만들지 않는다. */}
          <g className="sh-envelope-open-flap">
            <g transform="translate(0 6) scale(1 -1)">
              <use href="#envClosedFlap" fill="url(#envClosedLidG)" />
              <use href="#envClosedFlap" fill="url(#envPaperGrain)" />
            </g>
          </g>
          <use href="#envClosedBody" fill="url(#envFoldShade)" />
          <use href="#envClosedBody" fill="url(#envPaperGrain)" />
        </svg>
      </div>

      {/* 편지지 — 정확히 한 장, 반듯하게. 목업 기준 세로 15~66%. */}
      <div className="sh-letter-paper sh-letter-entering absolute left-1/2 top-[11.5cqh] z-[2] w-[70cqh] max-w-[56cqw] -translate-x-1/2 px-[3cqh] pb-[20cqh] pt-[2.4cqh]">
        <button
          type="button"
          onClick={onClose}
          disabled={closing}
          aria-label="편지 닫기"
          className="sh-letter-close right-[1.6cqh] top-[1.8cqh]"
          style={{ width: "4.4cqh", height: "4.4cqh" }}
        >
          <svg viewBox="0 0 20 20" style={{ width: "2cqh" }} aria-hidden="true">
            <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>

        {/* 머리말 */}
        <div className="flex items-center gap-[1.8cqh] pr-[6cqh]">
          {/* 교사 사진은 넣지 않기로 했다(2026-09-16). 아바타 원 자체를 두지 않는다. */}
          {/* 아바타 원을 없앤 뒤로는 두 줄로 끊을 이유가 없어 한 줄로 쓴다 */}
          <p className="sh-cute whitespace-nowrap text-[2.6cqh] leading-[1.4] text-[var(--sh-navy)]">
            <span className="text-[var(--sh-violet)]">{data.teacherName}</span>이{" "}
            {data.studentName}이에게 보내는 편지
          </p>
          {/* 작은 해 — 목업의 장식 */}
          <svg viewBox="0 0 48 48" className="ml-auto" style={{ height: "5.4cqh" }} aria-hidden="true">
            <circle cx="24" cy="24" r="10" fill="#fbc84a" />
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * Math.PI) / 4;
              return (
                <line
                  key={i}
                  x1={24 + Math.cos(a) * 15}
                  y1={24 + Math.sin(a) * 15}
                  x2={24 + Math.cos(a) * 20}
                  y2={24 + Math.sin(a) * 20}
                  stroke="#fbc84a"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </div>

        <hr className="mt-[1.7cqh] border-0 border-t border-[var(--sh-paper-edge)]" />

        {/* 본문 */}
        <div className="sh-letter-body sh-letter-scroll mt-[1.9cqh] max-h-[33cqh] overflow-y-auto pl-[1.4cqh] pr-[1cqh] text-[2.4cqh] leading-[1.75]">
          <p>{data.studentName}아,</p>
          {(data.text ?? DEMO_TEXT).split("\n\n").map((para, pi) => (
            <p key={pi} className={pi === 0 ? "mt-[1.3cqh]" : "mt-[1.7cqh]"}>
              {para.split("\n").map((line, li) => renderLine(line, li))}
            </p>
          ))}
        </div>

        <p className="mt-[1.1cqh] pr-[1.2cqh] text-right text-[2cqh] text-[var(--sh-muted)]">
          – {data.teacherName} –
        </p>
      </div>

      {/* 봉투 앞판 — 편지지 "앞"(z-3).
          윗변이 ∨ 모양이라 그 위로 편지지가 봉투 안에 담긴 채 비쳐 보인다.
          실제 봉투에서 종이를 반쯤 꺼냈을 때의 모습. */}
      <div className="sh-envelope-depth pointer-events-none absolute left-1/2 bottom-0 z-[3] w-[78cqh] max-w-[64cqw] -translate-x-1/2">
        <svg viewBox="0 0 600 366" className="block w-full" aria-hidden="true">
          <defs>
            <linearGradient id="envFrontG" x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#fff0da" />
              <stop offset="35%" stopColor="#efdfeb" />
              <stop offset="72%" stopColor="#d6c4e6" />
              <stop offset="100%" stopColor="#b8a6d4" />
            </linearGradient>
            {/* 고정된 섬유·입자 패턴. 열림/닫힘이 같은 종이 결을 공유한다. */}
            <pattern id="envPaperGrain" width="72" height="58" patternUnits="userSpaceOnUse">
              <path d="M30.32 32.77l0.35 0.08 M57.66 56.08l0.40 0.28 M41.06 27.35l0.48 0.45 M41.23 36.60l0.13 0.33 M46.21 36.75l0.17 0.07 M43.63 9.09l0.29 0.22 M56.17 41.35l0.40 0.41 M56.95 3.96l0.26 -0.42 M65.39 39.96l0.20 -0.29 M16.39 35.27l0.32 -0.44 M47.04 16.62l0.23 0.45 M65.07 50.80l0.50 0.06 M4.02 21.86l0.37 0.39 M23.52 4.22l0.53 0.19 M60.41 28.40l0.23 -0.16 M10.02 21.28l0.35 0.42 M69.33 28.20l0.20 0.42 M0.62 4.25l0.40 0.09 M70.75 39.58l0.47 0.34 M68.61 51.34l0.33 0.13 M55.38 1.43l0.34 -0.08 M56.73 11.27l0.48 -0.25 M33.22 31.92l0.24 0.20 M57.80 57.52l0.28 0.38 M43.02 46.35l0.18 -0.04 M54.89 36.94l0.18 0.08 M55.33 49.23l0.12 -0.37 M22.06 0.20l0.49 0.28 M56.54 32.57l0.24 -0.03 M4.96 47.54l0.19 0.22 M24.23 9.15l0.27 -0.17 M67.74 2.18l0.26 -0.07 M36.71 0.57l0.46 -0.12 M46.04 13.73l0.22 -0.19 M23.07 51.18l0.19 -0.44 M69.20 12.14l0.52 0.16 M62.96 25.34l0.31 0.26 M31.64 26.65l0.14 0.12 M19.29 50.63l0.21 0.32 M47.84 42.71l0.50 0.28 M15.21 28.25l0.48 -0.07 M7.86 17.42l0.47 -0.42 M68.33 1.90l0.37 -0.24 M4.38 46.97l0.48 -0.30 M25.74 11.53l0.43 0.37 M62.18 10.64l0.22 0.08 M67.95 14.42l0.44 -0.18 M21.42 33.15l0.14 -0.04 M9.44 9.68l0.19 0.22 M47.19 50.87l0.34 0.31 M24.32 44.64l0.39 0.22 M34.20 35.42l0.40 -0.05 M42.12 30.55l0.52 0.14 M63.82 38.52l0.47 0.30 M1.59 37.72l0.22 -0.31 M50.41 29.88l0.41 0.11 M70.81 53.15l0.25 -0.42 M29.05 17.47l0.49 -0.28 M28.96 50.07l0.28 -0.29 M15.34 18.04l0.34 0.42 M62.52 56.60l0.26 0.03 M64.83 8.26l0.30 0.32 M43.59 57.67l0.16 -0.22 M38.34 52.09l0.51 0.06 M35.11 46.65l0.50 -0.14 M25.43 10.60l0.30 0.01 M67.07 26.35l0.47 -0.33 M19.10 48.91l0.47 -0.04 M25.25 32.86l0.41 -0.06 M6.71 23.13l0.28 0.14 M17.98 49.37l0.44 -0.30 M20.82 37.00l0.21 -0.08 M60.57 16.74l0.31 -0.01 M38.15 52.05l0.44 -0.18 M54.25 56.55l0.40 0.25 M2.17 21.34l0.25 0.07 M34.17 15.78l0.44 -0.10 M39.30 50.45l0.25 -0.14 M11.21 21.98l0.16 -0.24 M46.25 14.12l0.20 -0.04 M70.93 13.00l0.20 -0.28 M23.38 43.91l0.20 0.00 M12.58 49.85l0.30 -0.03 M35.96 15.64l0.18 -0.12 M23.24 28.00l0.19 -0.10 M49.27 41.50l0.20 0.03 M34.71 32.01l0.35 0.26 M8.61 7.17l0.34 -0.20 M28.54 24.17l0.51 -0.35 M2.07 27.95l0.29 0.24 M34.43 13.69l0.24 -0.24 M70.76 46.05l0.23 -0.37 M26.40 49.74l0.13 0.16 M62.87 44.95l0.32 0.02 M22.79 32.42l0.27 0.19 M17.67 33.69l0.44 -0.28 M41.27 56.06l0.10 0.05 M15.12 30.14l0.22 -0.05 M63.11 43.64l0.36 0.44 M58.61 17.08l0.27 0.28 M3.86 32.40l0.15 -0.08 M0.41 52.08l0.16 -0.37 M54.15 25.27l0.17 0.18 M45.97 24.26l0.41 -0.05 M13.76 51.37l0.12 0.37 M32.51 24.85l0.41 -0.20 M42.65 36.26l0.17 0.26 M63.22 18.08l0.32 -0.28 M22.42 47.33l0.34 -0.30 M1.72 55.63l0.21 -0.26 M0.93 45.93l0.30 -0.13 M16.70 54.87l0.48 -0.07 M11.45 44.33l0.42 0.29 M51.19 49.58l0.36 0.34 M28.05 52.27l0.44 -0.07 M27.39 57.60l0.13 -0.22 M53.70 54.56l0.15 0.33 M68.89 3.96l0.49 -0.27 M65.41 13.80l0.42 0.40 M26.49 32.07l0.40 0.32 M47.19 43.90l0.41 0.05 M25.35 41.63l0.10 0.02 M13.14 36.54l0.28 -0.40 M25.32 19.66l0.17 0.31 M34.16 50.40l0.46 0.19 M20.63 13.84l0.35 0.30 M15.77 1.86l0.18 -0.13 M14.93 48.43l0.30 -0.38 M36.12 39.07l0.40 -0.21 M54.69 30.67l0.25 -0.15 M1.97 48.81l0.12 -0.38 M16.42 7.25l0.54 -0.18 M6.39 23.62l0.52 0.02 M11.83 25.44l0.21 0.42 M62.92 4.23l0.20 -0.09 M42.87 57.75l0.44 -0.17 M36.86 31.55l0.30 0.08 M13.02 48.67l0.33 0.04 M16.93 29.17l0.50 -0.16 M42.31 33.57l0.16 0.25 M37.42 34.35l0.26 0.45 M16.44 51.49l0.51 0.05 M17.69 42.56l0.30 0.33 M44.47 8.17l0.38 0.35 M23.97 14.10l0.25 0.33" stroke="#80658f" strokeOpacity="0.15" strokeWidth="0.65" strokeLinecap="round" />
              <path d="M14.63 18.74l0.64 0.16 M30.13 50.53l0.59 0.36 M50.92 4.26l0.41 -0.44 M16.26 7.73l0.27 -0.37 M17.11 16.38l0.37 -0.24 M56.87 53.21l0.60 -0.26 M13.13 50.60l0.32 -0.31 M20.86 34.01l0.57 -0.31 M2.53 19.05l0.20 -0.41 M61.22 16.18l0.50 0.05 M62.93 46.94l0.21 -0.06 M0.63 3.18l0.32 0.32 M15.62 25.25l0.59 -0.03 M62.89 1.18l0.63 0.13 M41.42 24.78l0.68 0.21 M7.74 9.55l0.24 -0.03 M19.52 1.12l0.61 -0.06 M35.80 9.16l0.60 -0.00 M49.65 41.59l0.27 -0.31 M4.27 25.24l0.72 -0.27 M16.87 1.37l0.40 0.39 M14.57 15.26l0.46 0.36 M63.69 7.66l0.45 0.29 M46.25 8.49l0.66 0.24 M22.89 0.63l0.44 0.03 M61.84 35.39l0.51 0.40 M62.28 2.51l0.71 0.17 M37.37 49.01l0.39 -0.26 M53.11 49.93l0.25 0.29 M3.75 53.68l0.36 -0.10 M36.21 34.47l0.45 -0.33 M43.08 1.23l0.57 -0.43 M14.55 51.57l0.30 -0.17 M15.80 35.72l0.80 0.21 M1.25 5.90l0.31 0.04 M15.23 18.51l0.32 0.22 M38.21 51.64l0.80 0.32 M62.65 0.62l0.53 -0.43 M13.34 55.09l0.65 -0.21 M48.32 41.06l0.27 -0.45 M7.74 26.69l0.76 -0.08 M51.88 51.21l0.44 0.13 M16.51 56.21l0.67 0.34 M28.44 37.17l0.37 -0.43 M49.11 15.22l0.22 0.22 M20.53 3.42l0.46 -0.42 M34.35 24.74l0.53 -0.05 M38.38 24.18l0.56 -0.20 M65.64 9.12l0.30 -0.05 M38.31 35.28l0.61 0.26 M44.61 13.10l0.54 0.37 M24.64 40.78l0.62 0.38 M28.54 8.47l0.39 -0.37 M14.63 21.60l0.76 -0.38 M57.19 3.66l0.28 0.22 M37.26 54.66l0.73 -0.15 M56.72 19.36l0.75 0.14 M43.17 35.04l0.66 -0.32 M35.23 54.74l0.61 0.15 M41.86 34.22l0.29 -0.22 M67.79 32.53l0.65 0.10 M24.41 42.41l0.27 -0.33 M67.47 48.58l0.61 0.35 M23.89 31.48l0.39 0.21 M34.64 34.18l0.46 -0.08 M9.65 21.01l0.51 0.08 M1.62 46.71l0.25 -0.12 M7.47 34.79l0.53 -0.03 M52.61 31.46l0.46 -0.06 M21.16 26.52l0.73 0.04 M36.49 7.99l0.70 0.39 M43.94 18.73l0.69 -0.22 M35.40 41.53l0.79 -0.11 M11.46 30.08l0.77 0.45 M50.01 53.22l0.21 -0.19 M8.68 37.90l0.70 -0.02 M52.44 21.33l0.34 -0.17 M31.71 52.07l0.60 -0.06 M62.44 33.22l0.53 -0.25 M25.44 35.73l0.53 -0.04 M29.73 1.48l0.51 0.00 M60.33 6.82l0.45 0.24 M54.69 6.02l0.68 0.42 M37.67 39.64l0.26 0.05 M1.67 51.40l0.39 0.31 M38.84 42.23l0.56 -0.12 M2.68 53.39l0.61 -0.40 M70.05 20.11l0.40 0.14 M20.15 34.42l0.79 0.41 M23.24 48.95l0.62 -0.32 M17.54 51.83l0.31 0.40 M53.32 17.29l0.39 -0.23 M21.24 26.30l0.55 -0.12 M37.08 5.56l0.78 -0.31 M10.25 40.46l0.72 0.02 M11.40 35.85l0.63 0.07 M11.66 15.53l0.58 0.07 M70.99 51.75l0.45 -0.17 M2.04 29.42l0.73 0.01 M51.86 2.15l0.32 -0.09" stroke="#fffdf4" strokeOpacity="0.36" strokeWidth="0.75" strokeLinecap="round" />
              <path d="M48.47 49.10l2.44 0.09 M3.79 39.50l2.58 0.03 M71.42 17.59l2.50 0.23 M39.80 46.88l2.14 -0.28 M44.47 34.73l1.42 0.12 M66.94 53.62l1.80 0.26 M42.70 55.84l1.62 0.18 M42.86 36.42l1.88 -0.05 M49.05 17.43l1.81 0.16 M44.98 2.33l2.04 0.09 M46.91 26.71l2.69 -0.36 M16.17 41.09l2.50 -0.27 M51.50 27.28l2.27 0.15 M39.11 10.02l2.63 0.41 M5.85 36.54l1.58 -0.18 M17.67 33.73l1.24 -0.30 M17.77 34.78l2.55 -0.13 M12.59 43.67l1.45 0.25 M6.39 8.66l1.24 -0.03 M49.49 50.82l2.50 0.13 M51.13 16.72l1.79 0.00 M35.32 43.59l2.51 -0.23 M39.18 13.48l1.94 0.19 M51.74 56.32l1.82 0.25 M54.94 21.46l2.38 -0.34 M37.58 43.81l1.84 0.22 M50.97 7.19l1.27 0.38" stroke="#8e779b" strokeOpacity="0.11" strokeWidth="0.5" strokeLinecap="round" />
              <path d="M23.79 47.05l1.90 -0.10 M9.18 0.96l1.28 -0.22 M27.44 46.08l2.78 0.16 M33.98 12.87l2.89 0.39 M46.02 7.04l2.51 0.10 M59.12 28.13l2.81 -0.13 M23.08 48.99l1.30 -0.21 M21.62 2.23l2.75 0.25 M34.12 43.16l2.24 -0.39 M26.83 53.98l1.56 0.15 M6.40 57.54l1.47 -0.11 M31.97 7.50l1.87 -0.40 M7.16 43.93l2.10 0.16 M1.98 7.14l2.94 0.20 M27.80 36.30l1.89 0.14 M36.79 18.01l1.30 -0.36 M28.90 1.66l1.85 -0.19 M47.10 10.00l2.14 0.27 M14.36 43.63l2.44 -0.24 M15.72 14.11l1.94 -0.44 M26.82 1.25l2.13 0.08 M42.39 25.26l2.74 0.09 M39.22 45.43l3.02 -0.01 M19.75 51.63l2.24 -0.02" stroke="#fff8eb" strokeOpacity="0.3" strokeWidth="0.65" strokeLinecap="round" />
            </pattern>
          </defs>
          {/* 좌우 접지는 아래 접지의 양 어깨까지 가파르게 내려온다. 가운데 입구는 넓고 평평하다. */}
          <g clipPath="url(#envClosedClip)">
            <path d="M3 23 L169 184 Q178 193 194 193 H406 Q422 193 431 184 L597 23 V366 H3 Z" fill="url(#envFoldShade)" />
            <use href="#envBottomFold" fill="url(#envFrontG)" />
            <path d="M3 23 L169 184 Q178 193 194 193 H406 Q422 193 431 184 L597 23 V366 H3 Z" fill="url(#envPaperGrain)" />
          </g>
        </svg>
      </div>
      {/* PNG는 덮개의 둥근 형태와 비율만 참고한다. 색·질감은 열린 봉투와 공유한다. */}
      <div className="sh-envelope-closed pointer-events-none absolute left-1/2 bottom-0 z-[4] w-[78cqh] max-w-[64cqw] -translate-x-1/2" aria-hidden="true">
        <svg viewBox="0 0 600 366" className="block w-full">
          <defs>
            {/* 열린/닫힌 몸통이 공유하는 단 하나의 아래 접지 도형. */}
            <path id="envBottomFold" d="M4 352 C10 330 22 318 38 303 L166 191 Q177 180 193 180 H407 Q423 180 434 191 L562 303 C578 318 590 330 596 352 V366 H4 Z" />
            <path id="envClosedBody" d="M19 3 H580 Q597 3 597 22 V345 Q597 365 578 365 H22 Q3 365 3 345 V23 Q3 3 19 3 Z" />
            <path id="envClosedFlap" d="M19 3 H580 Q596 3 594 14 C588 39 581 50 565 62 L327 242 Q300 263 273 242 L35 62 C19 50 12 39 6 14 Q4 3 19 3 Z" />
            <clipPath id="envClosedClip"><use href="#envClosedBody" /></clipPath>
            <linearGradient id="envFoldShade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e9dce8" />
              <stop offset="100%" stopColor="#baa8d0" />
            </linearGradient>
            <linearGradient id="envClosedLidG" x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#f9eee4" />
              <stop offset="45%" stopColor="#ede0ed" />
              <stop offset="100%" stopColor="#d6c4e5" />
            </linearGradient>
          </defs>
          <g clipPath="url(#envClosedClip)">
            <use href="#envClosedBody" fill="url(#envFoldShade)" />
            {/* 접힌 아래 면은 외곽선 없이 낮은 명암 차이로만 구분한다. */}
            <use href="#envBottomFold" fill="url(#envFrontG)" />
            <use href="#envClosedBody" fill="url(#envPaperGrain)" />
            <g className="sh-envelope-closed-flap">
              {/* 넓고 옅은 접힘 그림자: 강한 외곽선이나 광택 없이 종이 두께만 표현한다. */}
              <path d="M8 18 C15 43 22 54 38 66 L273 246 Q300 267 327 246 L562 66 C578 54 585 43 592 18" fill="none" stroke="#927ca9" strokeOpacity="0.045" strokeWidth="14" strokeLinecap="round" />
              <path d="M8 17 C15 42 22 53 38 65 L273 245 Q300 266 327 245 L562 65 C578 53 585 42 592 17" fill="none" stroke="#927ca9" strokeOpacity="0.08" strokeWidth="5" strokeLinecap="round" />
              <use href="#envClosedFlap" fill="url(#envClosedLidG)" />
              <use href="#envClosedFlap" fill="url(#envPaperGrain)" />
            </g>
          </g>
        </svg>
      </div>
      </div>
    </div>
  );
}

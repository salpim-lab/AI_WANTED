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
    <div className={closing ? "sh-letter-leaving" : undefined}>
      {/* 봉투 뒤판 — 편지지 "뒤"(z-1). 종이 좌우로 보라색이 비쳐 보인다. */}
      <div className="absolute left-1/2 top-[58cqh] z-[1] w-[78cqh] max-w-[64cqw] -translate-x-1/2">
        <svg viewBox="0 0 600 170" className="block w-full" aria-hidden="true">
          <path d="M18 8 H582 Q600 8 600 26 V146 Q600 166 578 166 H22 Q0 166 0 146 V26 Q0 8 18 8 Z" fill="var(--sh-envelope)" />
          <path d="M18 8 H582" stroke="#ded9fd" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* 편지지 — 정확히 한 장, 반듯하게. 목업 기준 세로 15~66%. */}
      <div className="sh-letter-paper absolute left-1/2 top-[11.5cqh] z-[2] w-[70cqh] max-w-[56cqw] -translate-x-1/2 px-[3cqh] pb-[13cqh] pt-[2.4cqh]">
        <button
          type="button"
          onClick={onClose}
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

        <p className="mt-[1.4cqh] pr-[1.2cqh] text-right text-[2cqh] text-[var(--sh-muted)]">
          – {data.teacherName} –
        </p>
      </div>

      {/* 봉투 앞판 — 편지지 "앞"(z-3).
          윗변이 ∨ 모양이라 그 위로 편지지가 봉투 안에 담긴 채 비쳐 보인다.
          실제 봉투에서 종이를 반쯤 꺼냈을 때의 모습. */}
      <div className="pointer-events-none absolute left-1/2 top-[58cqh] z-[3] w-[78cqh] max-w-[64cqw] -translate-x-1/2">
        <svg viewBox="0 0 600 170" className="block w-full" aria-hidden="true">
          <defs>
            <linearGradient id="envFrontG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cfcafa" />
              <stop offset="100%" stopColor="#bdb7f4" />
            </linearGradient>
          </defs>
          {/* 앞판: 윗변이 ∨ — 좌상단에서 내려와 가운데를 지나 우상단으로 */}
          <path
            d="M0 26 L292 140 Q300 143 308 140 L600 26 V146 Q600 166 578 166 H22 Q0 166 0 146 Z"
            fill="url(#envFrontG)"
          />
          {/* ∨ 접힌 선 하이라이트 */}
          <path d="M0 26 L292 140 Q300 143 308 140 L600 26" stroke="#efedff" strokeWidth="2.6" fill="none" />
          {/* 하트 */}
          <path
            d="M300 158 C 291 145, 273 140, 273 127 C 273 118, 281 112, 289 115
               C 295 117, 299 122, 300 125 C 301 122, 305 117, 311 115
               C 319 112, 327 118, 327 127 C 327 140, 309 145, 300 158 Z"
            fill="#6a63ff"
          />
        </svg>
      </div>
    </div>
  );
}

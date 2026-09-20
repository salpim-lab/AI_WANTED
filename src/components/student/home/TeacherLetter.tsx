// 담당: 이유민 (Claude 세션)
// 등교 홈의 선생님 편지.
//
// 구조: 반듯한 편지지 "한 장"이 보라색 봉투에서 위로 꺼내져 있는 모습.
//  - 편지지는 회전·기울기 없음. 겹친 종이 없음.
//  - 봉투는 편지지 뒤/아래에 있고 내용을 가리지 않는다.
// 선생님 프로필 사진은 나중에 업로드하므로 지금은 빈 원형이다.

/**
 * 박음질 한 줄 — 짧고 둥근 땀(쫑쫑). 옅은 라벤더 실 한 겹.
 * 조각마다 한 바퀴씩 두르고 홈 그림자까지 넣었더니 꿰맨 상처처럼 보여서 덜어냈다.
 * 선은 접힌 곳 두 군데만, 원래 봉투 곡선을 그대로 따라간다(뾰족하게 꺾지 않는다).
 */
function Stitch({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="#a89ff0"
      strokeOpacity="0.55"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeDasharray="3 6"
    />
  );
}

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
}: {
  data: LetterData;
  closing: boolean;
}) {
  return (
    // 클립 바닥 77.6cqh는 유지한다. 봉투 높이를 늘리되 bottom:0으로 바닥을 맞춘다.
    // 열린 몸통: 78cqh × 260/600 = 33.8cqh. 닫힐 때는 바닥을 고정해 참고 봉투 비율(600:366)로 깊어진다.
    <div
      className={`sh-letter-scene ${
        closing ? "sh-letter-leaving" : ""
      }`}
    >
      {/* 봉투가 공중에 살짝 떠 있어 보이게 하는 바닥 그림자.
          조립체는 봉투 바닥선에서 잘리므로 그 밖에 따로 둔다. */}
      <div className="sh-envelope-floor" aria-hidden="true" />
      <div className="sh-letter-assembly">
      {/* 봉투 뒤판 — 편지지 "뒤"(z-1). 종이 좌우로 보라색이 비쳐 보인다. */}
      <div className="sh-envelope-depth absolute left-1/2 bottom-0 z-[1] w-[78cqh] max-w-[64cqw] -translate-x-1/2">
        <svg viewBox="0 0 600 366" className="sh-envelope-rear block w-full" aria-hidden="true">
          {/* 같은 덮개를 접는 선 기준으로 뒤집는다. 열린 전용 윤곽을 따로 만들지 않는다. */}
          {/* 열린 덮개와 몸통은 한 장의 종이처럼 붙어 있어야 한다.
              닫힌 모양(envClosedFlap/envClosedBody)을 그대로 쓰면 둘 다 이음새 쪽 모서리가 둥글어서
              만나는 양 끝에 V자 틈이 생겼다. 그래서 뒤판에서는 이음새 쪽 모서리만 각지게 다시 그린다. */}
          <g className="sh-envelope-open-flap">
            <g transform="translate(0 6) scale(1 -1)">
              <path d="M3 3 H597 C592 36 583 49 565 62 L327 242 Q300 263 273 242 L35 62 C17 49 8 36 3 3 Z" fill="url(#envClosedLidG)" />
            </g>
          </g>
          <path d="M3 3 H597 V345 Q597 365 578 365 H22 Q3 365 3 345 Z" fill="url(#envFoldShade)" />
          <path d="M3 3 H597 V345 Q597 365 578 365 H22 Q3 365 3 345 Z" fill="url(#envInnerShade)" />
        </svg>
      </div>

      {/* 편지지 — 정확히 한 장, 반듯하게. 목업 기준 세로 15~66%. */}
      <div className="sh-letter-paper sh-letter-entering absolute left-1/2 top-[11.5cqh] z-[2] w-[70cqh] max-w-[56cqw] -translate-x-1/2 px-[3cqh] pb-[20cqh] pt-[2.4cqh]">

        {/* 머리말 */}
        <div className="flex items-center gap-[1.8cqh] pr-[1cqh]">
          {/* 교사 사진은 넣지 않기로 했다(2026-09-16). 아바타 원 자체를 두지 않는다. */}
          {/* 아바타 원을 없앤 뒤로는 두 줄로 끊을 이유가 없어 한 줄로 쓴다 */}
          {/* 아이에게는 선생님 이름보다 "담임선생님" 이 바로 와닿는다 — 이름은 넣지 않는다(2026-09-20) */}
          <p className="sh-cute whitespace-nowrap text-[2.6cqh] leading-[1.4] text-[var(--sh-navy)]">
            <span className="text-[var(--sh-violet)]">담임선생님</span>이{" "}
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
      </div>

      {/* 봉투 앞판 — 편지지 "앞"(z-3).
          윗변이 ∨ 모양이라 그 위로 편지지가 봉투 안에 담긴 채 비쳐 보인다.
          실제 봉투에서 종이를 반쯤 꺼냈을 때의 모습. */}
      <div className="sh-envelope-depth pointer-events-none absolute left-1/2 bottom-0 z-[3] w-[78cqh] max-w-[64cqw] -translate-x-1/2">
        <svg viewBox="0 0 600 366" className="block w-full" aria-hidden="true">
          <defs>
            {/* ── 음영: 봉투 안쪽, 겹쳐진 접지만. 아주 얇고 옅게 ── */}
            {/* 봉투 안쪽(뒤판): 입구 쪽을 어둡게 — 봉투 속이 깊어 보인다 */}
            <linearGradient id="envInnerShade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6f64c4" stopOpacity="0.16" />
              <stop offset="30%" stopColor="#6f64c4" stopOpacity="0" />
            </linearGradient>
            <filter id="envSoftBlur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
            <linearGradient id="envFrontG" x1="0" y1="0" x2="0.9" y2="1">
              {/* 참고 이미지(편지봉투 사진)의 차가운 파스텔 라벤더. 크림·분홍을 섞지 않는다 */}
              <stop offset="0%" stopColor="#e9e6fe" />
              <stop offset="100%" stopColor="#d4cef9" />
            </linearGradient>
          </defs>
          {/* 좌우 접지는 아래 접지의 양 어깨까지 가파르게 내려온다. 가운데 입구는 넓고 평평하다. */}
          <g clipPath="url(#envClosedClip)">
            <path d="M3 23 L169 184 Q178 193 194 193 H406 Q422 193 431 184 L597 23 V366 H3 Z" fill="url(#envFoldShade)" />
            {/* 아래 접힘이 좌우 날개 위에 드리우는 그림자 — 겹쳐 접힌 두께 */}
            <path
              d="M4 352 C10 330 22 318 38 303 L166 191 Q177 180 193 180 H407 Q423 180 434 191 L562 303 C578 318 590 330 596 352"
              transform="translate(0 3)"
              fill="none"
              stroke="#6f64c4"
              strokeOpacity="0.14"
              strokeWidth="4"
              filter="url(#envSoftBlur)"
            />
            <use href="#envBottomFold" fill="url(#envFrontG)" />
            {/* 접힌 선의 옅은 하이라이트. 흰색이면 테두리가 따로 노는 것처럼 보여서
                봉투보다 한 톤 밝은 라벤더로 아주 옅게 둔다. */}
            <path d="M3 23 L169 184 M597 23 L431 184" fill="none" stroke="#f4f2ff" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M4 352 C10 330 22 318 38 303 L166 191 Q177 180 193 180 H407 Q423 180 434 191 L562 303 C578 318 590 330 596 352" fill="none" stroke="#f4f2ff" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
            {/* 박음질 — 아래 접힘 윗선을 따라 한 줄 */}
            <Stitch d="M16 350 C22 331 32 321 47 308 L171 200 Q181 192 195 192 H405 Q419 192 429 200 L553 308 C568 321 578 331 584 350" />
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
              <stop offset="0%" stopColor="#dedafc" />
              <stop offset="100%" stopColor="#c8c1f5" />
            </linearGradient>
            <linearGradient id="envClosedLidG" x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#ebe8fe" />
              <stop offset="100%" stopColor="#d6d0fa" />
            </linearGradient>
          </defs>
          <g clipPath="url(#envClosedClip)">
            <use href="#envClosedBody" fill="url(#envFoldShade)" />
            {/* 접힌 아래 면은 외곽선 없이 낮은 명암 차이로만 구분한다. */}
            <use href="#envBottomFold" fill="url(#envFrontG)" />
            <g className="sh-envelope-closed-flap">
              {/* 넓고 옅은 접힘 그림자: 강한 외곽선이나 광택 없이 종이 두께만 표현한다. */}
              <path d="M8 18 C15 43 22 54 38 66 L273 246 Q300 267 327 246 L562 66 C578 54 585 43 592 18" fill="none" stroke="#8b83d6" strokeOpacity="0.045" strokeWidth="14" strokeLinecap="round" />
              <path d="M8 17 C15 42 22 53 38 65 L273 245 Q300 266 327 245 L562 65 C578 53 585 42 592 17" fill="none" stroke="#8b83d6" strokeOpacity="0.08" strokeWidth="5" strokeLinecap="round" />
              <use href="#envClosedFlap" fill="url(#envClosedLidG)" />
              {/* 박음질 — 덮개 ∨선을 따라 한 줄 */}
              <Stitch d="M44 56 L288 236 Q300 245 312 236 L556 56" />
            </g>
          </g>
          {/* 하트 스티커 — 덮개가 닫히면 덮개 끝(300, 252)에 붙는다. 열려 있을 때는 없다.
              참고 이미지의 납작한 보라 하트 그대로. 봉투 윤곽 밖에 둬서 잘리지 않게 한다. */}
          <g className="sh-envelope-heart">
            <path
              d="M300 270 C288 260 276 251 276 240 C276 232 282 226 289 226 C294 226 298 229 300 233 C302 229 306 226 311 226 C318 226 324 232 324 240 C324 251 312 260 300 270 Z"
              fill="#7d71ee"
            />
            {/* 살짝 도는 광택 — 왼쪽 볼록한 곳에 빛이 닿은 정도로만 */}
            <ellipse cx="286.5" cy="234" rx="5.2" ry="2.8" fill="#fff" opacity="0.42" transform="rotate(-35 286.5 234)" />
          </g>
        </svg>
      </div>
      </div>
    </div>
  );
}

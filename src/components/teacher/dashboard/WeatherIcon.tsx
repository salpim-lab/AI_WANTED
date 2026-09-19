// 담당: 진승혜
// 오늘의 교실 카드에서 쓰는 날씨 아이콘. 이모지 대신 선/면으로 직접 그린 인라인 SVG다.
// (차트 라이브러리·아이콘 패키지를 새로 설치하지 않는다 — package.json 변경 금지)

import type { WeatherKind } from "./mockData";

const SUN = "var(--w-sun)";
const CLOUD = "var(--w-cloud)";
const RAIN_HEAVY = "var(--red)";
const QUIET = "var(--faint)";

function Rays({ cx, cy, inner, outer }: { cx: number; cy: number; inner: number; outer: number }) {
  return (
    <>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={cx + Math.cos(rad) * inner}
            y1={cy + Math.sin(rad) * inner}
            x2={cx + Math.cos(rad) * outer}
            y2={cy + Math.sin(rad) * outer}
            stroke={SUN}
            strokeWidth={2.1}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

export default function WeatherIcon({ kind, size = 48 }: { kind: WeatherKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      {kind === "sunny" && (
        <>
          <circle cx={24} cy={24} r={8.5} fill={SUN} />
          <Rays cx={24} cy={24} inner={13.5} outer={19.5} />
        </>
      )}

      {kind === "partly" && (
        <>
          <circle cx={19} cy={18} r={6.5} fill={SUN} />
          <Rays cx={19} cy={18} inner={10.5} outer={15} />
          <g fill={CLOUD}>
            <circle cx={27} cy={26} r={7} />
            <circle cx={36} cy={30} r={5.5} />
            <circle cx={21} cy={31} r={6} />
            <rect x={21} y={30} width={15} height={6} rx={3} />
          </g>
        </>
      )}

      {kind === "cloudy" && (
        <g fill={CLOUD}>
          <circle cx={24} cy={22} r={8.5} />
          <circle cx={16} cy={28} r={6.5} />
          <circle cx={32} cy={28} r={6} />
          <rect x={16} y={28} width={16} height={6.5} rx={3.2} />
        </g>
      )}

      {kind === "rainy" && (
        <>
          <g fill={CLOUD}>
            <circle cx={24} cy={19} r={8} />
            <circle cx={16} cy={24} r={6} />
            <circle cx={32} cy={24} r={5.5} />
            <rect x={16} y={24} width={16} height={6} rx={3} />
          </g>
          {[17, 24, 31].map((x, i) => (
            <line
              key={x}
              x1={x}
              y1={34 + (i === 1 ? 1 : 0)}
              x2={x - 2}
              y2={40 + (i === 1 ? 1 : 0)}
              stroke={CLOUD}
              strokeWidth={2.1}
              strokeLinecap="round"
            />
          ))}
        </>
      )}

      {/* 비가 많이 와요 — 같은 구름에 빗줄기를 하나 더하고, 빨강으로 눈에 띄게 한다
          ("비"와 눈으로 구분돼야 두 단계가 다르게 읽힌다). */}
      {kind === "stormy" && (
        <>
          <g fill={CLOUD}>
            <circle cx={24} cy={18} r={8.5} />
            <circle cx={15} cy={23.5} r={6.2} />
            <circle cx={33} cy={23.5} r={5.8} />
            <rect x={15} y={23.5} width={18} height={6.5} rx={3.2} />
          </g>
          {[14, 20, 26, 32].map((x, i) => (
            <line
              key={x}
              x1={x}
              y1={33.5 + (i % 2 === 1 ? 1 : 0)}
              x2={x - 2.6}
              y2={41.5 + (i % 2 === 1 ? 1 : 0)}
              stroke={RAIN_HEAVY}
              strokeWidth={2.3}
              strokeLinecap="round"
            />
          ))}
        </>
      )}

      {/* 응답이 적어요 — 판정할 재료가 아직 없다는 뜻이라, 날씨 모양 대신
          옅은 점선 원 안에 말줄임표를 둔다("기다리는 중"). */}
      {kind === "quiet" && (
        <>
          <circle cx={24} cy={24} r={13} fill="none" stroke={QUIET} strokeWidth={2} strokeDasharray="3 4" />
          <g fill={QUIET}>
            <circle cx={18} cy={24} r={2} />
            <circle cx={24} cy={24} r={2} />
            <circle cx={30} cy={24} r={2} />
          </g>
        </>
      )}
    </svg>
  );
}

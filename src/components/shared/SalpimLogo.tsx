import Image from "next/image";

// 원본의 로고 본체를 가운데에서 잘라 표시해 작은 헤더에서도 여백 없이 보이게 한다.

export default function SalpimLogo({
  size = 26,
  tagline = true,
  taglineSize,
  gap,
}: {
  /** 로고 본체 높이. 학생 스테이지에서는 cqh 단위를 쓴다. */
  size?: number | string;
  tagline?: boolean;
  taglineSize?: number | string;
  gap?: number | string;
}) {
  const unit = typeof size === "number" ? `${size}px` : size;
  const textSize = taglineSize ?? (typeof size === "number" ? Math.max(11, Math.round(size * 0.375)) : `calc(${unit} * 0.375)`);

  return (
    <div className="flex items-center" style={{ gap: gap ?? `calc(${unit} * 0.63)` }}>
      <span className="relative block shrink-0 overflow-hidden" style={{ width: `calc(${unit} * 2.25)`, height: unit }}>
        <Image
          src="/brand/salpim-logo.png"
          alt="살핌"
          width={1536}
          height={1024}
          sizes="(max-width: 600px) 180px, 240px"
          priority
          className="absolute max-w-none"
          style={{ width: `calc(${unit} * 3)`, height: "auto", left: `calc(${unit} * -0.4)`, top: `calc(${unit} * -0.5)` }}
        />
      </span>
      {tagline && (
        <p
          style={{
            margin: 0,
            fontSize: textSize,
            fontWeight: 500,
            lineHeight: 1.45,
            color: "var(--sh-muted, #7d849b)",
            whiteSpace: "nowrap",
          }}
        >
          오늘도,
          <br />
          너의 마음을 들어요
        </p>
      )}
    </div>
  );
}

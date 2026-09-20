import Image from "next/image";

// 원본의 로고 본체를 가운데에서 잘라 표시해 작은 헤더에서도 여백 없이 보이게 한다.

export default function SalpimLogo({
  size = 26,
}: {
  /** 로고 본체 높이. 학생 스테이지에서는 cqh 단위를 쓴다. */
  size?: number | string;
}) {
  const unit = typeof size === "number" ? `${size}px` : size;

  return (
    <div className="flex items-center">
      {/* 캐릭터 + 워드마크: 각 PNG의 투명 여백을 잘라내고, 둘 사이는 살짝만 띄운다. */}
      <span className="flex shrink-0 items-center" style={{ gap: `calc(${unit} * 0.12)` }}>
        <span className="relative block shrink-0 overflow-hidden" style={{ width: `calc(${unit} * 0.99)`, height: `calc(${unit} * 1.075)` }}>
          <Image
            src="/brand/salpim-signal-character.png"
            alt=""
            width={1254}
            height={1254}
            priority
            className="absolute max-w-none"
            style={{ width: "137.6%", height: "auto", left: "-18.9%", top: "-15.1%" }}
          />
        </span>
        <span className="relative block shrink-0 overflow-hidden" style={{ width: `calc(${unit} * 1.555)`, height: `calc(${unit} * 0.804)` }}>
          <Image
            src="/brand/salpim-wordmark.png"
            alt="살핌"
            width={1774}
            height={887}
            priority
            className="absolute max-w-none"
            style={{ width: "147.8%", height: "auto", left: "-25.5%", top: "-29.7%" }}
          />
        </span>
      </span>
    </div>
  );
}

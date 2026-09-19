"use client";

// 홈 화면 — 학생은 등교 화면, 선생님은 대시보드로 들어간다.
// 캐릭터가 카드 위에 서 있고, 카드에 마우스를 올리면(모바일은 화면에 들어오면) 말풍선으로 화면을 소개한다.
// 처음 열면 두 말풍선이 차례로 한 번씩 저절로 나와 "여기서 말을 건다"는 걸 보여준다.

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import "@/styles/landing.css";
import SalpimLogo from "@/components/shared/SalpimLogo";
import { SIGNAL_COLORS } from "@/lib/constants/colors";

type Role = "student" | "teacher";

const OPTIONS = [
  {
    role: "student",
    href: "/checkin",
    label: "학생",
    name: "민준이",
    description: "오늘 하루 민준이가 되어 마음을 이야기 해보세요.",
    bubble: ["오늘 내 기분을 색으로 표현하고", "마음에 있었던 일을 편하게 이야기해요.", "말하기 어려운 마음도", "선생님께 전할 수 있어요."],
  },
  {
    role: "teacher",
    href: "/dashboard",
    label: "선생님",
    name: "선생님",
    description: "3학년 2반 담임 선생님이 되어 아이들의 하루를 살펴보세요.",
    bubble: ["아이들의 하루 마음을 한눈에 살펴보고", "작은 감정 변화와 관계의 흐름을 확인해요.", "도움이 필요한 순간을 놓치지 않고", "먼저 다가갈 수 있어요."],
  },
] as const;

/** 마음 신호등 네 가지 색(lib/constants/colors.ts와 같은 값). 게시판에 동그라미 스티커로 붙는다. */
const MOODS = [
  { label: SIGNAL_COLORS.green.label, tone: "green", color: SIGNAL_COLORS.green.hex, mouth: "M13 23q7 7 14 0" },
  { label: SIGNAL_COLORS.yellow.label, tone: "yellow", color: SIGNAL_COLORS.yellow.hex, mouth: "M14 25h12" },
  { label: SIGNAL_COLORS.red.label, tone: "red", color: SIGNAL_COLORS.red.hex, mouth: "M13 28q7-7 14 0" },
  { label: SIGNAL_COLORS.navy.label, tone: "navy", color: SIGNAL_COLORS.navy.hex, mouth: "M12 26q2.6-3 5.2 0t5.2 0t5.2 0" },
] as const;

export default function Home() {
  const [active, setActive] = useState<Role | null>(null);
  const [hovered, setHovered] = useState(false); // 사용자가 직접 올리면 자동 시연을 멈춘다
  const hoveredRef = useRef(false);
  const optionRefs = useRef<Partial<Record<Role, HTMLDivElement | null>>>({});

  // 자동 시연: 민준 → 선생님 순서로 한 번씩
  useEffect(() => {
    const timers = [
      setTimeout(() => !hoveredRef.current && setActive("student"), 900),
      setTimeout(() => !hoveredRef.current && setActive("teacher"), 4600),
      setTimeout(() => !hoveredRef.current && setActive(null), 8300),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // 터치 화면: 카드가 화면 가운데쯤 들어오면 말풍선을 연다(호버가 없으므로)
  useEffect(() => {
    if (!window.matchMedia("(hover: none)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.getAttribute("data-role") as Role);
        }
      },
      { rootMargin: "-35% 0px -35% 0px" },
    );
    Object.values(optionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // 마우스는 카드 본체와 시작 버튼 위에서만 반응한다(둘 사이 틈에서 깜빡이지 않게 살짝 늦게 닫는다)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const engage = (role: Role) => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    hoveredRef.current = true;
    setHovered(true);
    setActive(role);
  };
  const release = () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = setTimeout(() => setActive(null), 120);
  };
  const hoverProps = (role: Role) => ({
    onMouseEnter: () => engage(role),
    onMouseLeave: release,
  });

  return (
    <div className="landing">
      <main className="landing-main">
        <div className="landing-content">
          <div className="landing-intro">
            <div className="landing-logo">
              <SalpimLogo size={64} tagline={false} />
            </div>
            <h1>
              아이의 작은 신호를 지나치지 않도록
              <br />
              교사의 살핌을 더 가까이
            </h1>
          </div>

          <div className="landing-options">
            {OPTIONS.map((option) => (
              <div
                key={option.role}
                ref={(el) => {
                  optionRefs.current[option.role] = el;
                }}
                data-role={option.role}
                className={`landing-option landing-option--${option.role}${active === option.role ? " is-active" : ""}`}
                onFocus={() => engage(option.role)}
                onBlur={release}
              >
                <span className="landing-card-bubble" aria-hidden="true">
                  <span className="landing-bubble-head">
                    <span className="landing-bubble-name">{option.name}</span>
                  </span>
                  <span className="landing-bubble-lead">{option.bubble[0]} {option.bubble[1]}</span>
                  <span className="landing-bubble-sub">{option.bubble[2]} {option.bubble[3]}</span>
                </span>

                {/* 카드 전체가 하나의 링크: 위는 장면, 아래 띠에 이름·설명·꺾쇠 */}
                <Link href={option.href} className="landing-card" aria-label={`${option.label} 화면 시작하기`} {...hoverProps(option.role)}>
                  {option.role === "student" ? (
                    <>
                      {/* 평소: 게시판 윗변에 두 손으로 매달려 눈만 빼꼼. 호버: 눈은 들어가고 같은 자리에서 얼굴과 어깨가 더 나와 손을 흔든다 */}
                      <span className="landing-hanger" aria-hidden="true">
                        <Image src="/brand/minjun-eyes-peek-cutout.png" alt="" width={1536} height={1024} loading="eager" />
                      </span>
                      <span className="landing-riser" aria-hidden="true">
                        <span className="landing-minjun-body">
                          <Image className="landing-minjun-frame landing-minjun-frame--base" src="/brand/minjun-cute-stand-1.png" alt="" width={1024} height={1536} loading="eager" />
                          <Image className="landing-minjun-frame landing-minjun-frame--wave-a" src="/brand/minjun-cute-stand-2.png" alt="" width={1024} height={1536} loading="eager" />
                          <Image className="landing-minjun-frame landing-minjun-frame--wave-b" src="/brand/minjun-cute-stand-3.png" alt="" width={1024} height={1536} loading="eager" />
                        </span>
                      </span>
                      <span className="landing-scene landing-scene--notice">
                        <span className="landing-notice-title">오늘 내 마음은?</span>
                        <span className="landing-notice-cards">
                          {MOODS.map((mood) => (
                            <span key={mood.tone} title={mood.label} className={`landing-sticker landing-sticker--${mood.tone}`} style={{ "--sig": mood.color } as React.CSSProperties}>
                              <span className="landing-sticker-disc">
                                <svg className="landing-sticker-face" viewBox="0 0 40 40">
                                  <circle cx="14" cy="16" r="2.3" />
                                  <circle cx="26" cy="16" r="2.3" />
                                  <path d={mood.mouth} />
                                </svg>
                              </span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="landing-scene landing-scene--board">
                      <span className="landing-chalk-title">오늘의 살핌</span>
                      <span className="landing-board-text">
                        <span className="landing-chalk landing-chalk--1">단원 : 오늘의 마음 날씨는?</span>
                        <span className="landing-chalk landing-chalk--2">학습문제 : 먼저 살펴볼 친구</span>
                        <span className="landing-chalk landing-chalk--3">학습 목표 : 따뜻한 한마디 보내기</span>
                      </span>
                      <span className="landing-board-teacher">
                        {/* 평소엔 옆모습이 칠판 오른쪽에서 살짝 보이고, 호버하면 정면으로 서서 필기한다 */}
                        <Image
                          className="landing-teacher-image landing-teacher-image--side"
                          src="/brand/teacher-side-writing-cutout.png"
                          alt=""
                          width={1024}
                          height={1536}
                        />
                        {/* 정면 세 컷(팔 각도만 다름)을 번갈아 보여 분필을 쥔 팔만 움직인다 */}
                        <span className="landing-teacher-front">
                          <Image className="landing-teacher-arm landing-teacher-arm--1" src="/brand/teacher-front-arm-1.png" alt="" width={1024} height={1536} />
                          <Image className="landing-teacher-arm landing-teacher-arm--2" src="/brand/teacher-front-arm-2.png" alt="" width={1024} height={1536} />
                          <Image className="landing-teacher-arm landing-teacher-arm--3" src="/brand/teacher-front-arm-3.png" alt="" width={1024} height={1536} />
                        </span>
                      </span>
                    </span>
                  )}
                  <span className="landing-start">
                    <span className="landing-card-title">{option.label}</span>
                    <span className="landing-card-description">{option.description}</span>
                    <svg className="landing-card-arrow" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m9 5 7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

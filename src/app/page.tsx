// 홈 화면 — 로그인 없이 "학생 화면" / "선생님 화면" 중 골라 들어간다.
// (2026-09-19) 원래 임시 링크 목록이었던 걸 실제 진입 화면으로 교체.
// 로그인 방식 자체(익명 인증 등)는 아직 팀 논의 중 — 이 화면은 그 결정과 무관하게
// 지금 있는 라우트(/checkin, /checkout, /dashboard)로만 이동한다. 나중에 로그인이
// 붙어도 "역할을 고르는 진입점"이라는 이 화면의 역할 자체는 바뀔 필요가 없다.
//
// 처음엔 "학생 화면" 한 카드가 시간대로 등교/하교를 자동으로 골라주고, 그 밑에 심사·테스트용으로
// 등교/하교 바로가기를 따로 뒀는데, 시간대에 따라 그 둘이 똑같은 곳으로 가서 중복이었다.
// 세 개를 동등한 선택지로 바로 두는 쪽이 더 명확하다는 피드백으로 단순화.

import Link from "next/link";
import Image from "next/image";
import "@/styles/landing.css";

// (2026-09-19 이유민) 공개 링크를 받은 사람의 흐름에 맞춰 둘로 줄였다.
// 학생 화면은 등교에서 시작해, 섬 배치를 마치면 자동으로 하교 화면으로 넘어간다.
// 하교 홈에는 "교사 시점으로 전환하기" 가 있어 같은 흐름을 교사 쪽에서 이어 볼 수 있다.
// 그래서 등교/하교를 따로 고를 필요가 없다.
const OPTIONS = [
  { href: "/checkin", label: "학생", description: "민준이가 되어 오늘의 마음 이야기하기", icon: "student" },
  { href: "/dashboard", label: "선생님", description: "선생님이 되어 우리 반의 하루 살펴보기", icon: "teacher" },
] as const;

export default function Home() {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-logo">살<span>핌</span></div>
        <p>오늘도, 너의 마음을 들어요</p>
      </header>

      <main className="landing-main">
        <div className="landing-content">
          <div className="landing-intro">
            <h1>살핌에 오신 걸 환영해요</h1>
            <p>시작할 화면을 선택해 주세요</p>
          </div>

          <div className="landing-options">
            {OPTIONS.map((option) => (
              <div
                key={option.href}
                className={`landing-option${option.icon === "student" ? " landing-option--student" : ""}`}
              >
                {option.icon === "student" && (
                  <span className="landing-card-character" aria-hidden="true">
                    <span className="landing-card-character-motion">
                      <Image
                        className="landing-card-character-frame"
                        src="/students/minjun-wave-raised-cutout.png"
                        alt=""
                        width={1024}
                        height={1536}
                        loading="eager"
                      />
                      <Image
                        className="landing-card-character-frame landing-card-character-frame--wave"
                        src="/students/minjun-wave-outward-cutout.png"
                        alt=""
                        width={1024}
                        height={1536}
                        loading="eager"
                      />
                    </span>
                  </span>
                )}
                <Link href={option.href} className="landing-card">
                  <span className="landing-card-icon" aria-hidden="true">
                    {option.icon === "student" ? (
                      <svg viewBox="0 0 32 32" fill="none">
                        <circle cx="16" cy="10" r="5" />
                        <path d="M6.5 26v-2.5a9.5 9.5 0 0 1 19 0V26H6.5Z" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 32 32" fill="none">
                        <rect x="4" y="5" width="24" height="17" rx="2.5" />
                        <path d="M12 27h8M16 22v5M10 12h12M10 16h7" />
                      </svg>
                    )}
                  </span>
                  <span className="landing-card-title">{option.label}</span>
                  <span className="landing-card-description">{option.description}</span>
                  <span className="landing-card-arrow" aria-hidden="true">→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

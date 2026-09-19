// 홈 화면 — 학생은 등교 화면, 선생님은 대시보드로 들어간다.

import Link from "next/link";
import Image from "next/image";
import "@/styles/landing.css";

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

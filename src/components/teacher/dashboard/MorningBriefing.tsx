// 담당: 진승혜
// 대시보드 영역 1: 아침 브리핑 — 대시보드에서 가장 먼저 읽혀야 하는 카드다.
// 감정 신호(색) 축만 담당한다: 오늘 색이 걸리는 아이를 한 열로 보여준다.
//   - 칭찬("한마디 돌려줄 아이") 열은 뺐다. 아침에 교사가 쓸 시간은 살펴볼 아이에게 간다.
//   - 요일·시간표 교차 같은 반복 패턴은 여기가 아니라 패턴 경고 카드가 맡는다.
// 경고창처럼 보이지 않게: 테두리·경고색 대신 부드러운 배경 row + 이름/상태/이유의 3단 위계.
// 참고: 살핌_기획안.md "6.2 아침 브리핑"
// 데이터: page.tsx 가 선택 날짜의 morning checkin 기준으로 조립해 props 로 내려준다.
// 링크는 기존 /students/[id] 유지 (김현우 담당 화면 — 구현은 건드리지 않는다)

import Link from "next/link";
import type { BriefingStudent } from "./mockData";

const TONE_CLASS: Record<BriefingStudent["tone"], string> = {
  green: "tone-green",
  yellow: "tone-yellow",
  red: "tone-red",
  navy: "tone-navy",
};

export default function MorningBriefing({
  watch,
  isToday,
}: {
  watch: BriefingStudent[];
  isToday: boolean;
}) {
  return (
    <section className="card briefing-card">
      <div className="card-title">
        아침 브리핑
        <span className="card-sub">{isToday ? "오늘 하루를 시작하기 전에" : "이 날의 등교 기록"}</span>
      </div>

      <div className="briefing-col-title">
        {isToday ? "오늘 먼저 살펴볼 아이" : "먼저 살펴본 아이"}
        <span className="briefing-col-hint">{watch.length}명 · 등교 때 고른 색 기준</span>
      </div>

      <ul className="briefing-list">
        {watch.map((s) => (
          <li key={s.studentId}>
            <Link href={`/students/${s.studentId}`} className={`briefing-row ${TONE_CLASS[s.tone]}`}>
              <span className="briefing-avatar" aria-hidden />
              <span className="briefing-info">
                <span className="briefing-line">
                  <strong className="bname">{s.name}</strong>
                  <span className="bstatus">{s.status}</span>
                </span>
                <span className="breason">{s.reason}</span>
              </span>
              <span className="briefing-go" aria-hidden>
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

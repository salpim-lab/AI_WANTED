// 담당: 진승혜
// 대시보드 섹션 1: 오늘 살펴볼 아이 3명 + 한마디 돌려줄 아이 3명
// 참고: 살핌_기획안.md "6.2 아침 브리핑 — 두 개의 열"
// (지금은 "살펴볼 아이" 3명만 프로토타입에 있어서 그대로 옮김 — "한마디 돌려줄 아이" 열은 데이터 정해지면 추가)

import Link from "next/link";
import { BRIEFING_STUDENTS } from "./mockData";

export default function MorningBriefing() {
  return (
    <div className="card">
      <div className="card-title">
        아침 브리핑
        <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          오늘 살펴볼 아이
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {BRIEFING_STUDENTS.map((s) => (
          <div className="briefing-student" key={s.id}>
            <div className={`briefing-avatar ${s.avatarClass}`}>{s.initial}</div>
            <div className="briefing-info">
              <div className="bname">{s.name}</div>
              <div className="breason">{s.reason}</div>
            </div>
            <Link href={`/students/${s.id}`} className="btn-outline btn-sm briefing-action">
              상세 보기
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

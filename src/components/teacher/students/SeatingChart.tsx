// 담당: 김현우
// 아이 상세 탭 진입 화면: 20명 자리 배치도, 자리별 이름 + 오늘 등교 색 표시
// 클릭 시 /students/[id] 로 이동 (라우팅으로 처리하므로 별도 뷰 전환 상태 불필요)
// 참고: docs/prototype/prototype-teacher.html #view-seating

import Link from "next/link";
import { STUDENTS } from "./mockData";

export default function SeatingChart() {
  return (
    <div className="page-students">
      <div className="seating-header">
        <h2>아이 상세</h2>
        <p>자리를 클릭하면 해당 아이의 기록을 볼 수 있어요</p>
      </div>
      <div className="seating-teacher-desk">
        <div className="teacher-desk-label">칠판 / 교탁</div>
      </div>
      <div className="seating-grid">
        {STUDENTS.map((s) => (
          <Link key={s.id} href={`/students/${s.id}`} className={`seat color-${s.morning}`}>
            {s.role === "watch" && <div className="seat-badge seat-badge-watch">!</div>}
            {s.role === "unicorn" && <div className="seat-badge seat-badge-unicorn">★</div>}
            <div className="seat-name">{s.name}</div>
            <div className={`seat-color dot-${s.morning}`} />
          </Link>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              border: "2px solid var(--red)",
            }}
          />{" "}
          살펴볼 아이
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#f59e0b",
              border: "2px solid #fff",
            }}
          />{" "}
          한마디 돌려줄 아이
        </span>
      </div>
    </div>
  );
}

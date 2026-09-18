// 담당: 진승혜
// 대시보드 영역 1: 아침 브리핑 — 대시보드에서 가장 먼저 읽혀야 하는 카드다.
// "아침 브리핑" 이라는 제목 줄은 없앴다. 카드 이름을 한 번 읽히게 하려고 한 단을 쓰고
// 정작 볼 것("살펴볼 아이", "예정된 상담")을 아래로 밀어내던 구조였다.
// 이제 그 두 묶음이 카드 제목과 같은 층위에 나란히 선다 — 박스는 지금처럼 하나 그대로다.
// 감정 신호(색) 축만 담당한다: 오늘 색이 걸리는 아이를 한 줄로 보여준다.
//   - 칭찬("한마디 돌려줄 아이") 열은 뺐다. 아침에 교사가 쓸 시간은 살펴볼 아이에게 간다.
//   - 요일·시간표 교차 같은 반복 패턴은 여기가 아니라 패턴 경고 카드가 맡는다.
// 경고창처럼 보이지 않게: 테두리·경고색 대신 부드러운 배경 row + 이름/상태/이유의 3단 위계.
// 목록은 아래로 길어지지 않게 가로로 쌓고, 넘치면 ‹ › 버튼·스크롤로 옆으로 넘긴다 (HorizontalScroller).
// 그날 예정된 상담(학부모·학생)도 같은 카드 안에 가로 목록으로 보여준다 — 데이터는 김현우 담당 상담기록.
// 상담 행의 ✎ 버튼으로 예정 일시·대상·방식을 바꿀 수 있다 (저장은 김현우 담당 Server Action).
// 참고: 살핌_기획안.md "6.2 아침 브리핑"
// 데이터: page.tsx 가 선택 날짜의 morning checkin 기준으로 조립해 props 로 내려준다.
// 링크는 기존 /students/[id], /consultation 유지 (김현우 담당 화면 — 구현은 건드리지 않는다)

import Link from "next/link";
import HorizontalScroller from "@/components/shared/HorizontalScroller";
import EditScheduledConsultationButton from "@/components/teacher/consultation/EditScheduledConsultationButton";
import type { BriefingStudent } from "./mockData";
import type { ConsultationMethod, ScheduledConsultation } from "@/lib/types/teacherRecord";

const TONE_CLASS: Record<BriefingStudent["tone"], string> = {
  green: "tone-green",
  yellow: "tone-yellow",
  red: "tone-red",
  navy: "tone-navy",
};

const METHOD_LABEL: Record<ConsultationMethod, string> = { phone: "전화", visit: "방문", online: "온라인" };

// 상담 대상이 "학생 본인"이면 학생 상담, 그 밖(어머니·아버지 등)은 학부모 상담
const isStudentConsultation = (c: ScheduledConsultation) => c.counterpart === "학생 본인";

function formatKstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
}

export default function MorningBriefing({
  watch,
  consultations,
  isToday,
}: {
  watch: BriefingStudent[];
  consultations: ScheduledConsultation[];
  isToday: boolean;
}) {
  return (
    <section className="card briefing-card">
      <div className="card-title">
        {isToday ? "오늘 먼저 살펴볼 아이" : "먼저 살펴본 아이"}
        <span className="card-sub">{watch.length}명 · 등교 때 고른 색 기준</span>
      </div>

      <HorizontalScroller listClassName="briefing-list" label="먼저 살펴볼 아이">
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
              {/* 같은 화면 안에서 옆으로 가는 게 아니라 아이 상세로 빠져나간다 — ↗ 가 그 뜻이다 */}
              <span className="briefing-go" aria-hidden>
                ↗
              </span>
            </Link>
          </li>
        ))}
      </HorizontalScroller>

      <div className="card-title briefing-title-next">
        {isToday ? "오늘 예정된 상담" : "이 날 예정된 상담"}
        <span className="card-sub">{consultations.length}건 · 학부모·학생 상담</span>
      </div>

      {consultations.length === 0 ? (
        <p className="briefing-empty">예정된 상담이 없어요</p>
      ) : (
        <HorizontalScroller listClassName="briefing-list" label="예정된 상담">
          {consultations.map((c) => (
            <li key={c.id} className="briefing-consult-item">
              <Link href="/consultation" className="briefing-row briefing-consult">
                <span className="briefing-time">{formatKstTime(c.scheduledAt)}</span>
                <span className="briefing-info">
                  <span className="briefing-line">
                    <strong className="bname">{c.student.name}</strong>
                    <span className="bstatus">{isStudentConsultation(c) ? "학생 상담" : "학부모 상담"}</span>
                  </span>
                  <span className="breason">
                    {c.counterpart} · {METHOD_LABEL[c.method]}
                  </span>
                </span>
              </Link>
              <EditScheduledConsultationButton consultation={c} variant="icon" className="briefing-edit" />
            </li>
          ))}
        </HorizontalScroller>
      )}
    </section>
  );
}

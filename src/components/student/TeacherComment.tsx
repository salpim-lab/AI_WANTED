// 담당: 이유민
// 등교 1단계: 교사가 전날 저장한 코멘트를 학생에게 보여준다.
// 지금은 프로토타입 문구를 그대로 mock으로 사용 — 실제로는 김현우가 만드는
// lib/supabase/interpretation/teacherComment.ts 에서 당일 코멘트를 읽어와야 함.
// 참고: docs/prototype/prototype-student.html #s1

export default function TeacherComment({
  active = true,
  onNext,
}: {
  active?: boolean;
  onNext: () => void;
}) {
  return (
    <div className={"screen" + (active ? " active" : "")} id="s1">
      <div className="s1-greeting">
        <div className="hello">좋은 아침이에요 ☀️</div>
        <div className="name">김민준</div>
      </div>

      <div className="s1-card">
        <div className="from">선생님의 한마디</div>
        <div className="message">
          민준아, 어제 수업 시간에{" "}
          <span className="highlight">끝까지 집중해서 문제 푸는 모습</span>이
          정말 멋졌어.
          <br />
          <br />
          선생님은 민준이가 포기하지 않고 끝까지 해내는 걸 보면 항상 뿌듯해.
          오늘도 그 마음으로 시작해보자! 😊
        </div>
        <div className="from-name">— 이선생님</div>
      </div>

      <div className="s1-bottom">
        <div className="s1-date">2026년 9월 13일 (목)</div>
        <button className="btn-primary" onClick={onNext}>
          다음으로 →
        </button>
      </div>
    </div>
  );
}

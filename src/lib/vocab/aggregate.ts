// 담당: 진승혜
// 감정 어휘 성장의 숫자를 만드는 유일한 자리. 순수 함수 — DB도 LLM도 모른다.
//
// 경계: LLM은 "이 발화에 어떤 표제어가 있나"까지만 답한다. 세는 건 전부 여기다.
// 같은 입력이면 언제 돌려도 같은 숫자가 나와야 교육 성과 지표로 쓸 수 있다.
//
// 정의:
//   count = 학기 시작 이후 그 아이가 한 번이라도 쓴 표제어의 종류 수 (누적 집합의 크기)
//   delta = 그중 이번 달에 "처음" 등장한 표제어 수 — 이미 쓰던 말을 또 써도 늘지 않는다
//   trend = 각 달 말 기준 학급 평균 count. 누적이라 단조 증가한다.

/** studentId 는 DB uuid 도, 화면 mock 의 번호도 될 수 있어 호출부가 정한다. */
export type StudentId = string | number;

/** 한 세션에서 확인된 표제어들. 같은 세션에서 몇 번 말했는지는 버린다 — 종류만 센다. */
export type SessionLemmas<Id extends StudentId = StudentId> = {
  studentId: Id;
  /** YYYY-MM-DD */
  date: string;
  lemmas: string[];
};

export type VocabStudentStat<Id extends StudentId = StudentId> = {
  studentId: Id;
  name: string;
  count: number;
  delta: number;
};
export type VocabMonthStat = { month: string; average: number };

const monthOf = (date: string) => date.slice(0, 7);
const monthLabel = (ym: string) => `${Number(ym.slice(5, 7))}월`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 학생별 { 표제어 → 처음 쓴 날짜 }. 같은 표제어를 다시 써도 첫 날짜는 바뀌지 않는다. */
function buildFirstSeen<Id extends StudentId>(sessions: SessionLemmas<Id>[], asOf: string) {
  const firstSeen = new Map<Id, Map<string, string>>();
  for (const session of sessions) {
    if (session.date > asOf) continue;
    let seen = firstSeen.get(session.studentId);
    if (!seen) firstSeen.set(session.studentId, (seen = new Map()));
    for (const lemma of session.lemmas) {
      const prior = seen.get(lemma);
      if (!prior || session.date < prior) seen.set(lemma, session.date);
    }
  }
  return firstSeen;
}

export function aggregateVocab<Id extends StudentId>(
  roster: { studentId: Id; name: string }[],
  sessions: SessionLemmas<Id>[],
  asOf: string,
): { students: VocabStudentStat<Id>[]; trend: VocabMonthStat[] } {
  const firstSeen = buildFirstSeen(sessions, asOf);
  const currentMonth = monthOf(asOf);

  const students = roster.map(({ studentId, name }) => {
    const seen = firstSeen.get(studentId);
    if (!seen) return { studentId, name, count: 0, delta: 0 };
    let delta = 0;
    for (const date of seen.values()) if (monthOf(date) === currentMonth) delta += 1;
    return { studentId, name, count: seen.size, delta };
  });

  // 데이터가 있는 달만 그린다. 기록이 없는 달에 0을 찍으면 "어휘가 사라진" 것처럼 읽힌다.
  const months = [...new Set(sessions.filter((s) => s.date <= asOf).map((s) => monthOf(s.date)))].sort();

  const trend = months.map((ym) => {
    const end = `${ym}-31`;
    const total = roster.reduce((sum, { studentId }) => {
      const seen = firstSeen.get(studentId);
      if (!seen) return sum;
      let n = 0;
      for (const date of seen.values()) if (date <= end) n += 1;
      return sum + n;
    }, 0);
    return { month: monthLabel(ym), average: round1(total / roster.length) };
  });

  return { students, trend };
}

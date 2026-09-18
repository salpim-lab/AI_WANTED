// 담당: 진승혜
// 우리 반 시간표 — 교사 화면 상단의 시간표 버튼과, 패턴 경고의 "체육 있는 날" 교차에 쓴다.
//
// 지금은 상수다. 실제로는 학급별 시간표 테이블(class_periods)에서 읽어야 하고,
// 그때는 "언제부터 유효한 시간표인지"가 같이 필요하다 — 학기 중에 시간표가 바뀌면
// 지난 2주 패턴을 옛 시간표로 계산해야 맞기 때문이다. 상수인 동안은 그 구분이 없다.
//
// 3학년 2반 · 하루 4교시.

export type Weekday = "월" | "화" | "수" | "목" | "금";

export const WEEKDAYS: Weekday[] = ["월", "화", "수", "목", "금"];

/** 교시별 시작~끝 (초등 40분 수업 기준) */
export const PERIOD_TIMES = ["09:00", "09:50", "10:50", "11:40"] as const;

export const PERIOD_COUNT = PERIOD_TIMES.length;

/** [1교시, 2교시, 3교시, 4교시] */
export const TIMETABLE: Record<Weekday, string[]> = {
  월: ["국어", "수학", "통합", "도덕"],
  화: ["수학", "국어", "체육", "음악"],
  수: ["국어", "수학", "사회", "미술"],
  목: ["수학", "영어", "체육", "과학"],
  금: ["국어", "사회", "체육", "창체"],
};

/** "2026-09-18" → "금" (주말이면 null — 시간표가 없는 날) */
export function weekdayOfDate(dateKey: string): Weekday | null {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5 ? WEEKDAYS[day - 1] : null;
}

/** 그날의 4교시 과목. 주말이면 빈 배열. */
export function subjectsOn(dateKey: string): string[] {
  const weekday = weekdayOfDate(dateKey);
  return weekday ? TIMETABLE[weekday] : [];
}

/** 그날 그 과목이 몇 교시인지 (1부터). 없으면 null. */
export function periodOf(dateKey: string, subject: string): number | null {
  const index = subjectsOn(dateKey).indexOf(subject);
  return index === -1 ? null : index + 1;
}

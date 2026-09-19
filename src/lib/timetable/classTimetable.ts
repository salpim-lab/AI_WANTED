// 담당: 진승혜
// 우리 반 시간표 — 교사 화면 상단의 시간표 버튼과, 패턴 경고의 "체육 있는 날" 교차에 쓴다.
//
// 지금은 상수다. 실제로는 학급별 시간표 테이블(class_periods)에서 읽어야 하고,
// 그때는 "언제부터 유효한 시간표인지"가 같이 필요하다 — 학기 중에 시간표가 바뀌면
// 지난 2주 패턴을 옛 시간표로 계산해야 맞기 때문이다. 상수인 동안은 그 구분이 없다.
//
// 3학년 2반 · 3~4학년 편성(주 26시간)이라 5교시가 나흘, 6교시가 하루다.
// 표를 그릴 때는 가장 긴 날(6교시)에 맞춰 줄을 잡고, 5교시로 끝나는 날은 마지막 칸을 비운다.

export type Weekday = "월" | "화" | "수" | "목" | "금";

export const WEEKDAYS: Weekday[] = ["월", "화", "수", "목", "금"];

/** 교시별 시작 시각 (초등 40분 수업 · 4교시 뒤 점심) */
export const PERIOD_TIMES = ["09:00", "09:50", "10:50", "11:40", "13:20", "14:10"] as const;

/** 가장 긴 날 기준 교시 수. 요일마다 실제 교시 수는 TIMETABLE 의 길이를 본다. */
export const PERIOD_COUNT = PERIOD_TIMES.length;

/** [1교시 … ] — 화요일만 6교시, 나머지는 5교시다. */
export const TIMETABLE: Record<Weekday, string[]> = {
  월: ["국어", "수학", "통합", "도덕", "체육"],
  화: ["수학", "국어", "체육", "음악", "영어", "창체"],
  수: ["국어", "수학", "사회", "미술", "영어"],
  목: ["수학", "영어", "체육", "과학", "통합"],
  금: ["국어", "사회", "체육", "창체", "수학"],
};

/** "2026-09-18" → "금" (주말이면 null — 시간표가 없는 날) */
export function weekdayOfDate(dateKey: string): Weekday | null {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5 ? WEEKDAYS[day - 1] : null;
}

/** 그날의 과목(5교시 또는 6교시). 주말이면 빈 배열. */
export function subjectsOn(dateKey: string): string[] {
  const weekday = weekdayOfDate(dateKey);
  return weekday ? TIMETABLE[weekday] : [];
}

/** 그날 그 과목이 몇 교시인지 (1부터). 없으면 null. */
export function periodOf(dateKey: string, subject: string): number | null {
  const index = subjectsOn(dateKey).indexOf(subject);
  return index === -1 ? null : index + 1;
}

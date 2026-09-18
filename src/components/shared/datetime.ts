// 담당: 김현우 (단독 소유) — 교사 화면 날짜·시각 유틸. 서버·클라이언트 공용 순수 함수.
// 저장·전송은 항상 ISO(UTC). 화면 표시와 "하루"의 경계는 항상 한국 시각(Asia/Seoul) 기준.
// timeZone을 명시하므로 서버와 브라우저의 결과가 같다 (hydration 불일치 없음).

const TIME_ZONE = "Asia/Seoul";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
/** 서버·기기 시계 오차 허용치 */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** "2026-09-13" 형식이면서 실제로 존재하는 날짜인지 */
export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** 시각 → 한국 기준 날짜 "YYYY-MM-DD" */
export function toKstDate(instant: Date | string): string {
  return new Date(instant).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

export function todayKst(): string {
  return toKstDate(new Date());
}

/** "YYYY-MM-DD" 날짜 산술 (시간대 영향 없음) */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" 두 날짜 사이 일수 (to - from, 날짜 산술만, 시간대 영향 없음) */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** ISO → "2026-09-12 14:03:22" (한국 시각) */
export function formatKstDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** "YYYY-MM-DD" → "9월 12일 (금)" */
export function formatKstDate(date: string): string {
  const noon = new Date(`${date}T12:00:00+09:00`);
  const monthDay = noon.toLocaleDateString("ko-KR", { timeZone: TIME_ZONE, month: "long", day: "numeric" });
  return `${monthDay} (${weekdayKst(date)})`;
}

/** "YYYY-MM-DD" → "금" */
export function weekdayKst(date: string): string {
  return new Date(`${date}T12:00:00+09:00`).toLocaleDateString("ko-KR", {
    timeZone: TIME_ZONE,
    weekday: "short",
  });
}

/** 지금(한국 시각)을 <input type="datetime-local"> 기본값 형식으로 — "2026-09-12T14:03" */
export function nowKstLocalInput(): string {
  return toKstLocalInput(new Date());
}

/** ISO 시각 → 한국 시각 <input type="datetime-local"> 값 — "2026-09-12T14:03" */
export function toKstLocalInput(instant: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * <input type="datetime-local"> 값("2026-09-12T14:00", 한국 시각으로 해석) → ISO.
 * - 빈 값: null (서버 시각 사용)
 * - 형식 오류이거나 미래 시각: "invalid"
 */
export function parsePastKstLocalDateTime(value: string): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!LOCAL_DATETIME_RE.test(trimmed)) return "invalid";
  const instant = new Date(`${trimmed}:00+09:00`);
  if (Number.isNaN(instant.getTime())) return "invalid";
  if (instant.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return "invalid";
  return instant.toISOString();
}

/**
 * <input type="datetime-local"> 값 → ISO, 과거·미래 모두 허용(상담 예약처럼 미래 일정을 받을 때 쓴다).
 * - 형식 오류: "invalid" (빈 값도 오류 — 예약 일시는 필수 입력이라 null 허용이 없다)
 */
export function parseKstLocalDateTime(value: string): string | "invalid" {
  const trimmed = value.trim();
  if (!trimmed || !LOCAL_DATETIME_RE.test(trimmed)) return "invalid";
  const instant = new Date(`${trimmed}:00+09:00`);
  if (Number.isNaN(instant.getTime())) return "invalid";
  return instant.toISOString();
}

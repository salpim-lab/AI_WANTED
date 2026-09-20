import { addDays, todayKst, toKstDate } from "@/components/shared/datetime";
import { givenName } from "@/components/shared/names";
import { getDemoScope, ownerOrFilter } from "@/lib/demo/scope";
import { loadOpenMeetingRequests, loadVisibleConflictRecords, type OpenMeetingRequest } from "@/lib/supabase/queries/dashboardScope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SignalColor } from "@/lib/types/signal";
import { canonicalize } from "@/lib/vocab/lexicon";
import { aggregateVocab, type SessionLemmas } from "@/lib/vocab/aggregate";
import { BRIEFING_HISTORY_DAYS, buildBriefingRows } from "@/lib/supabase/queries/morningBriefing";
import type { StudentFacts } from "@/lib/briefing/triggers";
import { isDistressWord } from "@/lib/vocab/lexicon";

type WeatherKind = "sunny" | "partly" | "cloudy" | "rainy" | "stormy" | "quiet";
type RelationPeriod = "1w" | "2w" | "4w" | "all";

type StudentRef = { studentId: string | number; name: string };
type BriefingStudent = StudentRef & {
  tone: SignalColor;
  status: string;
  reason: string;
};
type MoodShare = {
  color: SignalColor;
  count: number;
  pct: number;
  students: StudentRef[];
};
type ClassroomWeather = {
  kind: WeatherKind;
  headline: string;
  question: string;
  support: string;
};
type ClassroomDay = {
  date: string;
  weekday: string;
  kind: WeatherKind;
  isToday: boolean;
};
/** 등교/하교 한 시간대의 날씨+감정 분포 — 아이 상세의 "등교 마음 기록/하교 마음 기록"과 같은 구분이다 */
type ClassroomPeriod = { weather: ClassroomWeather; mood: MoodShare[] };
type CheckinPeriod = "morning" | "afternoon";
type ParticipationSummary = {
  date: string;
  completedCount: number;
  totalCount: number;
  absentStudents: StudentRef[];
};
type ConflictRow = {
  date: string;
  label: string;
  pair: string;
  pairIds: [string, string];
  summary: string;
  status: string;
  statements: { who: string; tone: SignalColor | "muted"; text: string }[];
};
type RelationGraph = {
  nodes: {
    studentId: string;
    name: string;
    x: number;
    y: number;
    r: number;
    tone: "normal" | "conflict" | "isolated";
  }[];
  edges: { from: string; to: string; kind: "normal" | "conflict"; strength: number }[];
  details: Record<string, {
    studentId: string;
    name: string;
    mentionCount: number;
    quotes: { from: string; to?: string; date: string; text: string }[];
    conflicts: ConflictRow[];
  }>;
  pairs: Record<string, {
    a: { studentId: string; name: string };
    b: { studentId: string; name: string };
    mentionCount: number;
    quotes: { from: string; to?: string; date: string; text: string }[];
    conflicts: ConflictRow[];
  }>;
  conflicts: ConflictRow[];
};
type VocabStudent = {
  studentId: string;
  name: string;
  shortName?: string;
  count: number;
  delta: number;
  words: string[];
};
type VocabMonth = { month: string; average: number };
type DashboardData = {
  dateKey: string;
  isToday: boolean;
  briefing: { watch: BriefingStudent[] };
  classroom: {
    periods: Record<CheckinPeriod, ClassroomPeriod>;
    /** 탭을 처음 열 때 어느 쪽을 보여줄지 — 그 시간대 중 더 최근에 기록이 쌓인 쪽 */
    defaultPeriod: CheckinPeriod;
    delta: string;
    recentDays: ClassroomDay[];
  };
  participation: ParticipationSummary;
  relation: Record<RelationPeriod, RelationGraph>;
  conflicts: ConflictRow[];
  vocab: { students: VocabStudent[]; trend: VocabMonth[] };
};

const SIGNAL_ORDER: SignalColor[] = ["green", "yellow", "red", "navy"];
const SIGNAL_SET = new Set<string>(SIGNAL_ORDER);
const RELATION_PERIODS = [
  { id: "1w", days: 5 },
  { id: "2w", days: 10 },
  { id: "4w", days: 20 },
  { id: "all", days: 90 },
] as const satisfies { id: RelationPeriod; days: number }[];
const ANALYSIS_TYPE = "emotion_vocab";
const WATCH_LIMIT = 4;
const ANALYSIS_QUERY_BATCH_SIZE = 100;

type RosterStudent = {
  studentNo: number;
  studentId: string;
  enrollmentId: string;
  name: string;
  shortName: string;
  seatRow: number;
  seatCol: number;
};

type DashboardSession = {
  id: string;
  enrollment_id: string;
  session_date: string;
  period: string;
  attempt: number;
  mood_color: string;
  status: string;
  started_at: string;
  transcript: unknown;
  prosody: unknown;
};

type StudentSignal = RosterStudent & { color: SignalColor | null };

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
/** 감정 어휘 누적 집계의 시작점 — 관계 지도의 "누적"(90일)과는 다른 값이다.
    실제 체크인 기록이 이보다 훨씬 뒤에나 시작하므로, 넉넉히 이르게 잡아 전체 기록을 다 담는다. */
const VOCAB_HISTORY_START = "2020-01-01";

function envReady() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SECRET_KEY?.trim());
}

export function dashboardToday() {
  return todayKst();
}

export function dashboardMinDate() {
  return `${dashboardToday().slice(0, 8)}01`;
}

export function resolveDashboardDate(raw?: string | string[]) {
  const today = dashboardToday();
  const min = dashboardMinDate();
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  if (value > today) return today;
  if (value < min) return min;
  return value;
}

function shortDate(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function weekdayOf(dateKey: string) {
  return KO_WEEKDAY[new Date(`${dateKey}T00:00:00Z`).getUTCDay()];
}

function recentDays(dateKey: string, count: number) {
  return Array.from({ length: count }, (_, index) => addDays(dateKey, index - (count - 1)));
}

function monthLabel(ym: string) {
  return `${Number(ym.slice(5, 7))}월`;
}

async function loadRoster(classId: string): Promise<RosterStudent[]> {
  if (!envReady()) return [];

  const client = createAdminClient();
  const { data, error } = await client
    .from("enrollments")
    .select("id, student_id, seat_row, seat_col, students(display_name)")
    .eq("class_id", classId)
    .is("ended_on", null)
    .order("seat_row")
    .order("seat_col");

  if (error) throw error;

  // students.display_name 은 이제 성까지 포함한 전체 이름이다(2026-09-20 전체 이름 마이그레이션).
  // 짧은 이름(막대 아래 라벨 등)은 여기서 성만 뗀다 — givenName 이 그 규칙(2글자 이하는 그대로)을 쥐고 있다.
  return (data ?? []).map((row, index) => {
    const fullName = (row.students as { display_name?: string } | null)?.display_name ?? "이름 없음";
    return {
      studentNo: index + 1,
      studentId: row.student_id,
      enrollmentId: row.id,
      name: fullName,
      shortName: givenName(fullName),
      seatRow: row.seat_row,
      seatCol: row.seat_col,
    };
  });
}

async function loadSessions(roster: RosterStudent[], from: string, to: string): Promise<DashboardSession[]> {
  if (!envReady() || roster.length === 0) return [];

  const client = createAdminClient();
  // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리 — 이 세션 목록이 색 집계·최근 흐름·감정 어휘(analysis_runs를
  // 이 세션 id로 조회)·관계 인용으로 전부 흘러가므로 여기서 한 번에 "공용 시드 + 현재 방문자 것"으로 좁힌다.
  let sessionQuery = client
    .from("checkin_sessions")
    .select("id, enrollment_id, session_date, period, attempt, mood_color, status, started_at, transcript, prosody")
    .in("enrollment_id", roster.map((student) => student.enrollmentId))
    .gte("session_date", from)
    .lte("session_date", to)
    .eq("status", "completed");
  const scopeFilter = ownerOrFilter(await getDemoScope());
  if (scopeFilter) sessionQuery = sessionQuery.or(scopeFilter);
  const { data, error } = await sessionQuery.order("session_date").order("started_at");

  if (error) throw error;
  return (data ?? []) as DashboardSession[];
}

function latestColor(
  sessions: DashboardSession[],
  enrollmentId: string,
  dateKey: string,
  period?: CheckinPeriod,
): SignalColor | null {
  const latest = sessions
    .filter((session) => session.enrollment_id === enrollmentId && session.session_date === dateKey)
    .filter((session) => !period || session.period === period)
    .filter((session) => SIGNAL_SET.has(session.mood_color))
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.attempt - a.attempt)[0];

  return latest ? (latest.mood_color as SignalColor) : null;
}

/** 그 시간대에 가장 최근 기록이 쌓인 시각 — 없으면 undefined. 탭 기본값을 정하는 데만 쓴다. */
function latestStartOf(sessions: DashboardSession[], dateKey: string, period: CheckinPeriod): string | undefined {
  return sessions
    .filter((session) => session.session_date === dateKey && session.period === period)
    .map((session) => session.started_at)
    .sort()
    .at(-1);
}

/* 전체 응답 수 = 초록+노랑+빨강+남색. 색마다 무게를 둬서 "흐림 지수"를 만든다
   (초록 0 · 노랑 0.4 · 남색 0.7 · 빨강 1.0).
   흐림지수 = (노랑×0.4 + 남색×0.7 + 빨강×1.0) / 전체 응답 수

   맑음    초록 ≥ 70% AND 빨강 < 10% AND 남색 < 10%
   구름조금 위 맑음이 아니면서, 흐림지수 < 0.35 인 나머지
   흐림    흐림지수 0.35~0.55, 또는 (빨강+남색) ≥ 30%
   비      흐림지수 ≥ 0.55, 또는 빨강 ≥ 30%
   비가 많이 와요  빨강 ≥ 45%  — "비" 조건의 부분집합이라 먼저 검사해야 묻히지 않는다.
   응답이 적어요   응답률(전체 응답 수/학급 인원) < 30% — 다른 판정보다 먼저 가른다. */
function deriveWeather(
  mood: Record<SignalColor, number[]>,
  totalRoster: number,
): Pick<ClassroomWeather, "kind" | "headline" | "support"> {
  const green = mood.green.length;
  const yellow = mood.yellow.length;
  const red = mood.red.length;
  const navy = mood.navy.length;
  const total = green + yellow + red + navy;

  if (totalRoster <= 0 || total / totalRoster < 0.3) {
    return { kind: "quiet", headline: "응답이 적어요", support: "아직 오늘의 마음을 알려준 친구가 많지 않아요." };
  }

  const gloom = (yellow * 0.4 + navy * 0.7 + red * 1.0) / total;
  const greenShare = green / total;
  const redShare = red / total;
  const navyShare = navy / total;

  if (redShare >= 0.45) {
    return { kind: "stormy", headline: "비가 많이 와요", support: "오늘은 마음이 무거운 친구들이 비교적 많이 보여요." };
  }
  if (gloom >= 0.55 || redShare >= 0.3) {
    return { kind: "rainy", headline: "비가 내려요", support: "속상하거나 혼자 있고 싶은 마음이 평소보다 많아요." };
  }
  if (gloom >= 0.35 || redShare + navyShare >= 0.3) {
    return { kind: "cloudy", headline: "조금 흐려요", support: "평소보다 조심스러운 마음이 조금 더 보여요." };
  }
  if (greenShare >= 0.7 && redShare < 0.1 && navyShare < 0.1) {
    return { kind: "sunny", headline: "맑아요", support: "오늘은 편안하고 좋은 마음이 많은 날이에요." };
  }
  return { kind: "partly", headline: "구름이 조금 있어요", support: "대체로 편안하지만, 여러 감정이 함께 보여요." };
}

function buildMood(students: StudentSignal[]): MoodShare[] {
  const checkedIn = students.filter((student) => student.color !== null);
  return SIGNAL_ORDER.map((color) => {
    const matched = checkedIn.filter((student) => student.color === color);
    return {
      color,
      count: matched.length,
      pct: checkedIn.length ? Math.round((matched.length / checkedIn.length) * 1000) / 10 : 0,
      students: matched.map((student) => ({ studentId: student.studentId, name: student.name })),
    };
  });
}

type EmotionRun = { source_id: string; created_at: string; result: unknown };

/** IN 조건 묶음을 이만큼씩 동시에 보낸다 — 세션이 수천 개로 늘어도 한꺼번에 수십 개 요청이 나가지 않게 */
const ANALYSIS_QUERY_CONCURRENCY = 8;

/**
 * 세션들의 감정 어휘 분석(analysis_runs.emotion_vocab) — 아침 브리핑과 감정 어휘 성장 카드가 같은 행을 쓰므로 한 번만 읽는다.
 * source_id는 이미 방문자 스코프로 좁혀진 세션 id라, 여기서 따로 스코프를 걸 필요가 없다(예전과 같다).
 * IN 조건은 URL 길이 때문에 100개씩 나누되, 차례로 기다리지 않고 묶음끼리 동시에 보낸다.
 */
async function loadEmotionRuns(sessionIds: string[]): Promise<EmotionRun[]> {
  if (!envReady() || sessionIds.length === 0) return [];
  const client = createAdminClient();
  const batches: string[][] = [];
  for (let index = 0; index < sessionIds.length; index += ANALYSIS_QUERY_BATCH_SIZE) {
    batches.push(sessionIds.slice(index, index + ANALYSIS_QUERY_BATCH_SIZE));
  }
  const runs: EmotionRun[] = [];
  for (let index = 0; index < batches.length; index += ANALYSIS_QUERY_CONCURRENCY) {
    const results = await Promise.all(
      batches.slice(index, index + ANALYSIS_QUERY_CONCURRENCY).map(async (ids) => {
        const { data, error } = await client
          .from("analysis_runs")
          .select("source_id, created_at, result")
          .eq("analysis_type", ANALYSIS_TYPE)
          .eq("source_type", "session")
          .eq("status", "completed")
          .in("source_id", ids);
        if (error) throw error;
        return (data ?? []) as EmotionRun[];
      }),
    );
    for (const batch of results) runs.push(...batch);
  }
  return runs;
}

function latestSession(sessions: DashboardSession[], enrollmentId: string, date: string, period: CheckinPeriod) {
  return sessions
    .filter((session) => session.enrollment_id === enrollmentId && session.session_date === date && session.period === period)
    .filter((session) => SIGNAL_SET.has(session.mood_color))
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.attempt - a.attempt)[0];
}

function latestMorningHistory(sessions: DashboardSession[], enrollmentId: string, before: string) {
  const byDate = new Map<string, DashboardSession>();
  for (const session of sessions) {
    if (session.enrollment_id !== enrollmentId || session.period !== "morning" || session.session_date >= before) continue;
    if (!SIGNAL_SET.has(session.mood_color)) continue;
    const previous = byDate.get(session.session_date);
    if (!previous || session.started_at > previous.started_at || (session.started_at === previous.started_at && session.attempt > previous.attempt)) {
      byDate.set(session.session_date, session);
    }
  }
  return [...byDate.values()].sort((a, b) => a.session_date.localeCompare(b.session_date));
}

function resultLemmas(result: unknown): { lemma: string; quote?: string }[] {
  const raw = result as { lemmas?: unknown; evidence?: unknown } | null;
  const lemmas = Array.isArray(raw?.lemmas) ? raw.lemmas.map(canonicalize).filter((lemma): lemma is string => lemma !== null) : [];
  const evidence = Array.isArray(raw?.evidence) ? raw.evidence : [];
  return lemmas.map((lemma) => {
    const match = evidence.find((item) => item && typeof item === "object" && canonicalize((item as { lemma?: unknown }).lemma) === lemma) as { quote?: unknown } | undefined;
    return { lemma, ...(typeof match?.quote === "string" ? { quote: match.quote } : {}) };
  });
}

function prosodyRatios(today: DashboardSession | undefined, history: DashboardSession[]) {
  if (!today) return undefined;
  const metric = (session: DashboardSession) => {
    const utterances = (session.prosody as { utterances?: unknown } | null)?.utterances;
    if (!Array.isArray(utterances) || utterances.length === 0) return null;
    const values = utterances.filter((item): item is { duration_sec?: unknown; response_delay_sec?: unknown } => Boolean(item && typeof item === "object"));
    const duration = values.reduce((sum, item) => sum + (typeof item.duration_sec === "number" ? item.duration_sec : 0), 0);
    const delays = values.map((item) => item.response_delay_sec).filter((value): value is number => typeof value === "number" && value >= 0);
    return duration > 0 && delays.length ? { speech: duration, latency: delays.reduce((sum, value) => sum + value, 0) / delays.length } : null;
  };
  const current = metric(today);
  const past = history.map(metric).filter((value): value is { speech: number; latency: number } => value !== null);
  if (!current || past.length < 3) return undefined;
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const speechBase = median(past.map((value) => value.speech));
  const latencyBase = median(past.map((value) => value.latency));
  if (speechBase <= 0 || latencyBase <= 0) return undefined;
  return { speechRatio: current.speech / speechBase, latencyRatio: current.latency / latencyBase };
}

/** emotionRuns·requests는 호출부(getDashboardDataFromSupabase)가 미리, 다른 조회와 동시에 읽어 넘긴다 — 이 함수는 계산만 한다.
    emotionRuns는 브리핑이 보는 세션보다 넓을 수 있지만(감정 어휘 카드와 공유), 아래에서 세션 id로만 꺼내 쓰므로 결과는 같다. */
function buildBriefing(
  roster: RosterStudent[],
  sessions: DashboardSession[],
  dateKey: string,
  conflicts: ConflictRow[],
  emotionRuns: EmotionRun[],
  requests: OpenMeetingRequest[],
): BriefingStudent[] {
  if (!envReady() || roster.length === 0) return [];
  const briefingSessions = sessions.filter((session) => session.session_date >= addDays(dateKey, -BRIEFING_HISTORY_DAYS));
  const emotionBySession = new Map<string, EmotionRun>();
  for (const run of emotionRuns) if (!emotionBySession.get(run.source_id) || emotionBySession.get(run.source_id)!.created_at < run.created_at) emotionBySession.set(run.source_id, run);

  const requestByEnrollment = new Map(requests.sort((a, b) => a.requested_at.localeCompare(b.requested_at)).map((row) => [row.enrollment_id, row]));

  const aliases = roster.map((student) => ({ enrollmentId: student.enrollmentId, aliases: aliasesFor(student.name) }));
  const facts: StudentFacts[] = roster.map((student) => {
    const historySessions = latestMorningHistory(briefingSessions, student.enrollmentId, dateKey);
    const today = latestSession(briefingSessions, student.enrollmentId, dateKey, "morning");
    const todayRun = today ? emotionBySession.get(today.id) : undefined;
    const todayLemmas = todayRun ? resultLemmas(todayRun.result) : [];
    const priorLemmas = new Set(historySessions.flatMap((session) => {
      const run = emotionBySession.get(session.id);
      return run ? resultLemmas(run.result).map((item) => item.lemma) : [];
    }));
    const analyzedSessions = [...historySessions, ...(today ? [today] : [])].filter((session) => emotionBySession.has(session.id));
    let emotionWordGap = 0;
    for (const session of [...analyzedSessions].reverse()) {
      if (resultLemmas(emotionBySession.get(session.id)!.result).length) break;
      emotionWordGap += 1;
    }
    const since = addDays(dateKey, -20);
    const recentTexts = briefingSessions.filter((session) => session.enrollment_id === student.enrollmentId && session.session_date >= since && session.session_date <= dateKey).flatMap((session) => transcriptText(session.transcript));
    const peerMentionGapWeeks = recentTexts.length > 0 && !recentTexts.some((text) => aliases.some((peer) => peer.enrollmentId !== student.enrollmentId && peer.aliases.some((alias) => text.includes(alias)))) ? 3 : null;
    const navyCountLast2Weeks = latestMorningHistory(briefingSessions, student.enrollmentId, addDays(dateKey, 1)).filter((session) => session.session_date >= addDays(dateKey, -13) && session.mood_color === "navy").length;
    const lastConflict = conflicts.filter((conflict) => conflict.pairIds.includes(student.studentId)).sort((a, b) => b.date.localeCompare(a.date))[0];
    const request = requestByEnrollment.get(student.enrollmentId);
    return {
      studentId: student.studentId,
      name: student.name,
      todayColor: today && SIGNAL_SET.has(today.mood_color) ? today.mood_color as SignalColor : null,
      history: historySessions.map((session) => ({ date: session.session_date, color: session.mood_color as SignalColor })),
      ...(request ? { meetingRequest: { requestedOn: toKstDate(request.requested_at), priority: request.priority === "high" ? "high" as const : "normal" as const } } : {}),
      ...(prosodyRatios(today, historySessions) ? { prosody: prosodyRatios(today, historySessions) } : {}),
      ...(lastConflict ? { lastConflict: { date: lastConflict.date, resolved: /완료/.test(lastConflict.status) } } : {}),
      ...(todayRun ? { todayLemmas } : {}),
      ...(todayRun ? { newLemmas: todayLemmas.map((item) => item.lemma).filter((lemma) => isDistressWord(lemma) && !priorLemmas.has(lemma)) } : {}),
      ...(analyzedSessions.length ? { emotionWordGap } : {}),
      ...(peerMentionGapWeeks ? { peerMentionGapWeeks } : {}),
      navyCountLast2Weeks,
    };
  });
  return buildBriefingRows(facts, dateKey, WATCH_LIMIT);
}

function buildParticipation(dateKey: string, roster: RosterStudent[], students: StudentSignal[]): ParticipationSummary {
  const completed = students.filter((student) => student.color !== null);
  return {
    date: dateKey,
    completedCount: completed.length,
    totalCount: roster.length,
    absentStudents: students
      .filter((student) => student.color === null)
      .map((student) => ({ studentId: student.studentId, name: student.name })),
  };
}

function moodIds(students: StudentSignal[]) {
  return Object.fromEntries(
    SIGNAL_ORDER.map((color) => [
      color,
      students.filter((student) => student.color === color).map((student) => student.studentNo),
    ]),
  ) as Record<SignalColor, number[]>;
}

function buildRecentDays(dateKey: string, sessions: DashboardSession[], roster: RosterStudent[]): ClassroomDay[] {
  return recentDays(dateKey, 5).map((date) => {
    const daySignals = roster.map((student) => ({
      ...student,
      color: latestColor(sessions, student.enrollmentId, date),
    }));
    return {
      date: shortDate(date),
      weekday: weekdayOf(date),
      kind: deriveWeather(moodIds(daySignals), daySignals.length).kind as WeatherKind,
      isToday: date === dateKey,
    };
  });
}

function transcriptText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const message = raw as { speaker?: unknown; content?: unknown };
      if (message.speaker !== "student" || typeof message.content !== "string") return null;
      return message.content;
    })
    .filter((content): content is string => Boolean(content));
}

function aliasesFor(name: string): string[] {
  const shortName = givenName(name);
  return [...new Set([name, shortName].filter((alias) => alias.length >= 2))];
}

/** 두 학생 id 를 늘 같은 순서로 이어 붙인 값 — 실제 계산(누가 이어졌는지)은 그대로고,
    구분자만 "::"로 바꿨다. students.id 는 uuid 라 "-"를 이미 포함하고 있어서,
    "-"로 이어 붙이면 나중에 다시 쪼갤 때 안전하지 않다. */
function pairKey(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function buildRelation(
  roster: RosterStudent[],
  sessions: DashboardSession[],
  dateKey: string,
  days: number,
  allConflicts: ConflictRow[],
): RelationGraph {
  const from = addDays(dateKey, -(days - 1));
  const windowSessions = sessions.filter((session) => session.session_date >= from && session.session_date <= dateKey);
  const byEnrollment = new Map(roster.map((student) => [student.enrollmentId, student]));
  const aliases = roster.map((student) => ({ student, aliases: aliasesFor(student.name) }));
  const mentioned = new Map<string, number>(roster.map((student) => [student.studentId, 0]));
  const pairCount = new Map<string, number>();
  type Quote = { from: string; to: string; date: string; text: string };
  const pairQuotes = new Map<string, Quote[]>();

  for (const session of windowSessions) {
    const speaker = byEnrollment.get(session.enrollment_id);
    if (!speaker) continue;

    for (const text of transcriptText(session.transcript)) {
      for (const { student: target, aliases: targetAliases } of aliases) {
        if (target.enrollmentId === speaker.enrollmentId) continue;
        if (!targetAliases.some((alias) => text.includes(alias))) continue;

        mentioned.set(target.studentId, (mentioned.get(target.studentId) ?? 0) + 1);
        const key = pairKey(speaker.studentId, target.studentId);
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);

        const quote = { from: speaker.name, to: target.name, date: session.session_date, text };
        if (!pairQuotes.has(key)) pairQuotes.set(key, []);
        pairQuotes.get(key)!.push(quote);
      }
    }
  }

  // 이 기간 안의 갈등만 — 관계선 계산 방식은 그대로다. 여기서 하는 일은
  // "이 기간(날짜 창)에 낀 갈등이 뭔지" 거르는 것뿐이다.
  const records = allConflicts.filter((c) => c.date >= from && c.date <= dateKey);
  const conflictIds = new Set(records.flatMap((c) => c.pairIds));
  const isConflictPair = (a: string, b: string) =>
    records.some((c) => c.pairIds.includes(a) && c.pairIds.includes(b));

  const ranked = [...roster].sort(
    (a, b) => (mentioned.get(b.studentId) ?? 0) - (mentioned.get(a.studentId) ?? 0) || a.studentNo - b.studentNo,
  );
  // mockData.ts 의 LAYOUT 과 같은 값을 쓴다 (RelationshipMap 의 2단계 원 크기와 안 겹치도록 맞춘 간격).
  const layout = { cx: 330, cy: 190, rings: [{ count: 6, rx: 125, ry: 78 }, { count: 13, rx: 282, ry: 150 }] };

  const nodes = ranked.map((student, rank) => {
    let x = layout.cx;
    let y = layout.cy;
    if (rank > 0) {
      const ring = rank <= layout.rings[0].count ? layout.rings[0] : layout.rings[1];
      const index = rank <= layout.rings[0].count ? rank - 1 : rank - 1 - layout.rings[0].count;
      const angle = -Math.PI / 2 + (index / ring.count) * Math.PI * 2;
      x = Math.round(layout.cx + Math.cos(angle) * ring.rx);
      y = Math.round(layout.cy + Math.sin(angle) * ring.ry);
    }
    const count = mentioned.get(student.studentId) ?? 0;
    return {
      studentId: student.studentId,
      name: student.name,
      x,
      y,
      r: Math.min(28, 12 + Math.max(0, Math.min(count, 4)) * 4),
      tone: count === 0 ? ("isolated" as const) : conflictIds.has(student.studentId) ? ("conflict" as const) : ("normal" as const),
    };
  });

  const strongest = Math.max(...pairCount.values(), 1);
  const edges = [...pairCount].map(([key, count]) => {
    const [fromId, toId] = key.split("::");
    return {
      from: fromId,
      to: toId,
      kind: isConflictPair(fromId, toId) ? ("conflict" as const) : ("normal" as const),
      strength: count / strongest,
    };
  });
  // 갈등은 서로 언급이 없어도(발화에 이름이 안 나와도) 반드시 선으로 보여야 한다
  for (const c of records) {
    const [a, b] = c.pairIds;
    if (!edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a))) {
      edges.push({ from: a, to: b, kind: "conflict", strength: 0.5 });
    }
  }

  // 아이 한 명의 대화 발췌 — 그 아이가 낀 관계선 전부에서 모은다.
  // 예전에는 "그 아이 이름이 나온 대목 중 최근 3개"만 보여서, 최근 3개가 한 친구 이야기면
  // 관계선이 여러 개여도 그 친구 이야기만 떴다. 이제 관계(짝)마다 최근 것을 골라 담는다.
  // 그 아이가 말한 것(누구를 언급했나)과 그 아이가 언급된 것(누가 말했나)을 둘 다 담는다 —
  // 지도의 선은 방향 없이 이야기가 오갔다는 뜻이라, 한쪽만 담으면 선이 있는데 근거가 없는 경우가 생긴다.
  const QUOTES_PER_PAIR = 2;
  const quotesOf = (studentId: string) =>
    [...pairQuotes]
      .filter(([key]) => key.split("::").includes(studentId))
      .flatMap(([, quotes]) => quotes.slice(-QUOTES_PER_PAIR))
      .sort((a, b) => b.date.localeCompare(a.date));

  const details = Object.fromEntries(
    roster.map((student) => [
      student.studentId,
      {
        studentId: student.studentId,
        name: student.name,
        mentionCount: mentioned.get(student.studentId) ?? 0,
        quotes: quotesOf(student.studentId),
        conflicts: records.filter((c) => c.pairIds.includes(student.studentId)),
      },
    ]),
  );

  const byId = new Map(roster.map((student) => [student.studentId, student]));
  // 갈등만 있고 서로 언급은 없는 짝도 상세 패널이 있어야 한다 (mockData.ts 의 같은 처리 참고)
  const pairKeys = new Set([...pairQuotes.keys(), ...records.map((c) => pairKey(...c.pairIds))]);
  const pairs = Object.fromEntries(
    [...pairKeys].map((key) => {
      const [a, b] = key.split("::");
      const studentA = byId.get(a)!;
      const studentB = byId.get(b)!;
      const quotes = pairQuotes.get(key) ?? [];
      return [
        key,
        {
          a: { studentId: studentA.studentId, name: studentA.name },
          b: { studentId: studentB.studentId, name: studentB.name },
          mentionCount: quotes.length,
          quotes: quotes.slice().reverse().slice(0, 4),
          conflicts: records.filter((c) => pairKey(...c.pairIds) === key),
        },
      ];
    }),
  );

  return { nodes, edges, details, pairs, conflicts: records };
}

/** 감정 어휘 성장 — 실제 analysis_runs(emotion_vocab) 결과만 쓴다. mock 폴백 없음.
    "count"(누적 어휘 종류 수)와 "trend"(달말 학급 평균)의 뜻은 lib/vocab/aggregate.ts 의
    aggregateVocab 이 정하고, route.ts(app/api/ai/vocab-growth)도 같은 함수를 쓴다 —
    대시보드와 그 API가 "평균"을 서로 다르게 계산하면 같은 날 다른 숫자가 나온다.
    분석이 아직 없는 세션은 그냥 "표제어 0개"로 잡힌다 — 평균을 0으로 깎아내리지 않으려면
    호출부에서 분석 진행 상황(pending)을 따로 보여줘야 하지만, 지금 카드는 그 자리가 없어
    숫자만 정직하게 낮게 나온다("분석 대기" 문구는 UI 변경 없이는 넣을 곳이 없다). */
export async function buildVocab(
  roster: RosterStudent[],
  sessions: DashboardSession[],
  dateKey: string,
  /** 이미 읽어 둔 감정 어휘 분석(아침 브리핑과 공유). 안 넘기면 여기서 읽는다 */
  preloadedRuns?: EmotionRun[],
): Promise<DashboardData["vocab"]> {
  const withTranscript = sessions.filter((session) => session.transcript !== null && session.session_date <= dateKey);
  if (roster.length === 0) {
    return { students: [], trend: [{ month: monthLabel(dateKey.slice(0, 7)), average: 0 }] };
  }
  if (!envReady() || withTranscript.length === 0) {
    return {
      students: roster.map((student) => ({ studentId: student.studentId, name: student.name, shortName: student.shortName, count: 0, delta: 0, words: [] })),
      trend: [{ month: monthLabel(dateKey.slice(0, 7)), average: 0 }],
    };
  }

  const runs = preloadedRuns ?? (await loadEmotionRuns(withTranscript.map((session) => session.id)));

  const lemmasBySession = new Map<string, string[]>();
  for (const run of runs) {
    const raw = (run.result as { lemmas?: unknown })?.lemmas;
    const lemmas = Array.isArray(raw) ? raw.map(canonicalize).filter((lemma): lemma is string => lemma !== null) : [];
    lemmasBySession.set(run.source_id, lemmas);
  }

  const studentIdByEnrollment = new Map(roster.map((student) => [student.enrollmentId, student.studentId]));

  // 표제어를 처음 쓴 날짜(누적 집합 계산용) — aggregateVocab 이 count/delta/trend 를 셀 때 쓴다.
  // 여기서는 그 결과에 없는 "실제로 쓴 낱말 목록"(막대 툴팁용)만 따로 모은다.
  const firstSeen = new Map<string, Map<string, string>>();
  const perSession: SessionLemmas<string>[] = [];
  for (const session of withTranscript) {
    const studentId = studentIdByEnrollment.get(session.enrollment_id);
    if (!studentId) continue;
    const lemmas = lemmasBySession.get(session.id) ?? [];
    perSession.push({ studentId, date: session.session_date, lemmas });

    if (!firstSeen.has(studentId)) firstSeen.set(studentId, new Map());
    const seen = firstSeen.get(studentId)!;
    for (const lemma of lemmas) if (!seen.has(lemma)) seen.set(lemma, session.session_date);
  }

  const rosterRef = roster.map((student) => ({ studentId: student.studentId, name: student.name }));
  const { students: aggregated, trend } = aggregateVocab(rosterRef, perSession, dateKey);

  const shortNameOf = new Map(roster.map((student) => [student.studentId, student.shortName]));
  const students: VocabStudent[] = aggregated.map((stat) => ({
    ...stat,
    shortName: shortNameOf.get(stat.studentId),
    words: [...(firstSeen.get(stat.studentId)?.keys() ?? [])],
  }));

  return { students, trend };
}

/** 실제 갈등 기록 — work_records(record_type='conflict') + work_record_students(관련 학생) +
    conflict_statements(학생 발화 근거)를 그대로 읽는다. mock 의 4건짜리 갈등 목록을 대신한다.
    "장난"이라는 낱말만으로 갈등이라 판단하지 않는다 — 애초에 이 record_type='conflict' 로
    분류하는 판단 자체를 만들 때(스크립트로 1회 처리) 그 기준을 적용했고, 여기서는 이미
    분류된 결과를 그대로 읽기만 한다(이 화면은 읽기 전용이다). */
async function loadConflicts(classId: string): Promise<ConflictRow[]> {
  if (!envReady()) return [];
  const client = createAdminClient();

  // (2026-09-20, 이지현 제안) 공개 데모 방문자 격리 — 이 함수는 class_id만으로 갈등 기록을 전부 읽었다. 방문자에게는
  // "내가 쓴 것 + (담임이 썼고 시드로 확인된 것)"만 보이게 한다(recordVisible, 1093과 같은 규칙). 스코프가 꺼져 있으면 그대로.
  // 구현은 dashboardScope.ts(스코프를 인자로 받아 실제 DB 대조 테스트가 가능하다).
  const records = await loadVisibleConflictRecords(client, classId, await getDemoScope());
  if (!records.length) return [];

  const recordIds = records.map((r) => r.id);

  // 관련 학생 연결과 진술은 서로 무관하다 — 동시에 읽는다
  const [
    { data: links, error: linksError },
    { data: statementRows, error: statementsError },
  ] = await Promise.all([
    client.from("work_record_students").select("work_record_id, enrollment_id").in("work_record_id", recordIds),
    client
      .from("conflict_statements")
      .select("work_record_id, speaker_label, content, created_at")
      .in("work_record_id", recordIds)
      .order("created_at"),
  ]);
  if (linksError) throw linksError;
  if (statementsError) throw statementsError;
  // conflict_statements 는 speaker_label 을 자유 텍스트로 남기므로 tone 색은 따로 없다 —
  // RelationDetailPane 의 STATEMENT_COLOR.muted 로 통일해 둔다(색으로 판정을 덧붙이지 않는다).

  const enrollmentIds = [...new Set((links ?? []).map((l) => l.enrollment_id))];
  // 학생 이름도 같은 조회에서 함께 읽는다 (loadRoster와 같은 임베드)
  const { data: enrollments, error: enrollError } = await client
    .from("enrollments")
    .select("id, student_id, students(display_name)")
    .in("id", enrollmentIds.length ? enrollmentIds : ["00000000-0000-0000-0000-000000000000"]);
  if (enrollError) throw enrollError;
  const studentIdByEnrollment = new Map((enrollments ?? []).map((e) => [e.id, e.student_id as string]));

  const linksByRecord = new Map<string, string[]>();
  for (const link of links ?? []) {
    const studentId = studentIdByEnrollment.get(link.enrollment_id);
    if (!studentId) continue;
    if (!linksByRecord.has(link.work_record_id)) linksByRecord.set(link.work_record_id, []);
    linksByRecord.get(link.work_record_id)!.push(studentId);
  }
  const statementsByRecord = new Map<string, { who: string; text: string }[]>();
  for (const row of statementRows ?? []) {
    if (!statementsByRecord.has(row.work_record_id)) statementsByRecord.set(row.work_record_id, []);
    statementsByRecord.get(row.work_record_id)!.push({ who: row.speaker_label, text: row.content });
  }

  const nameOf = new Map<string, string>();
  for (const e of enrollments ?? []) {
    nameOf.set(e.student_id, (e.students as { display_name?: string } | null)?.display_name ?? "");
  }

  const rows: ConflictRow[] = [];
  for (const record of records) {
    const pairIds = linksByRecord.get(record.id) ?? [];
    // 진술이 없거나 학생이 정확히 둘로 연결되지 않은 기록은 지도에 올리지 않는다 —
    // (봉인 전 진술 입력이 막혀 진술 없이 남은 시도분이 있을 수 있다. 그런 기록은 조용히 건너뛴다.)
    if (pairIds.length !== 2) continue;
    const statements = statementsByRecord.get(record.id) ?? [];
    if (!statements.length) continue;

    const date = toKstDate(record.occurred_at);
    rows.push({
      date,
      label: `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`,
      pair: pairIds.map((id) => nameOf.get(id) ?? "이름 없음").join(" ↔ "),
      pairIds: [pairIds[0], pairIds[1]],
      summary: record.title,
      // 담임 중재·화해가 기록에 있으면 완료로, 아직이면 확인 중으로 — 두 표현 다 mock 이 쓰던 것과 같다.
      status: /화해|사과|중재/.test(record.body) ? "담임 중재 완료" : "진술 확인 중",
      statements: statements.map((s) => ({ who: s.who, tone: "muted" as const, text: s.text })),
    });
  }
  return rows;
}

function buildClassroomPeriod(
  roster: RosterStudent[],
  sessions: DashboardSession[],
  dateKey: string,
  period: CheckinPeriod,
): ClassroomPeriod {
  const students: StudentSignal[] = roster.map((student) => ({
    ...student,
    color: latestColor(sessions, student.enrollmentId, dateKey, period),
  }));
  const weather = deriveWeather(moodIds(students), students.length);
  // 질문 문장은 탭 위에 고정으로 뜨는 카드 인사말이라 등교/하교 둘 다 같은 문장을 쓴다
  const question = "우리 반 마음에는 어떤 날씨가 찾아왔을까요?";
  return { weather: { ...weather, question }, mood: buildMood(students) };
}

async function loadOpenRequests(roster: RosterStudent[]): Promise<OpenMeetingRequest[]> {
  if (!envReady() || roster.length === 0) return [];
  return loadOpenMeetingRequests(createAdminClient(), roster.map((student) => student.enrollmentId), await getDemoScope());
}

export async function getDashboardDataFromSupabase(classId: string, dateKey: string): Promise<DashboardData> {
  const roster = await loadRoster(classId);

  // 아래 세 조회는 서로 무관하다(명단만 있으면 된다) — 차례로 기다리지 않고 동시에 보낸다.
  //  · 세션: 감정 어휘는 관계 지도의 "최근 N일" 창과 달리 학기 시작 이후 누적이라 90일보다 앞선 세션도 셀 수 있어야 한다.
  //    그래서 넓게 한 번만 읽고, 브리핑·관계 지도가 쓰는 최근 90일은 아래에서 그 결과를 잘라 쓴다(같은 조건이라 같은 행이다).
  //  · 갈등 기록
  //  · 열린 상담 신청 — (2026-09-20, 이지현 제안) 공개 데모 방문자 격리: enrollment 단위로 읽으면 방문자 전원이 같은 학생(민준)을
  //    공유해서 다른 방문자의 신청이 섞인다. source_session_id의 부모 세션 소유자로 좁힌다: "공용 시드 세션 + 현재 방문자 세션"만
  //    (checkins/meetingRequests.ts와 같은 규칙). 세션이 없는 신청은 소유자를 못 가려서 방문자에게는 안 보인다(fail-closed).
  //    구현은 dashboardScope.ts(스코프를 인자로 받아 실제 DB 대조 테스트가 가능하다).
  const [vocabSessions, conflicts, requests] = await Promise.all([
    loadSessions(roster, VOCAB_HISTORY_START, dateKey),
    loadConflicts(classId),
    loadOpenRequests(roster),
  ]);
  // 브리핑의 개인 기준선·친구 언급 규칙은 최근 이력이 필요하다. 관계 지도보다 넓은 90일을 쓴다.
  const sessionsFrom = addDays(dateKey, -89);
  const sessions = vocabSessions.filter((session) => session.session_date >= sessionsFrom);
  const students: StudentSignal[] = roster.map((student) => ({
    ...student,
    color: latestColor(sessions, student.enrollmentId, dateKey),
  }));

  // 아침 브리핑과 감정 어휘 카드가 같은 분석 행을 쓴다 — 한 번만(묶음끼리는 동시에) 읽는다
  const emotionRuns = await loadEmotionRuns(vocabSessions.map((session) => session.id));

  const relation = Object.fromEntries(
    RELATION_PERIODS.map((period) => [
      period.id,
      buildRelation(roster, sessions, dateKey, period.days, conflicts),
    ]),
  ) as Record<RelationPeriod, RelationGraph>;

  // 탭 기본값 — 그날 더 최근에 기록이 쌓인 시간대. 아직 둘 다 없으면 등교부터 보여준다
  // (학교 하루가 등교로 시작하니, 텅 빈 하교 탭을 먼저 보여줄 이유가 없다).
  const morningLatest = latestStartOf(sessions, dateKey, "morning");
  const afternoonLatest = latestStartOf(sessions, dateKey, "afternoon");
  const defaultPeriod: CheckinPeriod =
    afternoonLatest && (!morningLatest || afternoonLatest > morningLatest) ? "afternoon" : "morning";

  return {
    dateKey,
    isToday: dateKey === dashboardToday(),
    briefing: { watch: buildBriefing(roster, sessions, dateKey, conflicts, emotionRuns, requests) },
    classroom: {
      periods: {
        morning: buildClassroomPeriod(roster, sessions, dateKey, "morning"),
        afternoon: buildClassroomPeriod(roster, sessions, dateKey, "afternoon"),
      },
      defaultPeriod,
      delta: "학생들의 오늘 응답을 기준으로 집계했어요.",
      recentDays: buildRecentDays(dateKey, sessions, roster),
    },
    participation: buildParticipation(dateKey, roster, students),
    relation,
    // "누적"(가장 넓은 기간) 그래프의 갈등 목록을 폴백으로 쓴다 — 옆 패널이 아무도 안 고른 동안 보여주는 값.
    conflicts: relation.all.conflicts,
    vocab: await buildVocab(roster, vocabSessions, dateKey, emotionRuns),
  };
}

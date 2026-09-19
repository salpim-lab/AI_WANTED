import { addDays, todayKst } from "@/components/shared/datetime";
import { givenName } from "@/components/shared/names";
import { getDemoScope, ownerOrFilter } from "@/lib/demo/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SignalColor } from "@/lib/types/signal";
import { canonicalize } from "@/lib/vocab/lexicon";
import { getDashboardSnapshot } from "@/components/teacher/dashboard/mockData";

type WeatherKind = "sunny" | "partly" | "cloudy" | "rainy";
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
  pairIds: [number, number];
  summary: string;
  status: string;
  statements: { who: string; tone: SignalColor | "muted"; text: string }[];
};
type RelationGraph = {
  nodes: {
    studentId: number;
    name: string;
    x: number;
    y: number;
    r: number;
    tone: "normal" | "conflict" | "isolated";
  }[];
  edges: { from: number; to: number; kind: "normal" | "conflict"; strength: number }[];
  details: Record<number, {
    studentId: number;
    name: string;
    mentionCount: number;
    quotes: { from: string; date: string; text: string }[];
    conflicts: ConflictRow[];
  }>;
  pairs: Record<string, {
    a: { studentId: number; name: string };
    b: { studentId: number; name: string };
    mentionCount: number;
    quotes: { from: string; date: string; text: string }[];
    conflicts: ConflictRow[];
  }>;
  conflicts: ConflictRow[];
};
type VocabStudent = {
  studentId: number;
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
    weather: ClassroomWeather;
    delta: string;
    mood: MoodShare[];
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
};

type StudentSignal = RosterStudent & { color: SignalColor | null };

const TONE_STATUS: Record<SignalColor, { status: string; reason: string }> = {
  green: { status: "안정", reason: "오늘 응답을 안정적으로 마쳤어요." },
  yellow: { status: "조금 살피기", reason: "오늘 응답에서 흔들림 신호가 보여요." },
  red: { status: "우선 확인", reason: "오늘 응답에서 속상함 신호가 강하게 나왔어요." },
  navy: { status: "거리 필요", reason: "오늘은 혼자 있고 싶은 마음을 표현했어요." },
};

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

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

  return (data ?? []).map((row, index) => {
    const shortName = (row.students as { display_name?: string } | null)?.display_name ?? "이름 없음";
    return {
      studentNo: index + 1,
      studentId: row.student_id,
      enrollmentId: row.id,
      name: shortName,
      shortName,
      seatRow: row.seat_row,
      seatCol: row.seat_col,
    };
  });
}

function withFullNames(roster: RosterStudent[], dateKey: string): RosterStudent[] {
  const mockNames = new Map(
    getDashboardSnapshot(dateKey).vocab.students.map((student) => [student.studentId, student.name]),
  );
  return roster.map((student) => {
    const mockName = mockNames.get(student.studentNo);
    return {
      ...student,
      name: mockName ? `${mockName.slice(0, -2)}${student.shortName}` : student.shortName,
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
    .select("id, enrollment_id, session_date, period, attempt, mood_color, status, started_at, transcript")
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

function latestColor(sessions: DashboardSession[], enrollmentId: string, dateKey: string): SignalColor | null {
  const latest = sessions
    .filter((session) => session.enrollment_id === enrollmentId && session.session_date === dateKey)
    .filter((session) => SIGNAL_SET.has(session.mood_color))
    .sort((a, b) => b.started_at.localeCompare(a.started_at) || b.attempt - a.attempt)[0];

  return latest ? (latest.mood_color as SignalColor) : null;
}

function deriveWeather(mood: Record<SignalColor, number[]>): Pick<ClassroomWeather, "kind" | "headline"> {
  const green = mood.green.length;
  const yellow = mood.yellow.length;
  const red = mood.red.length;
  const anchored = green + yellow + red;
  if (anchored === 0) return { kind: "cloudy", headline: "아직 응답이 적어요" };

  const score = (green + yellow * 0.5) / anchored;
  const redShare = red / anchored;
  if (redShare >= 0.45) return { kind: "rainy", headline: "비가 오는 분위기예요" };
  if (redShare >= 0.3) return { kind: "cloudy", headline: "먹구름이 조금 모였어요" };
  if (score >= 0.8) return { kind: "sunny", headline: "맑은 기운이 많아요" };
  if (score >= 0.7) return { kind: "partly", headline: "대체로 맑아요" };
  if (score >= 0.55) return { kind: "partly", headline: "구름이 조금 있어요" };
  if (score >= 0.35) return { kind: "cloudy", headline: "흐린 신호가 보여요" };
  return { kind: "rainy", headline: "비가 오는 분위기예요" };
}

function buildMood(students: StudentSignal[]): MoodShare[] {
  const checkedIn = students.filter((student) => student.color !== null);
  return SIGNAL_ORDER.map((color) => {
    const matched = checkedIn.filter((student) => student.color === color);
    return {
      color,
      count: matched.length,
      pct: checkedIn.length ? Math.round((matched.length / checkedIn.length) * 1000) / 10 : 0,
      students: matched.map((student) => ({ studentId: student.studentNo, name: student.name })),
    };
  });
}

function buildBriefing(students: StudentSignal[]): BriefingStudent[] {
  return students
    .filter((student): student is StudentSignal & { color: SignalColor } => student.color !== null && student.color !== "green")
    .sort((a, b) => {
      const priority: Record<SignalColor, number> = { red: 0, navy: 1, yellow: 2, green: 3 };
      return priority[a.color] - priority[b.color] || a.studentNo - b.studentNo;
    })
    .slice(0, WATCH_LIMIT)
    .map((student) => ({
      studentId: student.studentNo,
      name: student.name,
      tone: student.color,
      ...TONE_STATUS[student.color],
    }));
}

function buildParticipation(dateKey: string, roster: RosterStudent[], students: StudentSignal[]): ParticipationSummary {
  const completed = students.filter((student) => student.color !== null);
  return {
    date: dateKey,
    completedCount: completed.length,
    totalCount: roster.length,
    absentStudents: students
      .filter((student) => student.color === null)
      .map((student) => ({ studentId: student.studentNo, name: student.name })),
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
      kind: deriveWeather(moodIds(daySignals)).kind as WeatherKind,
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

function pairKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function replaceNames(text: string, mockNames: Map<number, string>, roster: RosterStudent[]) {
  return [...mockNames.entries()].reduce((result, [studentNo, mockName]) => {
    const name = roster.find((student) => student.studentNo === studentNo)?.name;
    return name ? result.split(mockName).join(name) : result;
  }, text);
}

function buildMockRelation(roster: RosterStudent[], dateKey: string): Record<RelationPeriod, RelationGraph> {
  const snapshot = getDashboardSnapshot(dateKey);
  const mockNames = new Map(snapshot.relation.all.nodes.map((node) => [node.studentId, node.name]));
  const nameFor = (studentNo: number) => roster.find((student) => student.studentNo === studentNo)?.name ?? "이름 없음";
  const mapConflict = (conflict: ConflictRow) => ({
    ...conflict,
    pair: conflict.pairIds.map(nameFor).join(" · "),
    statements: conflict.statements.map((statement) => ({
      ...statement,
      who: replaceNames(statement.who, mockNames, roster),
      text: replaceNames(statement.text, mockNames, roster),
    })),
  });

  return Object.fromEntries(
    RELATION_PERIODS.map(({ id }) => {
      const graph = snapshot.relation[id];
      const conflicts = graph.conflicts.slice(0, 4).map(mapConflict);
      return [
        id,
        {
          nodes: graph.nodes.map((node) => ({ ...node, name: nameFor(node.studentId) })),
          edges: graph.edges,
          details: Object.fromEntries(
            Object.entries(graph.details).map(([studentNo, detail]) => [
              studentNo,
              {
                ...detail,
                name: nameFor(detail.studentId),
                quotes: detail.quotes.map((quote) => ({ ...quote, from: replaceNames(quote.from, mockNames, roster), text: replaceNames(quote.text, mockNames, roster) })),
                conflicts: detail.conflicts.map(mapConflict),
              },
            ]),
          ),
          pairs: Object.fromEntries(
            Object.entries(graph.pairs).map(([key, pair]) => [
              key,
              {
                ...pair,
                a: { ...pair.a, name: nameFor(pair.a.studentId) },
                b: { ...pair.b, name: nameFor(pair.b.studentId) },
                quotes: pair.quotes.map((quote) => ({ ...quote, from: replaceNames(quote.from, mockNames, roster), text: replaceNames(quote.text, mockNames, roster) })),
                conflicts: pair.conflicts.map(mapConflict),
              },
            ]),
          ),
          conflicts,
        } satisfies RelationGraph,
      ];
    }),
  ) as Record<RelationPeriod, RelationGraph>;
}

export function buildRelation(roster: RosterStudent[], sessions: DashboardSession[], dateKey: string, days: number): RelationGraph {
  const from = addDays(dateKey, -(days - 1));
  const windowSessions = sessions.filter((session) => session.session_date >= from && session.session_date <= dateKey);
  const byEnrollment = new Map(roster.map((student) => [student.enrollmentId, student]));
  const aliases = roster.map((student) => ({ student, aliases: aliasesFor(student.name) }));
  const mentioned = new Map<number, number>(roster.map((student) => [student.studentNo, 0]));
  const pairCount = new Map<string, number>();
  const studentQuotes = new Map<number, { from: string; date: string; text: string }[]>(
    roster.map((student) => [student.studentNo, []]),
  );
  const pairQuotes = new Map<string, { from: string; date: string; text: string }[]>();

  for (const session of windowSessions) {
    const speaker = byEnrollment.get(session.enrollment_id);
    if (!speaker) continue;

    for (const text of transcriptText(session.transcript)) {
      for (const { student: target, aliases: targetAliases } of aliases) {
        if (target.enrollmentId === speaker.enrollmentId) continue;
        if (!targetAliases.some((alias) => text.includes(alias))) continue;

        mentioned.set(target.studentNo, (mentioned.get(target.studentNo) ?? 0) + 1);
        const key = pairKey(speaker.studentNo, target.studentNo);
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);

        const quote = { from: speaker.name, date: session.session_date, text };
        studentQuotes.get(target.studentNo)!.push(quote);
        if (!pairQuotes.has(key)) pairQuotes.set(key, []);
        pairQuotes.get(key)!.push(quote);
      }
    }
  }

  const ranked = [...roster].sort(
    (a, b) => (mentioned.get(b.studentNo) ?? 0) - (mentioned.get(a.studentNo) ?? 0) || a.studentNo - b.studentNo,
  );
  const layout = { cx: 330, cy: 190, rings: [{ count: 6, rx: 148, ry: 82 }, { count: 13, rx: 268, ry: 142 }] };

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
    const count = mentioned.get(student.studentNo) ?? 0;
    return {
      studentId: student.studentNo,
      name: student.name,
      x,
      y,
      r: Math.min(28, 12 + Math.max(0, Math.min(count, 4)) * 4),
      tone: count === 0 ? ("isolated" as const) : ("normal" as const),
    };
  });

  const strongest = Math.max(...pairCount.values(), 1);
  const edges = [...pairCount].map(([key, count]) => {
    const [fromId, toId] = key.split("-").map(Number);
    return { from: fromId, to: toId, kind: "normal" as const, strength: count / strongest };
  });

  const details = Object.fromEntries(
    roster.map((student) => [
      student.studentNo,
      {
        studentId: student.studentNo,
        name: student.name,
        mentionCount: mentioned.get(student.studentNo) ?? 0,
        quotes: (studentQuotes.get(student.studentNo) ?? []).slice().reverse().slice(0, 3),
        conflicts: [],
      },
    ]),
  );

  const pairs = Object.fromEntries(
    [...pairQuotes].map(([key, quotes]) => {
      const [a, b] = key.split("-").map(Number);
      const studentA = roster.find((student) => student.studentNo === a)!;
      const studentB = roster.find((student) => student.studentNo === b)!;
      return [
        key,
        {
          a: { studentId: studentA.studentNo, name: studentA.name },
          b: { studentId: studentB.studentNo, name: studentB.name },
          mentionCount: quotes.length,
          quotes: quotes.slice().reverse().slice(0, 4),
          conflicts: [],
        },
      ];
    }),
  );

  return { nodes, edges, details, pairs, conflicts: [] };
}

export async function buildVocab(roster: RosterStudent[], sessions: DashboardSession[], dateKey: string): Promise<DashboardData["vocab"]> {
  const withTranscript = sessions.filter((session) => session.transcript !== null && session.session_date <= dateKey);
  if (!envReady() || roster.length === 0 || withTranscript.length === 0) {
    return {
      students: roster.map((student) => ({ studentId: student.studentNo, name: student.name, count: 0, delta: 0, words: [] })),
      trend: [{ month: monthLabel(dateKey.slice(0, 7)), average: 0 }],
    };
  }

  const client = createAdminClient();
  const runs = [] as { source_id: string; result: unknown }[];
  const sourceIds = withTranscript.map((session) => session.id);
  for (let index = 0; index < sourceIds.length; index += ANALYSIS_QUERY_BATCH_SIZE) {
    const { data, error } = await client
      .from("analysis_runs")
      .select("source_id, result")
      .eq("analysis_type", ANALYSIS_TYPE)
      .eq("source_type", "session")
      .eq("status", "completed")
      .in("source_id", sourceIds.slice(index, index + ANALYSIS_QUERY_BATCH_SIZE));

    if (error) throw error;
    runs.push(...((data ?? []) as { source_id: string; result: unknown }[]));
  }

  const lemmasBySession = new Map<string, string[]>();
  for (const run of runs) {
    const raw = (run.result as { lemmas?: unknown })?.lemmas;
    const lemmas = Array.isArray(raw) ? raw.map(canonicalize).filter((lemma): lemma is string => lemma !== null) : [];
    lemmasBySession.set(run.source_id, lemmas);
  }

  const firstSeen = new Map<number, Map<string, string>>();
  const studentNoByEnrollment = new Map(roster.map((student) => [student.enrollmentId, student.studentNo]));
  for (const session of withTranscript) {
    const studentNo = studentNoByEnrollment.get(session.enrollment_id);
    if (!studentNo) continue;
    if (!firstSeen.has(studentNo)) firstSeen.set(studentNo, new Map());
    const seen = firstSeen.get(studentNo)!;
    for (const lemma of lemmasBySession.get(session.id) ?? []) {
      if (!seen.has(lemma)) seen.set(lemma, session.session_date);
    }
  }

  const currentMonth = dateKey.slice(0, 7);
  const students: VocabStudent[] = roster.map((student) => {
    const seen = firstSeen.get(student.studentNo) ?? new Map<string, string>();
    const words = [...seen.keys()];
    return {
      studentId: student.studentNo,
      name: student.name,
      count: words.length,
      delta: [...seen.values()].filter((date) => date.slice(0, 7) === currentMonth).length,
      words,
    };
  });

  const months = [...new Set(withTranscript.map((session) => session.session_date.slice(0, 7)))].sort();
  const trend: VocabMonth[] = (months.length ? months : [currentMonth]).map((ym) => {
    const total = roster.reduce((sum, student) => {
      const seen = firstSeen.get(student.studentNo);
      if (!seen) return sum;
      return sum + [...seen.values()].filter((date) => date.slice(0, 7) <= ym).length;
    }, 0);
    return { month: monthLabel(ym), average: Math.round((total / roster.length) * 10) / 10 };
  });

  return { students, trend };
}

async function buildDashboardVocab(roster: RosterStudent[], dateKey: string) {
  const mockVocab = getDashboardSnapshot(dateKey).vocab;
  const latestMinjunLemmas = await loadLatestMinjunLemmas(roster, dateKey);

  const students = mockVocab.students.map((student) => {
    const rosterStudent = roster.find((item) => item.studentNo === student.studentId);
    const shortName = rosterStudent?.shortName ?? student.name.slice(-2);
    const fullName = rosterStudent?.name ?? `${student.name.slice(0, -2)}${shortName}`;
    if (student.studentId !== 1) {
      return { ...student, name: fullName, shortName };
    }

    const addedWords = latestMinjunLemmas.filter((word) => !student.words.includes(word));
    return {
      ...student,
      name: fullName,
      shortName,
      count: student.count + addedWords.length,
      delta: student.delta + addedWords.length,
      words: [...student.words, ...addedWords],
    };
  });

  return {
    students,
    trend: mockVocab.trend.map((month, index) =>
      index === mockVocab.trend.length - 1 ? { ...month, average: 10.4 } : month,
    ),
  };
}

async function loadLatestMinjunLemmas(roster: RosterStudent[], dateKey: string): Promise<string[]> {
  const minjun = roster.find((student) => student.studentNo === 1);
  if (!envReady() || !minjun) return [];

  const client = createAdminClient();
  // (2026-09-20, 이지현 제안) "민준의 가장 최근 세션 하나"를 고르는 단계부터 방문자 스코프를 건다 — 안 그러면
  // 다른 방문자가 방금 한 체크인의 어휘가 이 방문자 대시보드에 뜬다. 이어지는 analysis_runs 조회는 이렇게
  // 고른 세션 id로만 하므로 같이 격리된다.
  let latestQuery = client
    .from("checkin_sessions")
    .select("id")
    .eq("enrollment_id", minjun.enrollmentId)
    .eq("status", "completed")
    .lte("session_date", dateKey);
  const scopeFilter = ownerOrFilter(await getDemoScope());
  if (scopeFilter) latestQuery = latestQuery.or(scopeFilter);
  const { data: latest, error: latestError } = await latestQuery
    .order("session_date", { ascending: false })
    .order("started_at", { ascending: false })
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latest) return [];

  const { data, error } = await client
    .from("analysis_runs")
    .select("result")
    .eq("analysis_type", ANALYSIS_TYPE)
    .eq("source_type", "session")
    .eq("status", "completed")
    .eq("source_id", latest.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  const lemmas = (data?.result as { lemmas?: unknown } | null)?.lemmas;
  return Array.isArray(lemmas)
    ? lemmas.map(canonicalize).filter((lemma): lemma is string => lemma !== null)
    : [];
}

export async function getDashboardDataFromSupabase(classId: string, dateKey: string): Promise<DashboardData> {
  const roster = withFullNames(await loadRoster(classId), dateKey);
  const maxRelationDays = Math.max(...RELATION_PERIODS.map((period) => period.days));
  const sessions = await loadSessions(roster, addDays(dateKey, -(maxRelationDays - 1)), dateKey);
  const students: StudentSignal[] = roster.map((student) => ({
    ...student,
    color: latestColor(sessions, student.enrollmentId, dateKey),
  }));

  const weather = deriveWeather(moodIds(students));
  const relation = buildMockRelation(roster, dateKey);

  return {
    dateKey,
    isToday: dateKey === dashboardToday(),
    briefing: { watch: buildBriefing(students) },
    classroom: {
      weather: {
        ...weather,
        question: "우리 반 마음에는 어떤 날씨가 찾아왔을까요?",
        support: "오늘 응답을 모아 본 분위기예요.",
      },
      delta: "학생들의 오늘 응답을 기준으로 집계했어요.",
      mood: buildMood(students),
      recentDays: buildRecentDays(dateKey, sessions, roster),
    },
    participation: buildParticipation(dateKey, roster, students),
    relation,
    conflicts: relation.all.conflicts,
    vocab: await buildDashboardVocab(roster, dateKey),
  };
}

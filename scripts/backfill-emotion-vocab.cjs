/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module loader uses CommonJS. */
// 김민준을 제외한 19명의 기존 transcript를 emotion_vocab으로 분석해 analysis_runs에 저장한다.
// route.ts(app/api/ai/vocab-growth)의 핵심 로직(extractVocab + analysis_runs insert)을 그대로 재사용한다 —
// 다만 교사 로그인 세션 없이 서비스 롤 키로 전체 학급을 한 번에 처리하기 위한 배치 스크립트다.
//
// 원칙:
//   - 김민준(student_id로 식별, index 아님)은 절대 건드리지 않는다 — 대상에서 아예 뺀다.
//   - 이미 emotion_vocab 분석이 있는 세션은 다시 부르지 않는다.
//   - transcript 원문(checkin_sessions.transcript)은 읽기만 하고 쓰지 않는다.
// Usage: node scripts/backfill-emotion-vocab.cjs
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file)); cache.set(file, m);
  const normal = m.require.bind(m);
  m.require = id => id === 'server-only' ? {} : id.startsWith('@/') ? load(path.join(root, 'src', id.slice(2)) + '.ts')
    : id.startsWith('.') ? load(path.resolve(path.dirname(file), id) + '.ts') : normal(id);
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return m.exports;
}
process.loadEnvFile(path.join(root, '.env.local'));
const { extractVocab } = load('src/lib/openai/extractVocab.ts');
const { parseTranscript } = load('src/lib/supabase/raw/wholeTranscript.ts');
const { VOCAB_EXTRACT_PROMPT_VERSION } = load('src/lib/openai/prompts/vocab-extract.ts');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const CLASS_ID = '20000000-0000-4000-8000-000000000001';
const MINJUN_NAME = '김민준';
const ANALYSIS_TYPE = 'emotion_vocab';
/** 동시에 몇 세션까지 LLM을 부를지 — 너무 높이면 429가 난다 */
const CONCURRENCY = 4;

async function get(p) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: H });
  if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`);
  return r.json();
}
async function post(table, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`insert ${table} 실패: ${r.status} ${await r.text()}`);
  return r.json();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

(async () => {
  const students = await get('students?select=id,display_name');
  const nameOf = new Map(students.map(s => [s.id, s.display_name]));
  const minjunId = students.find(s => s.display_name === MINJUN_NAME)?.id;
  if (!minjunId) throw new Error('김민준을 찾지 못했습니다 — 중단');

  const enrollments = await get(`enrollments?select=id,student_id&class_id=eq.${CLASS_ID}&ended_on=is.null`);
  const targetEnrollments = enrollments.filter(e => e.student_id !== minjunId);
  const studentOfEnrollment = new Map(enrollments.map(e => [e.id, e.student_id]));

  console.log(`대상: ${targetEnrollments.length}명 (김민준 제외, id=${minjunId} 스킵)`);

  const sessions = await get(
    `checkin_sessions?select=id,enrollment_id,session_date&status=eq.completed&transcript=not.is.null` +
    `&enrollment_id=in.(${targetEnrollments.map(e => e.id).join(',')})&order=session_date`
  );
  console.log(`transcript 있는 세션: ${sessions.length}건`);

  // 이미 분석된 세션은 건너뛴다 — batch로 나눠 조회 (in 절 길이 제한 대비)
  const done = new Set();
  for (let i = 0; i < sessions.length; i += 150) {
    const chunk = sessions.slice(i, i + 150);
    const cached = await get(
      `analysis_runs?select=source_id&analysis_type=eq.${ANALYSIS_TYPE}&source_type=eq.session&status=eq.completed` +
      `&source_id=in.(${chunk.map(s => s.id).join(',')})`
    );
    cached.forEach(c => done.add(c.source_id));
  }
  let pending = sessions.filter(s => !done.has(s.id));
  if (process.env.BACKFILL_LIMIT) pending = pending.slice(0, Number(process.env.BACKFILL_LIMIT));
  console.log(`이미 분석됨: ${done.size}건 / 새로 분석할 것: ${pending.length}건\n`);

  // transcript 는 이 단계에서 개별 조회 (한 번에 다 끌고 오면 응답이 너무 크다)
  let okCount = 0, failCount = 0;
  const perStudent = new Map(); // studentId -> {count, sessions}

  await mapLimit(pending, CONCURRENCY, async (session, idx) => {
    try {
      const [full] = await get(`checkin_sessions?select=transcript&id=eq.${session.id}`);
      const messages = parseTranscript(full.transcript);
      const hits = await extractVocab(messages);
      const lemmas = hits.map(h => h.lemma);

      await post('analysis_runs', {
        analysis_type: ANALYSIS_TYPE,
        source_type: 'session',
        source_id: session.id,
        provider: 'openai',
        model: process.env.OPENAI_VOCAB_MODEL || process.env.OPENAI_ITEM_MODEL || 'gpt-4.1-mini',
        prompt_version: VOCAB_EXTRACT_PROMPT_VERSION,
        status: 'completed',
        result: { lemmas, evidence: hits },
      });

      const studentId = studentOfEnrollment.get(session.enrollment_id);
      const name = nameOf.get(studentId);
      if (!perStudent.has(studentId)) perStudent.set(studentId, { name, count: 0 });
      perStudent.get(studentId).count += 1;
      okCount++;
      if (okCount % 20 === 0) console.log(`  진행: ${okCount + failCount}/${pending.length} (성공 ${okCount}, 실패 ${failCount})`);
    } catch (e) {
      failCount++;
      console.log(`  !! 실패 session=${session.id} (${session.session_date}):`, e.message.slice(0, 200));
    }
  });

  console.log(`\n=== 완료: 성공 ${okCount}건, 실패 ${failCount}건 ===`);
  for (const [id, v] of perStudent) console.log(`  ${v.name}: 새로 분석 ${v.count}건`);
})().catch(e => { console.error('스크립트 실패:', e); process.exit(1); });

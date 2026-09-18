/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module loader uses CommonJS. */
// 감정 어휘 성장 파이프라인을 DB 없이 끝까지 돌려본다.
//   OPENAI_API_KEY 가 있으면 실제 추출까지, 없으면 표에 적힌 표제어로 집계만 확인한다.
// Usage: node scripts/try-vocab-growth.cjs
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
const { aggregateVocab } = load('src/lib/vocab/aggregate.ts');

const say = (content) => ({ speaker: 'student', content, input_method: 'text' });
const ask = (content) => ({ speaker: 'assistant', content, input_method: 'text' });

// 같은 아이의 7월 → 9월. 말수가 아니라 "쓰는 말의 종류"가 늘어야 지표가 오른다.
// expect 는 사람이 읽고 판단한 정답 — 추출 결과와 비교해 프롬프트를 조인다.
const SESSIONS = [
  { studentId: 1, name: '김민준', date: '2026-07-06',
    expect: ['좋다'],
    messages: [ask('오늘 하루는 어땠어?'), say('그냥 좋았어요.'), ask('어떤 게 좋았어?'), say('몰라요. 그냥요.')] },
  { studentId: 1, name: '김민준', date: '2026-08-24',
    expect: ['짜증나다', '재미있다'],
    messages: [ask('오늘 하루는 어땠어?'), say('수학 시간에 문제가 안 풀려서 짜증났어요.'), ask('그랬구나. 다른 시간은 어땠어?'), say('체육은 재밌었어요.')] },
  { studentId: 1, name: '김민준', date: '2026-09-16',
    expect: ['억울하다', '속상하다', '긴장되다'],
    messages: [ask('오늘 하루는 어땠어?'), say('점심시간에 서연이랑 부딪혔는데 저만 혼나서 억울했어요.'), ask('억울했구나. 그 뒤엔 어땠어?'), say('계속 속상했어요. 오후에 발표할 때는 가슴이 쿵쾅거렸어요.')] },

  { studentId: 2, name: '이서연', date: '2026-07-06',
    expect: ['좋다', '싫다'],
    messages: [ask('오늘 하루는 어땠어?'), say('좋았어요.'), ask('기억에 남는 일 있어?'), say('급식은 싫었어요.')] },
  { studentId: 2, name: '이서연', date: '2026-09-16',
    // "민준이가 화났어요"는 남의 감정이라 세지 않는다. 부정형 "안 좋았어요"도 '좋다'가 아니다.
    expect: ['부끄럽다', '고맙다'],
    messages: [ask('오늘 하루는 어땠어?'), say('민준이가 화났어요. 저는 기분이 안 좋았어요.'), ask('그랬구나. 또 있었어?'), say('발표할 때 애들이 다 봐서 부끄러웠어요. 근데 채원이가 잘했다고 해줘서 고마웠어요.')] },
];

const ROSTER = [...new Map(SESSIONS.map(s => [s.studentId, { studentId: s.studentId, name: s.name }])).values()];
const AS_OF = '2026-09-16';

(async () => {
  const hasKey = !!process.env.OPENAI_API_KEY?.trim();
  console.log(hasKey ? '— OPENAI_API_KEY 있음: 실제 추출을 돌립니다.\n' : '— OPENAI_API_KEY 없음: expect 값으로 집계만 확인합니다.\n');

  const extracted = [];
  for (const s of SESSIONS) {
    const lemmas = hasKey ? (await extractVocab(s.messages)).map(h => h.lemma) : s.expect;
    extracted.push({ studentId: s.studentId, date: s.date, lemmas });
    const missed = s.expect.filter(e => !lemmas.includes(e));
    const extra = lemmas.filter(l => !s.expect.includes(l));
    console.log(`${s.date} ${s.name}`);
    console.log(`   추출: ${lemmas.join(', ') || '(없음)'}`);
    if (hasKey && (missed.length || extra.length))
      console.log(`   차이: ${missed.length ? '놓침 ' + missed.join(', ') : ''} ${extra.length ? '추가 ' + extra.join(', ') : ''}`);
  }

  const { students, trend } = aggregateVocab(ROSTER, extracted, AS_OF);
  console.log(`\n— ${AS_OF} 기준 집계 (코드가 계산, LLM은 관여하지 않음)`);
  for (const s of students) console.log(`   ${s.name}  누적 ${s.count}개  이번 달 신규 +${s.delta}`);
  console.log(`   추이: ${trend.map(t => `${t.month} ${t.average}`).join('  ')}`);
})().catch(e => { console.error('실패:', e.message); process.exit(1); });

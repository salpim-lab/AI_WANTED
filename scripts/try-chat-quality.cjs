/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module loader uses CommonJS. */
// 학생 채팅 응답 품질을 눈으로 확인한다. 실제 프롬프트·요청 빌더·파서를 그대로 쓰고 Claude 만 부른다.
//
// ⚠️ DB 에 아무것도 쓰지 않는다(세션·기록 없음). 드는 것은 AI 호출 비용뿐이다(12문장 × 2호출).
//    학생 화면을 직접 눌러 보면 봉인돼 지워지지 않는 체크인 세션이 남으므로, 문장만 볼 때는 이걸 쓴다.
// 실행: node scripts/try-chat-quality.cjs
//       CHAT_MODEL=claude-haiku-4-5-20251001 node scripts/try-chat-quality.cjs
// 키: .env.local 의 ANTHROPIC_API_KEY. 발화를 바꾸려면 아래 cases 를 고친다.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  cache.set(file, m);
  const normal = m.require.bind(m);
  m.require = id => {
    if (id === 'server-only') return {};
    if (id.startsWith('@/')) return load(path.join(root, 'src', id.slice(2)) + '.ts');
    if (id.startsWith('.') && !id.endsWith('.js')) return load(path.resolve(path.dirname(file), id) + '.ts');
    return normal(id);
  };
  m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return m.exports;
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')
    .filter(line => /^[A-Z_]+=/.test(line))
    .map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim()]; }),
);
const turn = load('src/lib/chat/chatTurn.ts');
const A = (content) => ({ speaker: 'assistant', content, input_method: 'fixed' });
const S = (content) => ({ speaker: 'student', content, input_method: 'voice' });
const post = async (body) => (await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
  body: JSON.stringify(body),
})).json();

// [흐름, 마음 색, 대화]. 색과 상황을 골고루 섞었다. 마지막 하나는 위험 신호 확인용.
const cases = [
  ['checkin', 'green', [A('오늘 마음은 초록이구나. 무슨 일이 있었어?'), S('오늘 급식에 제가 좋아하는 돈까스가 나와요!')]],
  ['checkin', 'green', [A('기분 좋은 일이 있었나 봐?'), S('어제 축구하다가 제가 골 넣었어요.')]],
  ['checkin', 'yellow', [A('오늘 마음은 노랑이네. 어때?'), S('그냥 별로 할 말 없어요.')]],
  ['checkin', 'yellow', [A('오늘은 어땠어?'), S('아침에 엄마가 좀 화냈어요.')]],
  ['checkin', 'red', [A('마음이 안 좋구나. 무슨 일이 있었어?'), S('어제 친구랑 싸웠는데 아직 안 풀렸어요.')]],
  ['checkin', 'red', [A('무슨 일이 있었어?'), S('몰라요 그냥 다 짜증나요.')]],
  ['checkin', 'navy', [A('혼자 있고 싶은 마음이구나.'), S('네... 그냥 조용히 있고 싶어요.')]],
  ['checkout', 'green', [A('오늘 하루는 어땠어?'), S('체육 시간에 피구했는데 제가 마지막까지 남아서 이겼어요!')]],
  ['checkout', 'yellow', [A('오늘 하루 어땠어?'), S('음... 수학 시간에 좀 졸렸어요.')]],
  ['checkout', 'red', [A('오늘 속상한 일이 있었구나.'), S('쉬는 시간에 같이 놀자고 했는데 친구가 안 놀아줬어요.')]],
  ['checkout', 'red', [A('무슨 일이 있었어?'), S('쉬는 시간에 친구가 놀아줬는데 재미있었어요.'), A('그때 마음이 어땠어?'), S('신났는데 끝나고 좀 아쉬웠어요.')]],
  ['checkin', 'red', [A('무슨 일이 있었어?'), S('집에서 아빠가 자꾸 때려요. 무서워서 집에 가기 싫어요.')]],
];

(async () => {
  if (!env.ANTHROPIC_API_KEY) { console.error('.env.local 에 ANTHROPIC_API_KEY 가 없습니다.'); process.exit(1); }
  console.log('모델:', process.env.CHAT_MODEL || `(기본값 ${turn.DEFAULT_CHAT_MODEL})`, '\n');
  for (const [flow, color, transcript] of cases) {
    const studentTurns = transcript.filter(m => m.speaker === 'student').length;
    const started = Date.now();
    const [a, b] = await Promise.all([
      post(turn.buildChatTurnRequest({ flow, color, transcript, turnCount: studentTurns, studentName: '민준' })),
      post(turn.buildRiskCheckRequest({ transcript })),
    ]);
    let out;
    try { out = turn.parseChatTurn(JSON.parse(turn.readClaudeText(a).text)); } catch (e) { out = { reply: `(파싱 실패) ${e.message}`, sufficient: null }; }
    let risk = '?';
    try { risk = turn.parseRiskCheck(JSON.parse(turn.readClaudeText(b).text)); } catch { /* 표시만 한다 */ }
    const last = transcript.filter(m => m.speaker === 'student').pop().content;
    // 위험이면 화면에는 교사 전달 문구가 나가고 여기 문장은 쓰이지 않는다 — 비어 있어도 정상이다
    console.log(`[${flow === 'checkin' ? '등교' : '하교'}/${color}${studentTurns > 1 ? ' 2턴' : ''}] 아이: ${last}`);
    console.log(`   살핌: ${out.reply}   (충분=${out.sufficient}, 위험=${risk}, ${Date.now() - started}ms)\n`);
  }
})();

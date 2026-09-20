/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module loader uses CommonJS. */
// 학생 채팅 응답 품질을 눈으로 확인한다. 실제 프롬프트·요청 빌더·파서를 그대로 쓰고 Claude 만 부른다.
//
// ⚠️ DB 에 아무것도 쓰지 않는다(세션·기록 없음). 드는 것은 AI 호출 비용뿐이다(문장 수 × 2호출).
//    학생 화면을 직접 눌러 보면 봉인돼 지워지지 않는 체크인 세션이 남으므로, 문장만 볼 때는 이걸 쓴다.
// 실행: node scripts/try-chat-quality.cjs
//       CHAT_MODEL=claude-haiku-4-5-20251001 node scripts/try-chat-quality.cjs
//       ONLY="발표,시험" node scripts/try-chat-quality.cjs     (그 낱말이 든 발화만)
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
  // ── 더 넓게 본 발화들 ──
  ['checkin', 'green', [A('기분 좋은 일이 있었나 봐?'), S('오늘 생일이라서 엄마가 미역국 끓여줬어요.')]],
  ['checkin', 'green', [A('오늘 마음은 초록이구나.'), S('시험 100점 맞았어요!!')]],
  ['checkin', 'green', [A('무슨 일이 있었어?'), S('강아지가 저 보고 막 꼬리 흔들었어요.')]],
  ['checkin', 'yellow', [A('오늘 마음은 어때?'), S('배가 좀 고파요.')]],
  ['checkin', 'yellow', [A('무슨 일이 있었어?'), S('오늘 발표해야 되는데 좀 떨려요.')]],
  ['checkin', 'yellow', [A('오늘은 어땠어?'), S('숙제를 다 못 했어요.')]],
  ['checkin', 'red', [A('마음이 안 좋구나.'), S('동생이 제 장난감을 망가뜨렸어요.')]],
  ['checkin', 'red', [A('무슨 일이 있었어?'), S('어제 게임을 못 하게 해서 화났어요.')]],
  ['checkin', 'red', [A('무슨 일이 있었어?'), S('머리가 아파요. 어제 잠도 잘 못 잤어요.')]],
  ['checkin', 'navy', [A('혼자 있고 싶은 마음이구나.'), S('그냥... 말하기 싫어요.')]],
  ['checkin', 'navy', [A('알겠어, 조용히 있고 싶구나.'), S('요즘 학교 오는 게 좀 힘들어요.')]],
  ['checkout', 'green', [A('오늘 하루는 어땠어?'), S('짝꿍이랑 같이 그림 그렸는데 엄청 재밌었어요.')]],
  ['checkout', 'green', [A('오늘 어땠어?'), S('선생님이 저 칭찬해 주셨어요.')]],
  ['checkout', 'yellow', [A('오늘 하루 어땠어?'), S('그냥 그랬어요. 별일 없었어요.')]],
  ['checkout', 'yellow', [A('오늘은 어땠어?'), S('급식에 싫어하는 반찬이 나와서 좀 그랬어요.')]],
  ['checkout', 'red', [A('오늘 속상한 일이 있었구나.'), S('체육 시간에 제가 공을 놓쳐서 우리 팀이 졌어요.')]],
  ['checkout', 'red', [A('무슨 일이 있었어?'), S('짝이 제 필통을 말도 없이 가져갔어요.')]],
  ['checkout', 'navy', [A('오늘도 조용히 있고 싶었구나.'), S('네. 오늘도 그냥 피곤했어요.')]],
  ['checkout', 'red', [A('무슨 일이 있었어?'), S('친구들이 저만 빼고 놀았어요.'), A('그때 어떤 마음이 들었어?'), S('좀 외로웠어요.')]],
  ['checkin', 'yellow', [A('오늘 마음은 어때?'), S('내일 시험인데 걱정돼요.')]],
  ['checkin', 'green', [A('기분 좋은 일이 있었나 봐?'), S('내일 소풍 가요! 너무 기대돼요.')]],
  ['checkin', 'green', [A('무슨 일이 있었어?'), S('주말에 가족이랑 놀이공원 갔어요.'), A('갔을 때 마음이 어땠어?'), S('롤러코스터 탔는데 무서웠지만 재밌었어요.')]],
];

const replies = [];
// ONLY="발표,시험" 처럼 주면 그 낱말이 들어간 발화만 돌린다 — 한도를 아끼려고 일부만 볼 때 쓴다
const only = (process.env.ONLY || '').split(',').map(w => w.trim()).filter(Boolean);
const picked = only.length ? cases.filter(([, , t]) => only.some(w => JSON.stringify(t).includes(w))) : cases;
(async () => {
  if (!env.ANTHROPIC_API_KEY) { console.error('.env.local 에 ANTHROPIC_API_KEY 가 없습니다.'); process.exit(1); }
  console.log('모델:', process.env.CHAT_MODEL || `(기본값 ${turn.DEFAULT_CHAT_MODEL})`, '\n');
  for (const [flow, color, transcript] of picked) {
    const studentTurns = transcript.filter(m => m.speaker === 'student').length;
    const started = Date.now();
    const [a, b] = await Promise.all([
      post(turn.buildChatTurnRequest({ flow, color, transcript, turnCount: studentTurns, studentName: '민준' })),
      post(turn.buildRiskCheckRequest({ transcript })),
    ]);
    let out;
    // 본문이 비어 있으면 API 오류(한도 초과 429 등)다. 이유를 그대로 보여 준다
    const apiError = a.error ? `${a.error.type}: ${a.error.message}` : '';
    try { out = turn.parseChatTurn(JSON.parse(turn.readClaudeText(a).text)); } catch (e) { out = { reply: `(실패) ${apiError || e.message}`, sufficient: null }; }
    // 사용 한도를 넘었으면 더 부르지 않는다 — 남은 호출도 전부 실패하고 비용·한도만 쓴다
    if (/usage limits/.test(apiError)) { console.error(`\n중단: ${apiError}`); process.exit(2); }
    let risk = '?';
    try { risk = turn.parseRiskCheck(JSON.parse(turn.readClaudeText(b).text)); } catch { /* 표시만 한다 */ }
    const last = transcript.filter(m => m.speaker === 'student').pop().content;
    // 위험이면 화면에는 교사 전달 문구가 나가고 여기 문장은 쓰이지 않는다 — 비어 있어도 정상이다
    console.log(`[${flow === 'checkin' ? '등교' : '하교'}/${color}${studentTurns > 1 ? ' 2턴' : ''}] 아이: ${last}`);
    console.log(`   살핌: ${out.reply}   (충분=${out.sufficient}, 위험=${risk}, ${Date.now() - started}ms)\n`);
    if (out.reply && !out.reply.startsWith('(실패)') && risk !== 'flag') replies.push(out.reply);
  }
  // 얼마나 다양한가 — 길이 분포와 질문 끝맺음(마지막 어절)이 몰리는 정도
  const lens = replies.map(r => r.length);
  const endings = replies.map(r => (r.match(/[^\s?]+\?$/) || [''])[0]);
  const count = endings.reduce((m, e) => m.set(e, (m.get(e) || 0) + 1), new Map());
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e, n]) => `${e} ${n}회`).join(', ');
  console.log(`요약: ${replies.length}개 · 길이 ${Math.min(...lens)}~${Math.max(...lens)}자(평균 ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}) · 질문 끝맺음 ${count.size}종 · 많이 쓰인 끝맺음: ${top}`);
})();

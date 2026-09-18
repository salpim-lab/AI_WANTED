/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module loader uses CommonJS. */
// 학생 대화 로직 오프라인 검사. 키를 읽지 않고 네트워크를 쓰지 않는다.
// 실행: node scripts/test-student-chat.cjs
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');
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

const openers = load('src/lib/chat/openers.ts');
const gates = load('src/lib/chat/gates.ts');
const prosody = load('src/lib/chat/prosody.ts');
const turn = load('src/lib/chat/chatTurn.ts');

let n = 0;
const t = (name, fn) => { fn(); n += 1; };

// ── 첫 질문 ───────────────────────────────────────────────
t('모든 색·흐름에 첫 질문이 있다', () => {
  for (const flow of ['checkin', 'checkout']) {
    for (const color of ['green', 'yellow', 'red', 'navy']) {
      const s = openers.pickOpener(flow, color, new Date('2026-09-18'));
      assert.ok(s && s.length > 5, `${flow}/${color} 비어 있음`);
    }
  }
});

t('같은 날은 같은 문장이 나온다 (새로고침해도 안 바뀐다)', () => {
  const a = openers.pickOpener('checkin', 'red', new Date('2026-09-18T08:00:00'));
  const b = openers.pickOpener('checkin', 'red', new Date('2026-09-18T15:00:00'));
  assert.equal(a, b);
});

t('요일이 다르면 문장이 돈다', () => {
  const seen = new Set();
  for (let d = 0; d < 7; d += 1) {
    seen.add(openers.pickOpener('checkin', 'green', new Date(2026, 8, 13 + d)));
  }
  assert.ok(seen.size >= 2, '변주가 없다');
});

t('남색은 "왜 혼자 있고 싶은지" 를 묻지 않는다', () => {
  for (const flow of ['checkin', 'checkout']) {
    for (const s of openers.OPENERS[flow].navy) {
      assert.ok(!/왜.*혼자|혼자.*왜/.test(s), `남색 문구가 이유를 캐묻는다: ${s}`);
      assert.ok(/어땠|어떤 하루/.test(s), `남색도 하루를 물어야 한다: ${s}`);
    }
  }
});

// ── 게이트 ────────────────────────────────────────────────
const base = { turnCount: 0, avoidanceCount: 0, risk: 'none', sufficient: false };

t('위험 신호는 다른 모든 조건보다 우선한다', () => {
  assert.equal(gates.decideNext({ ...base, risk: 'flag' }).action, 'handoff_to_teacher');
  // 아직 1턴이라 "한 번 더 물어보자" 가 끼어들면 안 된다
  assert.equal(
    gates.decideNext({ turnCount: 0, avoidanceCount: 0, risk: 'flag', sufficient: false }).action,
    'handoff_to_teacher');
  // 충분하다고 판단됐어도 위험이 우선이다
  assert.equal(
    gates.decideNext({ turnCount: 1, avoidanceCount: 0, risk: 'flag', sufficient: true }).action,
    'handoff_to_teacher');
});

t('회피 2회면 종료', () => {
  const d = gates.decideNext({ ...base, avoidanceCount: 2 });
  assert.deepEqual(d, { action: 'close', reason: 'avoidance' });
});

t('2턴이면 무조건 종료', () => {
  const d = gates.decideNext({ ...base, turnCount: 2, sufficient: false });
  assert.deepEqual(d, { action: 'close', reason: 'max_turns' });
});

t('충분하면 더 묻지 않는다', () => {
  const d = gates.decideNext({ ...base, turnCount: 1, sufficient: true });
  assert.deepEqual(d, { action: 'close', reason: 'sufficient' });
});

t('부족하면 한 번 더 묻는다', () => {
  assert.equal(gates.decideNext({ ...base, turnCount: 1 }).action, 'ask_followup');
});

t('회피 표현을 잡고, 길게 설명한 말은 회피로 보지 않는다', () => {
  assert.ok(gates.looksAvoidant('몰라요'));
  assert.ok(gates.looksAvoidant('말하기 싫어요'));
  assert.ok(gates.looksAvoidant('   '));
  assert.ok(!gates.looksAvoidant('그냥 오늘 체육 시간에 친구가 공을 세게 던져서 좀 놀랐어요'));
});

// ── 파생 수치 ─────────────────────────────────────────────
t('무음 구간을 센다 — 짧은 멈칫은 세지 않는다', () => {
  // 100ms 간격, 무음 최소 700ms → 7샘플 이상이어야 1회
  const short = [1, 1, 0, 0, 0, 1, 1];            // 300ms 멈칫
  assert.equal(prosody.countSilences(short, 100).silence_count, 0);
  const long = [1, 1, ...Array(8).fill(0), 1];     // 800ms 무음
  assert.equal(prosody.countSilences(long, 100).silence_count, 1);
});

t('음량은 소리난 구간만 평균한다', () => {
  // 무음까지 넣으면 오래 쉰 아이가 작게 말한 것으로 잡힌다
  assert.equal(prosody.meanLoudness([0, 0, 0, 0.5, 0.5]), 0.5);
  assert.equal(prosody.meanLoudness([0, 0]), 0);
});

t('한국어 음절 수를 센다', () => {
  assert.equal(prosody.countSyllables('친구랑 싸웠어요'), 7);
  assert.equal(prosody.countSyllables('음... 그냥!!'), 3);  // 음·그·냥
  assert.equal(prosody.syllablesPerSec('가나다라', 2), 2);
});

// ── 요청/응답 계약 ────────────────────────────────────────
t('요청은 네트워크 없이 만들어지고 store:false 다', () => {
  const req = turn.buildChatTurnRequest({
    flow: 'checkin', color: 'red', turnCount: 1,
    transcript: [{ speaker: 'assistant', content: '무슨 일 있었어?', input_method: 'fixed' }],
  });
  assert.equal(req.store, false);
  assert.equal(req.text.format.strict, true);
  assert.ok(req.max_output_tokens <= 200, '출력 상한이 없으면 비용이 샌다');
  assert.ok(req.instructions.includes('캐묻지 않는다'));
});

t('정상 응답을 파싱한다', () => {
  const out = turn.parseChatTurn({ reply: '그랬구나.', sufficient: false, risk: 'none' });
  assert.deepEqual(out, { reply: '그랬구나.', sufficient: false, risk: 'none' });
});

t('위험 표시가 붙으면 AI 문장을 버린다', () => {
  // 캐묻거나 위로하는 말이 섞이면 진술이 오염된다
  const out = turn.parseChatTurn({ reply: '누가 그랬어? 괜찮아질 거야', sufficient: false, risk: 'flag' });
  assert.equal(out.reply, '');
  assert.equal(out.risk, 'flag');
  assert.equal(out.sufficient, true);
});

t('잘못된 응답은 거부한다', () => {
  for (const bad of [null, {}, { reply: 1, sufficient: true, risk: 'none' },
                     { reply: 'x', sufficient: 'yes', risk: 'none' },
                     { reply: 'x', sufficient: true, risk: 'danger' }]) {
    // 메시지 문구가 아니라 에러 코드로 확인한다 — 문구는 바뀔 수 있다
    assert.throws(() => turn.parseChatTurn(bad), (e) => e.code === 'INVALID_AI_OUTPUT');
  }
});

t('종료 문구가 모든 사유에 있다', () => {
  for (const r of ['sufficient', 'max_turns', 'avoidance']) {
    assert.ok(gates.CLOSING_MESSAGES[r]);
  }
  assert.ok(gates.HANDOFF_MESSAGE.includes('선생님'));
});

console.log(`PASS: ${n} checks — 첫 질문 변주, 게이트 우선순위, 파생 수치, 요청/응답 계약. 네트워크·키 사용 없음.`);

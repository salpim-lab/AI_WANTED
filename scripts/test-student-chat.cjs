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
const hints = load('src/lib/chat/hints.ts');
const stepUrl = load('src/components/student/useStepUrl.ts');
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

t('등교 첫 질문이 "어제" 로만 한정되지 않는다', () => {
  // 오늘 아침 일이나 지금 마음도 말할 자리가 있어야 한다
  const all = Object.values(openers.OPENERS.checkin).flat();
  const yesterday = all.filter((s) => s.includes('어제')).length;
  assert.ok(yesterday <= 2, `"어제" 로 묻는 첫 질문이 ${yesterday}개다`);
});

t('첫 질문 안에서 같은 어미가 잇달아 나오지 않는다', () => {
  // "빨강이구나. 오늘 하루가 힘들었구나." 는 끄덕임을 두 번 하는 말투라 우스웠다
  const ending = (x) => (x.match(/(구나|네|보네|싶네|봐|같아|있지)$/) || [''])[0];
  for (const flow of ['checkin', 'checkout']) {
    for (const list of Object.values(openers.OPENERS[flow])) {
      for (const s of list) {
        const parts = s.split(/[.!?\n,]+/).map((x) => x.replace(/[^가-힣 ]/g, '').trim()).filter(Boolean);
        for (let i = 1; i < parts.length; i++) {
          const a = ending(parts[i - 1]), b = ending(parts[i]);
          const nod = (e) => e === '구나' || e === '네';
          assert.ok(!(a && b && nod(a) && nod(b)), `어미가 겹친다: ${s}`);
        }
      }
    }
  }
});

t('첫 질문은 아이 하루를 짐작해 평가하지 않고, 초록은 힘든 일을 전제하지 않는다', () => {
  for (const flow of ['checkin', 'checkout']) {
    for (const [color, list] of Object.entries(openers.OPENERS[flow])) {
      for (const s of list) {
        // "괜찮았나 봐" "힘든가 봐" "하루였나 싶네" "안 좋은 것 같아" — 어른이 아이 하루를 매기는 말투
        assert.ok(!/나 봐|가 봐|나 싶네|것 같아/.test(s), `짐작하는 말투: ${s}`);
        if (color === 'green') assert.ok(!s.includes('털어놓'), `초록에 "털어놓고": ${s}`);
      }
    }
  }
});

t('힌트는 한 문장으로 이어 읽히고, 조사가 받침에 맞는다', () => {
  assert.equal(hints.hintSentence(['속상했던 일', '오늘 아침에 있었던 일', '지금 마음']), '속상했던 일이나 오늘 아침에 있었던 일, 지금 마음을 이야기해도 좋아');
  assert.equal(hints.hintSentence(['오늘 하루', '지금 마음', '하고 싶은 말']), '오늘 하루나 지금 마음, 하고 싶은 말을 이야기해도 좋아');
  assert.equal(hints.hintSentence(['지금 마음', '하고 싶은 말']), '지금 마음이나 하고 싶은 말을 이야기해도 좋아');
});

t('학생 단계와 주소가 서로 맞는다', () => {
  for (const base of ['/checkin', '/checkout']) {
    for (let step = 1; step <= 5; step++) {
      const path = stepUrl.pathForStep(base, step);
      assert.equal(stepUrl.stepFromPath(base, path), step, `${base} ${step}단계 ↔ ${path}`);
    }
  }
  assert.equal(stepUrl.pathForStep('/checkin', 1), '/checkin');
  assert.equal(stepUrl.pathForStep('/checkin', 3), '/checkin/talk');
  // 모르는 주소·끝 슬래시는 홈 / 제대로 읽는다
  assert.equal(stepUrl.stepFromPath('/checkin', '/checkin/nope'), 1);
  assert.equal(stepUrl.stepFromPath('/checkout', '/checkout/island/'), 5);
});

t('남색은 "왜 혼자 있고 싶은지" 를 묻지 않는다', () => {
  for (const flow of ['checkin', 'checkout']) {
    for (const s of openers.OPENERS[flow].navy) {
      assert.ok(!/왜.*혼자|혼자.*왜/.test(s), `남색 문구가 이유를 캐묻는다: ${s}`);
      // 남색이 도피처가 되지 않게 하루나 지금 마음을 묻는지 본다("어제" 로 한정할 필요는 없다)
      assert.ok(/어때|어땠|어떻게|어떤 하루/.test(s), `남색도 하루나 마음을 물어야 한다: ${s}`);
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

t('첫 턴에는 충분해 보여도 한 번 더 묻는다', () => {
  // 모델이 한마디에도 sufficient 를 자주 붙인다. 그대로 두면 한 턴 만에 끝나고
  // 그날 남는 재료가 거의 없다. 뒤따르는 모든 화면이 이 대화를 원재료로 쓴다.
  const d = gates.decideNext({ ...base, turnCount: 1, sufficient: true });
  assert.deepEqual(d, { action: 'ask_followup' });
});

t('둘째 턴부터는 충분하면 종료', () => {
  const d = gates.decideNext({ ...base, turnCount: 2, sufficient: true });
  // 2턴 상한이 먼저 걸리므로 max_turns 로 닫힌다. 어느 쪽이든 종료다.
  assert.equal(d.action, 'close');
});

t('첫 턴이라도 회피·위험은 먼저 막는다', () => {
  assert.deepEqual(
    gates.decideNext({ ...base, turnCount: 1, sufficient: true, avoidanceCount: 2 }),
    { action: 'close', reason: 'avoidance' },
  );
  assert.deepEqual(
    gates.decideNext({ ...base, turnCount: 1, sufficient: true, risk: 'flag' }),
    { action: 'handoff_to_teacher' },
  );
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
t('요청은 네트워크 없이 Claude(Messages API) 모양으로 만들어진다', () => {
  const req = turn.buildChatTurnRequest({
    flow: 'checkin', color: 'red', turnCount: 1,
    transcript: [{ speaker: 'assistant', content: '무슨 일 있었어?', input_method: 'fixed' }],
  });
  assert.ok(req.model.startsWith('claude-'), `Claude 모델이어야 한다: ${req.model}`);
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.format.schema, turn.CHAT_TURN_SCHEMA);
  assert.ok(req.max_tokens <= 400, '출력 상한이 없으면 비용이 샌다');
  assert.ok(req.system.includes('캐묻지 않는다'));
  assert.equal(req.messages[0].role, 'user');
  assert.equal(req.temperature, 0.5);
  assert.equal('instructions' in req || 'input' in req || 'store' in req, false, 'OpenAI 필드가 남았다');
});

t('말 모양 힌트: 같은 말에는 같은 힌트, 다른 말에는 골고루 섞인다', () => {
  const say = (c) => [{ speaker: 'student', content: c, input_method: 'voice' }];
  assert.equal(turn.pickStyleHint(say('졸렸어요'), 1), turn.pickStyleHint(say('졸렸어요'), 1));
  const seen = new Set(['졸렸어요', '친구랑 싸웠어요', '피구 이겼어요', '엄마가 화냈어요', '그냥 별로예요', '급식이 맛있었어요', '숙제가 많았어요']
    .map((c) => turn.pickStyleHint(say(c), 1)));
  assert.ok(seen.size >= 3, `힌트가 몰린다: ${seen.size}종`);
  const req = turn.buildChatTurnRequest({ flow: 'checkin', color: 'red', turnCount: 1, transcript: say('졸렸어요') });
  assert.ok(JSON.parse(req.messages[0].content).style_hint, '요청에 style_hint 가 없다');
});

const sttClean = load('src/lib/checkins/sttClean.ts');
t('전사: 무음·잡음에서 만들어 낸 조각(no_speech_prob 높음)을 뺀다', () => {
  // 실측 값(2026-09-20): 무음 0.92, 잡음 0.63~0.88, 실제 말소리 0.00~0.08
  assert.equal(sttClean.cleanTranscript({ segments: [{ text: ' 수고하셨습니다.', no_speech_prob: 0.92 }] }).text, '');
  // 잡음: no_speech 0.43 은 0.5 를 못 넘지만 avg_logprob -0.90 으로 자신감이 낮다 (실측)
  assert.equal(sttClean.cleanTranscript({ segments: [{ text: ' 시청해주셔서 감사합니다.', no_speech_prob: 0.43, avg_logprob: -0.9 }] }).text, '');
  // 조금 애매해도 자신감이 충분하면 말소리로 본다
  assert.equal(sttClean.cleanTranscript({ segments: [{ text: ' 작게 말했어요', no_speech_prob: 0.35, avg_logprob: -0.4 }] }).text, '작게 말했어요');
  const mixed = sttClean.cleanTranscript({ segments: [
    { text: ' Q. 요즘에 가장 즐거운 시간은?', no_speech_prob: 0.8 },
    { text: ' 그냥 오늘 창체 시간에 블록 조립을 했어요.', no_speech_prob: 0.02 },
  ] });
  assert.equal(mixed.text, '그냥 오늘 창체 시간에 블록 조립을 했어요.');
  assert.equal(mixed.dropped.length, 1);
});

t('전사: 반복 환각(compression_ratio 높음)은 빼고, 말소리와 정보 없는 응답은 그대로 둔다', () => {
  assert.equal(sttClean.cleanTranscript({ segments: [{ text: '아 아 아 아 아 아', no_speech_prob: 0.1, compression_ratio: 3.1 }] }).text, '');
  assert.equal(sttClean.cleanTranscript({ segments: [{ text: '피구 했어요', no_speech_prob: 0.05, compression_ratio: 1.0 }] }).text, '피구 했어요');
  // 조각 정보가 없으면 있는 그대로(없는 정보로 지우지 않는다)
  assert.equal(sttClean.cleanTranscript({ text: ' 안녕 ' }).text, '안녕');
  assert.equal(sttClean.cleanTranscript({}).text, '');
});

t('위험 판단 요청은 오늘 대화만 보고 temperature 0 이다', () => {
  const tr = [{ speaker: 'student', content: '싸웠어요', input_method: 'voice' }];
  const req = turn.buildRiskCheckRequest({ transcript: tr });
  assert.equal(req.temperature, 0);
  assert.equal(req.output_config.format.schema, turn.RISK_CHECK_SCHEMA);
  assert.ok(!req.messages[0].content.includes('recent_context'));
});

t('temperature 를 받지 않는 모델(Sonnet 5 이후)에는 temperature 를 붙이지 않는다', () => {
  const prev = process.env.CHAT_MODEL;
  process.env.CHAT_MODEL = 'claude-sonnet-5';
  try {
    const req = turn.buildChatTurnRequest({ flow: 'checkin', color: 'red', turnCount: 1, transcript: [] });
    assert.equal('temperature' in req, false);
    process.env.CHAT_MODEL = 'claude-haiku-4-5-20251001';
    assert.equal(turn.buildChatTurnRequest({ flow: 'checkin', color: 'red', turnCount: 1, transcript: [] }).temperature, 0.5);
  } finally {
    if (prev === undefined) delete process.env.CHAT_MODEL; else process.env.CHAT_MODEL = prev;
  }
});

t('Claude 응답에서 본문·거부·잘림을 읽는다', () => {
  assert.deepEqual(turn.readClaudeText({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"risk":"none"}' }] }), { text: '{"risk":"none"}', refused: false, truncated: false });
  assert.equal(turn.readClaudeText({ stop_reason: 'refusal', content: [] }).refused, true);
  assert.equal(turn.readClaudeText({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"a' }] }).truncated, true);
  assert.equal(turn.readClaudeText(null).text, '');
});

t('받아주는 말과 질문을 한 줄로 잇는다', () => {
  const out = turn.parseChatTurn({ ack: '그랬구나.', question: '그때 어떤 기분이었어?', sufficient: false, risk: 'none' });
  assert.deepEqual(out, { reply: '그랬구나. 그때 어떤 기분이었어?', sufficient: false, risk: 'none' });
});

t('sufficient 여도 질문은 남는다 — 첫 턴에 공감만 하고 끝나지 않게', () => {
  // 예전에는 sufficient=true 면 마무리 인사만 와서, 게이트가 대화를 이어갈 때
  // "이겼던 거 정말 기분 좋았겠네" 가 질문 자리에 그대로 나갔다
  const out = turn.parseChatTurn({ ack: '우와, 이겼구나!', question: '그때 기분은 어땠어?', sufficient: true, risk: 'none' });
  assert.ok(out.reply.endsWith('?'));
});

t('받아주는 말에 질문이 섞이거나 선택지로 물으면 선택지 아닌 첫 질문 하나만 남긴다', () => {
  const a = turn.parseChatTurn({ missing: 'situation', ack: '그렇구나. 기분이 안 좋아진 일이 있었어?', question: '어떤 일이 있어서 그런 기분이 들었어?', sufficient: false, risk: 'none' });
  assert.equal(a.reply, '그렇구나. 기분이 안 좋아진 일이 있었어?');
  const b = turn.parseChatTurn({ missing: 'feeling', ack: '피구 했구나! 그때 마음이 어땠어?', question: '재미있었어, 아니면 다른 기분이었어?', sufficient: false, risk: 'none' });
  assert.equal(b.reply, '피구 했구나! 그때 마음이 어땠어?');
  // 선택지 질문만 있으면 빠진 조각(마음)에 맞는 질문으로 바꾼다
  const c = turn.parseChatTurn({ missing: 'feeling', ack: '피구 했구나!', question: '재미있었어, 아니면 다른 기분이었어?', sufficient: false, risk: 'none' });
  assert.equal(c.reply, '피구 했구나! 그때 마음이 어땠어?');
});

t('맞장구 뒤에 내용 있는 받아주기가 오면 맞장구를 뗀다', () => {
  // "그랬구나. 몸이 조금 안 좋구나." 는 두 번 끄덕이는 말투라 어색했다
  const a = turn.parseChatTurn({ missing: 'situation', ack: '그랬구나. 몸이 조금 안 좋구나.', question: '몸이 안 좋게 된 일이 있었어?', sufficient: false, risk: 'none' });
  assert.equal(a.reply, '몸이 조금 안 좋구나. 몸이 안 좋게 된 일이 있었어?');
  // 맞장구 하나뿐이면 그대로 둔다
  const b = turn.parseChatTurn({ missing: 'situation', ack: '그랬구나.', question: '어떤 일이 있었어?', sufficient: false, risk: 'none' });
  assert.equal(b.reply, '그랬구나. 어떤 일이 있었어?');
});

t('이유를 따지는 질문은 걸러낸다', () => {
  // 걸러낸 뒤에는 빠진 조각에 맞는 질문으로 바꾼다(한 문장 고정이면 맥락이 어긋났다)
  const a = turn.parseChatTurn({ missing: 'situation', ack: '졸리네.', question: '졸린 이유가 뭐였어?', sufficient: false, risk: 'none' });
  assert.equal(a.reply, '졸리네. 어떤 일이 있었는지 들려줄래?');
  // "이유가 있었어?" 처럼 부드럽게 여는 질문은 통과한다
  const c = turn.parseChatTurn({ missing: 'cause', ack: '피곤하네.', question: '피곤한 이유가 있었어?', sufficient: false, risk: 'none' });
  assert.equal(c.reply, '피곤하네. 피곤한 이유가 있었어?');
  // 마음의 계기를 여는 모양은 통과한다
  const b = turn.parseChatTurn({ missing: 'cause', ack: '화났나 봐.', question: '어떤 일이 있어서 화가 났어?', sufficient: false, risk: 'none' });
  assert.equal(b.reply, '화났나 봐. 어떤 일이 있어서 화가 났어?');
});

t('앞 말이 "구나" 로 끝났으면 받아주기의 "구나" 를 "네" 로 바꾼다', () => {
  const prev = '빨강이구나, 오늘 하루가 힘들었나 싶네.\n학교에서 털어놓고 싶은 일 있어?';
  assert.equal(turn.avoidRepeatedGuna('친구랑 싸웠구나.', prev), '친구랑 싸웠네.');
  assert.equal(turn.avoidRepeatedGuna('급식을 맛있게 먹는구나!', prev), '급식을 맛있게 먹네!');
  assert.equal(turn.avoidRepeatedGuna('마음이 무거웠겠구나.', prev), '마음이 무거웠겠네.');
  // "구나" 자체는 괜찮다 — 앞 말이 "구나" 가 아니면 그대로 둔다
  assert.equal(turn.avoidRepeatedGuna('친구랑 싸웠구나.', '그래, 오늘은 그냥 둘게.\n어땠어?'), '친구랑 싸웠구나.');
});

t('질문을 두 번 하면 첫 질문만 남긴다', () => {
  const out = turn.parseChatTurn({ missing: 'feeling', ack: '공기놀이 했구나!', question: '그때 마음이 어땠어? 공기놀이 할 때 기분이 어땠어?', sufficient: false, risk: 'none' });
  assert.equal(out.reply, '공기놀이 했구나! 그때 마음이 어땠어?');
});

t('질문이 빠지거나 물음표가 없으면 기본 질문으로 바꾼다', () => {
  for (const q of ['', '정말 기분 좋았겠네.', '   ']) {
    const out = turn.parseChatTurn({ ack: '그랬구나.', question: q, sufficient: true, risk: 'none' });
    assert.equal(out.reply, `그랬구나. ${turn.FALLBACK_QUESTION}`);
  }
});

t('위험 표시가 붙으면 AI 문장을 버린다', () => {
  // 캐묻거나 위로하는 말이 섞이면 진술이 오염된다
  const out = turn.parseChatTurn({ ack: '괜찮아질 거야.', question: '누가 그랬어?', sufficient: false, risk: 'flag' });
  assert.equal(out.reply, '');
  assert.equal(out.risk, 'flag');
  assert.equal(out.sufficient, true);
});

t('잘못된 응답은 거부한다', () => {
  for (const bad of [null, {}, { ack: 1, question: 'x?', sufficient: true, risk: 'none' },
                     { ack: 'x', question: 'x?', sufficient: 'yes', risk: 'none' },
                     { ack: 'x', question: 'x?', sufficient: true, risk: 'danger' },
                     { reply: 'x', sufficient: true, risk: 'none' }]) {
    // 메시지 문구가 아니라 에러 코드로 확인한다 — 문구는 바뀔 수 있다
    assert.throws(() => turn.parseChatTurn(bad), (e) => e.code === 'INVALID_AI_OUTPUT');
  }
});

t('종료 문구가 모든 사유·등하교에 있고, 아이템 안내가 아니다', () => {
  for (const flow of ['checkin', 'checkout']) {
    for (const r of ['sufficient', 'max_turns', 'avoidance']) {
      const lines = gates.closingLines(r, flow);
      assert.ok(lines.length >= 1);
      // 마무리 인사는 안부·응원이어야 한다. "아이템을 만들고 있어" 는 인사로 들리지 않았다
      assert.ok(lines.every((l) => !l.includes('아이템')), `${flow}/${r}: ${lines.join(' / ')}`);
    }
  }
});

console.log(`PASS: ${n} checks — 첫 질문 변주, 게이트 우선순위, 파생 수치, 요청/응답 계약. 네트워크·키 사용 없음.`);

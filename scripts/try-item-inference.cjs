/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module loader uses CommonJS. */
// Live item inference with the real ANTHROPIC_API_KEY from .env.local. No Supabase, no DB writes.
// Usage: node scripts/try-item-inference.cjs [transcript.json]
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
const { inferItem } = load('src/lib/openai/inferItem.ts');
const transcript = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : [
  { speaker: 'assistant', content: '오늘 하루는 어땠어?', input_method: 'fixed' },
  { speaker: 'student', content: '체육 시간에 줄넘기 했는데 처음으로 2단 뛰기를 10번 넘었어요.', input_method: 'text' },
  { speaker: 'assistant', content: '와, 10번이나! 그때 기분이 어땠어?', input_method: 'text' },
  { speaker: 'student', content: '계속 걸려서 짜증났는데 친구가 박자 세줘서 됐어요. 좀 뿌듯했어요.', input_method: 'text' },
  { speaker: 'assistant', content: '친구 도움도 받고 끝까지 해냈구나. 오늘 이야기 고마워.', input_method: 'text' },
];
const t = Date.now();
inferItem(transcript).then(r => console.log(JSON.stringify(r, null, 2), `\n${Date.now() - t}ms, model=${process.env.ANTHROPIC_ITEM_MODEL || 'claude-sonnet-4-6'}`))
  .catch(e => { console.error('FAIL', e.code, e.httpStatus, e.message, JSON.stringify(e.detail ?? {}).slice(0, 800)); process.exit(1); });

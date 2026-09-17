/* eslint-disable @typescript-eslint/no-require-imports -- Offline TypeScript module loader uses CommonJS. */
// Offline contract/API tests. No credentials are read and no network is used.
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
async function main() {
  // Replace the entire child-process environment before loading production modules.
  process.env = { OPENAI_API_KEY: '' };
  global.fetch = async () => { throw new Error('Network disabled in offline tests'); };
  const { ITEM_ASSEMBLY_SCHEMA, parseItemAssembly } = load('src/lib/items/itemAssembly.ts');
  const { assembleItem, buildItemAssemblyRequest } = load('src/lib/openai/assembleItem.ts');
  const { ITEM_SHAPE_CATALOG } = load('src/lib/openai/prompts/item-assembly.ts');
  const inference = { itemName: '나의 컵', subject: '머그컵', appearance: ['속이 빈 둥근 몸통', '옆 손잡이'], sizeClass: 'small', evidence: ['private quote'], coreExperience: 'private experience', selectionReason: 'private reason', studentMessage: 'private message' };
  const wire = JSON.parse(fs.readFileSync(path.join(root, 'docs/development/examples/mug.json'), 'utf8'));
  wire.name = inference.itemName;
  wire.parts.forEach(p => { p.mirror = null; p.repeat = null; });
  const valid = parseItemAssembly(wire, inference.itemName);
  assert.equal(valid.parts[0].mirror, undefined);
  const shapes = ITEM_ASSEMBLY_SCHEMA.properties.parts.items.anyOf;
  assert.deepEqual(shapes.map(s => s.properties.shape.enum[0]).sort(), Object.keys(ITEM_SHAPE_CATALOG).sort());
  const variants = {
    box: { size: [.2, .3, .4], roundness: .02 }, sphere: { radius: .2 },
    ellipsoid: { size: [.2, .3, .4] }, hemisphere: { radius: .2 }, cylinder: { radius: .2, height: .4 },
    ellipticCylinder: { radiusX: .2, radiusZ: .1, height: .4 }, prism: { radius: .2, height: .4, sides: 6 },
    cone: { radius: .2, height: .4 }, frustum: { radiusTop: .1, radiusBottom: .2, height: .4 },
    pyramid: { width: .3, depth: .3, height: .4, sides: 4 }, capsule: { radius: .1, length: .3 },
    curvedTube: { points: [[0, 0, 0], [.1, .3, 0]], radius: .04 }, torus: { radius: .2, tubeRadius: .04 },
    torusArc: { radius: .2, tubeRadius: .04, arc: Math.PI }, extrudedShape: { points: [[0, 0], [.3, 0], [0, .3]], depth: .04, bevel: .01 },
    curvedPlate: { width: .3, height: .4, depth: .02, bend: 1 }, hollowContainer: { radiusTop: .2, radiusBottom: .2, height: .4, wallThickness: .03, bottomThickness: .03 },
  };
  for (const [shape, params] of Object.entries(variants)) parseItemAssembly({ version: 1, name: inference.itemName, parts: [{ id: shape, shape, position: [0, 0, 0], rotation: [0, 0, 0], color: '#ABCDEF', mirror: null, repeat: null, ...params }] }, inference.itemName);
  const bad = mutate => { const v = structuredClone(wire); mutate(v); assert.throws(() => parseItemAssembly(v, inference.itemName)); };
  bad(v => { v.parts[0].unexpected = 1; });
  bad(v => { delete v.parts[0].mirror; });
  bad(v => { v.parts[0].shape = 'unknown'; });
  bad(v => { v.name = 'changed'; });
  bad(v => { v.parts[0].wallThickness = .3; });
  bad(v => { v.parts[0].position = [0, 0]; });
  bad(v => { v.parts[0].id = v.parts[1].id; });
  bad(v => { v.parts[0].repeat = { count: 30, step: [.01, 0, 0] }; v.parts[0].mirror = 'x'; });
  const request = buildItemAssemblyRequest(inference);
  assert.equal(request.store, false);
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(JSON.parse(request.input[0].content), { itemName: inference.itemName, subject: inference.subject, appearance: inference.appearance });
  await assert.rejects(assembleItem(inference), e => e.code === 'AI_NOT_CONFIGURED');
  process.env.OPENAI_API_KEY = 'test-only-not-a-real-key';
  const respond = output => { global.fetch = async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] })); };
  respond(wire);
  assert.deepEqual(await assembleItem(inference), valid);
  respond({ ...wire, name: 'changed' });
  await assert.rejects(assembleItem(inference), e => e.code === 'INVALID_ASSEMBLY_OUTPUT');
  for (const [data, code] of [[{ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, 'ASSEMBLY_INCOMPLETE'], [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }, 'ASSEMBLY_REFUSAL']]) {
    global.fetch = async () => new Response(JSON.stringify(data));
    await assert.rejects(assembleItem(inference), e => e.code === code && (e.detail.error === 'max_output_tokens' || e.detail.raw === 'no'));
  }
  // Inference: evidence mismatch is its own code and the raw model text survives for the job log.
  const { inferItem } = load('src/lib/openai/inferItem.ts');
  const transcript = [{ speaker: 'student', content: '축구에서 골을 넣었어요' }];
  const inferred = { coreExperience: '골', evidence: ['축구에서 골을 넣었어요'], itemName: '축구공', subject: '축구공', selectionReason: '이유', studentMessage: '설명', sizeClass: 'small', appearance: ['둥근 공', '오각형 패치'] };
  respond(inferred);
  assert.equal((await inferItem(transcript)).studentMessage, '설명');
  respond({ ...inferred, evidence: ['농구를 했어요'] });
  await assert.rejects(inferItem(transcript), e => e.code === 'EVIDENCE_MISMATCH' && e.detail.raw.includes('농구를 했어요'));
  respond({ ...inferred, coreExperience: 'x'.repeat(301) });
  await assert.rejects(inferItem(transcript), e => e.code === 'INVALID_AI_OUTPUT' && e.detail.error.length > 0);
  global.fetch = async () => new Response('{"error":{"message":"model not found"}}', { status: 404 });
  await assert.rejects(inferItem(transcript), e => e.code === 'AI_REQUEST_FAILED' && e.detail.error.includes('model not found'));
  global.fetch = async () => new Response('', { status: 429 });
  await assert.rejects(assembleItem(inference), e => e.code === 'ASSEMBLY_REQUEST_FAILED' && e.httpStatus === 429);
  global.fetch = async () => { throw new Error('offline timeout'); };
  await assert.rejects(assembleItem(inference), e => e.code === 'ASSEMBLY_UNAVAILABLE');
  console.log('PASS: 17 shape branches, strict fields, geometry constraints, privacy, mocked success and failures. No network calls.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

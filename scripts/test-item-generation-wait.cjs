/* eslint-disable @typescript-eslint/no-require-imports */
// Offline worker regression: a parallel save must not consume attempts or issue fallback.
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');

const events = [];
let session = { status: 'started', transcript: null };
const job = { id: 'job', enrollment_id: 'student', source_session_id: 'session', status: 'queued', attempt_count: 0, max_attempts: 2 };
const admin = {
  from(table) {
    let update;
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      update(values) { update = values; events.push(['update', table, values]); return query; },
      async maybeSingle() {
        if (table === 'item_generation_jobs') return { data: update ? { id: job.id } : job };
        return { data: { id: 'ready-asset' } };
      },
      async single() { return { data: session }; },
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
    };
    return query;
  },
};
const inference = { subject: '공', studentMessage: '너의 공' };
const stubs = {
  'server-only': {},
  '@/lib/supabase/admin': { createAdminClient: () => admin },
  '@/lib/supabase/raw/wholeTranscript': { parseTranscript: v => v },
  '@/lib/openai/inferItem': { inferItem: async () => { events.push(['infer']); return inference; } },
  '@/lib/openai/assembleItem': { assembleItem: async () => { throw new Error('Cached asset must be reused'); } },
  '@/lib/openai/client': { ItemAIError: class extends Error {} },
  './assembledItem': {}, './fallbackItem': {},
  './itemCatalog': { findCatalogItem: () => null },
  './presetAssets': { ensurePresetAssetsSynced: async () => {}, STYLE_VERSION: 'test' },
  './issueStudentItem': { issueStudentItem: async () => { events.push(['issue']); return { id: 'item' }; } },
};
const file = require('node:path').resolve('src/lib/items/runItemGenerationJob.ts');
const loaded = new Module(file, module);
loaded.require = name => {
  assert.ok(name in stubs, `Unexpected dependency: ${name}`);
  return stubs[name];
};
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);

(async () => {
  const { runItemGenerationJob } = loaded.exports;
  assert.deepEqual(await runItemGenerationJob(job.id), { skipped: true, status: 'queued', reason: 'TRANSCRIPT_NOT_READY' });
  assert.deepEqual(events, []);
  session = { status: 'completed', transcript: [] };
  assert.equal((await runItemGenerationJob(job.id)).status, 'completed');
  assert.equal(events[0][2].attempt_count, 1);
  const published = events.findIndex(e => e[0] === 'update' && e[2].inference_output && !e[2].completed_at);
  assert.ok(published > events.findIndex(e => e[0] === 'infer'));
  assert.ok(published < events.findIndex(e => e[0] === 'issue'));
  const routeFile = require('node:path').resolve('src/app/api/ai/item-generation/route.ts');
  const routeModule = new Module(routeFile, module);
  const routeAdmin = { from(table) {
    const query = { select() { return query; }, eq() { return query; }, async maybeSingle() {
      return { data: table === 'checkin_sessions' ? session : job };
    } };
    return query;
  } };
  routeModule.require = name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) } };
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => routeAdmin };
    throw new Error(`Unexpected route dependency: ${name}`);
  };
  routeModule._compile(ts.transpileModule(fs.readFileSync(routeFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, routeFile);
  const sessionId = '50000000-0000-4000-8000-000000000001';
  session = { id: sessionId, enrollment_id: '40000000-0000-4000-8000-000000000001', status: 'started', transcript: null };
  const post = () => routeModule.exports.POST(new Request('http://localhost/api/ai/item-generation', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }));
  assert.equal((await post()).status, 200); // Existing queued job, no login or saved transcript required.
  session.enrollment_id = 'other-student';
  assert.equal((await post()).status, 404);
  const clientFile = require('node:path').resolve('src/lib/items/itemGenerationClient.ts');
  const clientModule = new Module(clientFile, module);
  clientModule._compile(ts.transpileModule(fs.readFileSync(clientFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, clientFile);
  const { waitForItemGeneration, ISLAND_ITEM_WAIT_MS } = clientModule.exports;
  assert.equal(ISLAND_ITEM_WAIT_MS, 12000);
  global.fetch = async () => new Response(JSON.stringify({ job: { status: 'generating', inference_output: inference } }));
  assert.equal((await waitForItemGeneration('session', 'inference')).ready, true);
  assert.equal((await waitForItemGeneration('session', 'placement', { timeoutMs: 15 })).ready, false);
  global.fetch = async () => new Response(JSON.stringify({ job: { status: 'completed', student_item_id: 'item', generated_asset_id: 'asset' } }));
  assert.equal((await waitForItemGeneration('session', 'placement')).ready, true);
  global.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  assert.deepEqual(await waitForItemGeneration('session', 'placement', { timeoutMs: 15 }), { ready: false, job: null });
  console.log('PASS: no claim/attempt/fallback before save; inference published before cached asset issuance.');
  console.log('PASS: two readiness stages, immediate completion, 12s default, timeout including slow fetch.');
  console.log('PASS: Minjun-only MVP access and repeated pre-save requests without login.');
})().catch(error => { console.error(error); process.exitCode = 1; });

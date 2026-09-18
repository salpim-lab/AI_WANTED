/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
let lastSlot = 2;
let existing = null;
let collision = false;
let inserts = [];
const admin = { from() {
  let latest = false;
  let values;
  const query = {
    select() { return query; }, eq() { return query; }, limit() { return query; },
    order() { latest = true; return query; },
    insert(input) { values = input; inserts.push(input); return query; },
    async maybeSingle() { return { data: latest ? { slot: lastSlot } : existing }; },
    async single() {
      if (collision) { collision = false; lastSlot++; return { error: { code: '23505' } }; }
      return { data: { id: 'issued', ...values } };
    },
  };
  return query;
} };
const file = require('node:path').resolve('src/lib/items/issueStudentItem.ts');
const loaded = new Module(file, module);
loaded.require = name => {
  if (name === 'server-only') return {};
  if (name === '@/lib/supabase/admin') return { createAdminClient: () => admin };
  throw new Error(`Unexpected dependency: ${name}`);
};
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
(async () => {
  const input = { enrollmentId: 'minjun', sourceSessionId: 'session', assetId: 'asset' };
  const { issueStudentItem } = loaded.exports;
  assert.equal((await issueStudentItem(input)).slot, 3);
  lastSlot = 12;
  assert.equal((await issueStudentItem(input)).slot, 13);
  collision = true;
  assert.equal((await issueStudentItem(input)).slot, 14);
  const count = inserts.length;
  existing = { id: 'previous', slot: 2 };
  assert.equal((await issueStudentItem(input)).id, 'previous');
  assert.equal(inserts.length, count);
  assert.ok(inserts.every(row => row.source_session_id === input.sourceSessionId && !row.is_core));
  console.log('PASS: third and later daily items, concurrent slot retry, same-session reuse.');
})().catch(error => { console.error(error); process.exitCode = 1; });

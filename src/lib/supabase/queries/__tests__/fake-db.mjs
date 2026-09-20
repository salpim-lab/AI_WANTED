// sessionSummaries 테스트용 메모리 DB — supabase-js 쿼리 빌더의 필요한 부분만 흉내 낸다(공유 DB에는 접속하지 않는다).
// 재현하는 DB 동작: 부분 유니크 인덱스(완료 session_summary의 (source_id, prompt_version, scope)) 위반 → 에러코드 23505.
// (가드 트리거의 검증은 scripts/verify-1095의 PGlite 테스트가 진짜 Postgres로 덮는다.)
// 호출 기록(calls)으로 "기존 행을 수정·삭제하지 않았는가"를 확인한다.

export function makeFakeDb(tables) {
  const data = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const calls = { insert: [], update: 0, delete: 0, select: [] };
  const failSelect = new Set();
  let failInsertWith = null;
  let clock = 0;

  class Query {
    constructor(table) { this.table = table; this.filters = []; this.op = "select"; this.orderBy = null; this.wantSingle = false; }
    select(columns) { if (this.op === "select") calls.select.push([this.table, columns]); return this; }
    eq(col, value) { this.filters.push((r) => (r[col] ?? null) === value); return this; }
    is(col, value) { this.filters.push((r) => (r[col] ?? null) === value); return this; }
    in(col, values) { this.filters.push((r) => values.includes(r[col])); return this; }
    gte(col, value) { this.filters.push((r) => r[col] >= value); return this; }
    lte(col, value) { this.filters.push((r) => r[col] <= value); return this; }
    or(expression) {
      const parts = expression.split(",").map((part) => {
        const [col, op, ...rest] = part.split(".");
        const value = rest.join(".");
        return (r) => (op === "is" ? (r[col] ?? null) === null : (r[col] ?? null) === value);
      });
      this.filters.push((r) => parts.some((test) => test(r)));
      return this;
    }
    order(col, options = {}) { this.orderBy = [col, options.ascending !== false]; return this; }
    limit() { return this; }
    single() { this.wantSingle = true; return this; }
    insert(row) { this.op = "insert"; this.row = row; return this; }
    update() { this.op = "update"; calls.update += 1; return this; }
    delete() { this.op = "delete"; calls.delete += 1; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => this.exec()).then(resolve, reject); }

    exec() {
      if (this.op === "update" || this.op === "delete") return { data: null, error: null };
      if (this.op === "insert") return this.execInsert();
      if (failSelect.has(this.table)) return { data: null, error: { code: "XX000", message: `test: ${this.table} 조회 실패` } };
      let rows = data[this.table].filter((r) => this.filters.every((test) => test(r)));
      if (this.orderBy) {
        const [col, asc] = this.orderBy;
        rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      return { data: this.wantSingle ? (rows[0] ?? null) : rows.map((r) => ({ ...r })), error: null };
    }

    execInsert() {
      const row = { ...this.row };
      if (failInsertWith) return { data: null, error: failInsertWith };
      if (this.table === "analysis_runs" && row.analysis_type === "session_summary" && row.status === "completed") {
        const key = (r) => `${r.source_id}|${r.prompt_version}|${r.result?.scope ?? ""}`;
        if (data.analysis_runs.some((r) => r.analysis_type === "session_summary" && r.status === "completed" && key(r) === key(row))) {
          return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint analysis_runs_session_summary_uniq" } };
        }
      }
      clock += 1;
      row.id = `00000000-0000-4000-9000-${String(1000 + clock).padStart(12, "0")}`;
      row.created_at = new Date(Date.UTC(2026, 8, 20, 10, 0, clock)).toISOString();
      data[this.table].push(row);
      calls.insert.push({ table: this.table, row: JSON.parse(JSON.stringify(row)) });
      return { data: this.wantSingle ? { id: row.id, created_at: row.created_at } : [{ id: row.id }], error: null };
    }
  }

  return {
    client: { from: (table) => new Query(table) },
    data,
    calls,
    failSelectOn: (table) => failSelect.add(table),
    failInsert: (error) => { failInsertWith = error; },
    clearFailures: () => { failSelect.clear(); failInsertWith = null; },
  };
}

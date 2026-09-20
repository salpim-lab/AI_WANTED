// sessionSummaries 통합 테스트용 jiti alias 스텁 — 관리자 클라이언트는 테스트가 심어 둔 메모리 DB를, 서버 클라이언트는 테스트가 정한 방문자를 돌려준다.
export function createAdminClient() {
  if (!globalThis.__TEST_DB__) throw new Error("test stub: __TEST_DB__가 설정되지 않았다");
  return globalThis.__TEST_DB__.client;
}

// getDemoScope()가 읽는 서버 세션 — 방문자 id가 null이면 세션 없음(공용만 보는 fail-closed).
export async function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: globalThis.__TEST_VIEWER__ ? { id: globalThis.__TEST_VIEWER__ } : null } }),
    },
  };
}

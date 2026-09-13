// 서버(API Route, Server Component)용 Supabase 클라이언트. service role 키는
// 절대 클라이언트로 내려보내지 말 것 — 이 파일은 "use client" 컴포넌트에서 import 금지.
// TODO: 팀 전체 — `npm install @supabase/supabase-js @supabase/ssr` 설치 후 아래 구현.
//
// import { createServerClient } from "@supabase/ssr";
// import { cookies } from "next/headers";
//
// export async function createClient() {
//   const cookieStore = await cookies();
//   return createServerClient(
//     process.env.NEXT_PUBLIC_SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_ROLE_KEY!,
//     { cookies: { getAll: () => cookieStore.getAll() } },
//   );
// }

export {};

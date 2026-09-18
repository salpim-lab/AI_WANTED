// 담당: 이유민
// 마지막 체크인 세션을 읽어 보여준다. 저장이 제대로 됐는지 눈으로 확인하는 용도.
//   node --env-file=.env.local scripts/show-last-session.mjs
// 서버 전용 키를 쓰므로 브라우저에서 부르지 말 것.
const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SECRET_KEY;
if (!U || !K) { console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 가 필요합니다."); process.exit(1); }

const rows = await (await fetch(
  `${U}/rest/v1/checkin_sessions?select=id,session_date,period,mood_color,status,attempt,transcript,prosody,completed_at&order=started_at.desc&limit=${process.argv[2] ?? 1}`,
  { headers: { apikey: K, Authorization: `Bearer ${K}` } },
)).json();

for (const s of rows) {
  console.log("─".repeat(72));
  console.log(`${s.session_date} ${s.period}  ${s.mood_color}  status=${s.status} attempt=${s.attempt}`);
  console.log(`id ${s.id}`);
  console.log("\n[전문]");
  if (!s.transcript) console.log("  (없음 — 아직 저장되지 않았습니다)");
  else for (const m of s.transcript) {
    const who = m.speaker === "student" ? "아이 " : m.speaker === "assistant" ? "살핌" : "시스템";
    console.log(`  ${who} (${m.input_method}) ${m.content}`);
  }
  console.log("\n[파생 수치]");
  if (!s.prosody) console.log("  (없음)");
  else for (const u of s.prosody.utterances) {
    console.log(`  #${u.index}  길이 ${u.duration_sec}s · 응답지연 ${u.response_delay_sec}s · 무음 ${u.silence_count}회 ${u.silence_total_sec}s · 음량 ${u.loudness_raw} · ${u.syllables_per_sec ?? "?"}음절/s`);
  }
  console.log();
}

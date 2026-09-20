import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error("missing: " + a.slice(0, 60)); return s.replace(a, b); };

let live = readFileSync("scripts/verify-1094/verify-1094-live-rest.mjs", "utf8");
live = rep(live, "    if (SEEDED && name === \"피자\") continue; // 공용 15종에 포함되는 이름\n",
  "    // 시드 후에는 공용 15종에 든 이름(돌멩이·귀마개·피자)은 방문자에게 보이는 것이 정상이다 — 공용에 없는 이름(선물 상자)만 0건이어야 한다.\n"
  + "    if (SEEDED && (assets.rows || []).some((row) => row.name === name)) continue;\n");
live = rep(live, "// 기존(레거시) 42건이 참조하는 자산 — 방문자가 직접 조회하면 안 된다(공용 시드 후에는 공용 15종 중 일부와 겹칠 수 있어 제외)",
  "// 기존(레거시) 42건이 참조하는 자산 — 방문자가 직접 조회하면 안 된다(공용 시드 후에는 공용 15종과 이름이 겹치는 것은 건너뛴다)");
writeFileSync("scripts/verify-1094/verify-1094-live-rest.mjs", live);

let doc = readFileSync("docs/데모_방문자_격리_적용_절차.md", "utf8");
doc = rep(doc, "> 시드 후 라이브 REST/앱 A/B 검증은 §14-8의 중단 사유 때문에 **미완료**.", "> 시드 후 검증은 §14-8·§14-9 참고(앱 A/B는 **미실행**).");
doc += `
### 14-9. 시드 후 라이브 REST 검증 2차 실행과 중단 (2026-09-20, 포트 3200)
**서버**: 포트 3100은 \`listen EFAULT: bad address in system call argument 127.0.0.1:3100\`(Windows 소켓 바인딩 오류, 앱 코드 무관)로 기동 실패해 검증을 하지 않고 보고했다. 지시에 따라 \`DEMO_MODE=true npx next start -p 3200\`(\`-H\` 없이)으로 한 번 기동 → 322ms에 Ready, \`POST /api/demo/init\`(세션 없음) → **401 \`NO_SESSION\`**(DEMO_MODE 게이트 정상). 검증 후 서버 종료(포트 3200 리스너 0).
**\`SEEDED=1 node scripts/verify-1094/verify-1094-live-rest.mjs http://localhost:3200\` 1회 실행 → PASS 30 / FAIL 4.** 통과한 핵심 항목:
- 공용 15종: 방문자 A·B 모두 \`student_items\` 공용 15개만(레거시 42건 비노출)·\`asset_catalog\` 15종·공용 섬 1·배치 15, **A·B가 동일한 id·asset_id·slot·좌표·반경·자산 name을 조회**, 공용 섬은 소유자 없음.
- 실제 공용 행(아이템·배치·섬)의 수정/삭제를 A·B가 시도 → 전부 403, **시도 뒤에도 공용 데이터 불변**. 방문자의 INSERT/UPDATE/DELETE·RPC 직접 호출 차단, job·타인 세션 비노출.
**FAIL 4개의 원인 — 검증 스크립트의 오류이지 격리 결함이 아님**: \`asset_catalog\`를 name=돌멩이 / name=귀마개로 직접 조회하면 0건이어야 한다는 검사였는데, **돌멩이·귀마개·피자는 공용 시드 15종에 포함**되므로 방문자에게 보이는 것이 정상이다(DB 확인: 세 이름은 공용 시드와 레거시가 같은 자산을 공유 — dedup). 공용에 없는 \`선물 상자\`는 두 방문자 모두 0건으로 통과했다. 시드 전 실행에서는 통과했던 검사라 시드 후 기대값을 갱신하지 않은 것이 원인. 스크립트를 "시드 후에는 공용에 든 이름은 건너뛴다"로 고쳤다(**수정본은 실행하지 않음**).
**\`npm run test:demo-ab\`는 지시대로 실행하지 않았다**(라이브 REST가 전부 통과하지 못함). 재실행·데이터 수정도 하지 않았다.
**실제 DB 상태(검증 후)**: 익명 계정 19(이 실행이 +2) · profiles/class_teachers 각 11(+2, \`/api/demo/init\`으로 등록) · \`student_items\` 57(공용 15 + 레거시 42, **방문자 아이템 0**) · islands 1 · placements 15(전부 공용) · jobs 44 · checkin_sessions 792 · parent_consultations 10 · asset_catalog 18 — 이 실행이 만든 것은 익명 계정 2개와 그 프로필·학급 등록 행뿐이며 테스트 데이터 행은 없다.
**다음(지시 대기)**: 수정한 라이브 REST를 다시 1회 → 전부 통과하면 \`npm run test:demo-ab -- http://localhost:<포트>\` 1회(아이템 생성 경로, AI 호출 발생).
`;
writeFileSync("docs/데모_방문자_격리_적용_절차.md", doc);
unlinkSync("scripts/_fix4.mjs");
console.log("ok");

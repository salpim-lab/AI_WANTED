// 담당: 이지현
// 선생님 agent (협진 챗봇) — 교사 화면 어디서나 뜨는 전역 챗봇의 서버 쪽.
// 컨텍스트는 components/teacher/agent/context.ts(이지현 소유, 김현우의 조회 함수 재사용)로
// 정서/학교생활 관찰/가정 연계 3개 도메인으로 모으고, 도메인마다 Claude를 병렬 호출해 소견을 낸 뒤
// 마지막에 하나로 합친다 (image.png "3개 system prompt 병렬 호출 후 합치는 구조").
// (2026-09-19) OpenAI에서 Claude로 전환 — lib/anthropic/teacherAgentModel.ts 참고. 다른 팀원
// 기능(아이템 생성 등)은 그대로 OpenAI를 쓰므로 이 라우트만의 결정이다.
// ANTHROPIC_API_KEY가 없으면(로컬 개발 중 키 미설정) 도메인별 컨텍스트를 그대로 보여주는 개발용
// 폴백을 준다 — 화면 전체 흐름을 키 없이도 끝까지 테스트할 수 있다.
//
// 근거(evidence)는 각 도메인이 어떤 기록(날짜·종류)을 봤는지 사람이 읽을 수 있는 문자열로 같이
// 내려준다 — DB 스키마 v0.3 §9.2 agent_messages.evidence(근거 레코드 ID 목록) 설계와 같은 취지를
// mock 단계에서 문자열로 구현한 것. 화면에는 "📎 근거" 칩으로 보여준다(TeacherAgentWidget).
//
// (2026-09-19) 모든 질문에 3개 소견+종합까지 항상 다 나오는 게 가벼운 질문엔 너무 방대하다는
// 피드백 — 교사가 질문 전에 domains(0~3개)를 골라 보낼 수 있게 하고, 그 수에 따라 분기한다:
//   0개 선택(기본) → "라이트 모드": 도메인 나누지 않고 컨텍스트 전체를 1회 호출로 짧게 답함.
//   1개 선택        → 그 도메인만 호출, 합치기 생략(소견 자체가 곧 답).
//   2~3개 선택      → 지금까지처럼 그 도메인들만 병렬 호출 + 합치기.
// 이러면 호출 수(=비용·지연)가 질문의 무게에 맞게 줄어든다.
//
// TODO(다음 단계): agent_threads/agent_messages(DB 스키마 v0.3 §9.1~§9.2)에 대화를 영구 저장하는 건
// 교사 인증이 붙은 뒤로 미룬다 — 지금은 auth.uid()가 없어서 RLS 쓰기 정책을 만족할 수 없다.

import { NextResponse } from "next/server";
import {
  buildAgentContext,
  buildEvidenceIndex,
  DOMAIN_LABEL,
  type AgentDomain,
  type DomainContext,
} from "@/components/teacher/agent/context";
import { buildDomainSystemPrompt, buildLightSystemPrompt, buildMergeSystemPrompt } from "@/components/teacher/agent/prompt";
import { callTeacherAgentModel, hasClaudeKey } from "@/lib/anthropic/teacherAgentModel";
import { checkAndIncrementRateLimit } from "@/lib/ai/rateLimit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RequestBody = { question?: unknown; studentId?: unknown; domains?: unknown };
type DomainFinding = DomainContext & { finding: string };

const ALL_DOMAINS = new Set<AgentDomain>(["emotion", "learning", "home"]);

function parseDomains(value: unknown): AgentDomain[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<AgentDomain>();
  for (const v of value) {
    if (typeof v === "string" && ALL_DOMAINS.has(v as AgentDomain)) seen.add(v as AgentDomain);
  }
  return [...seen];
}

// (2026-09-19) 모델 답변 끝의 "[USED] EM1,EM3"를 읽어 실제로 인용한 근거만 골라낸다.
// 예전엔 domain.evidence(컨텍스트로 넘긴 원본 전체, 예: 최근 3일치 체크인 6개)를 항상 그대로
// 보여줘서 "오늘은 어때?"처럼 하루만 물어도 근거 칩이 9개씩 붙어 답변 내용과 따로 노는 문제가
// 있었다 — prompt.ts(EVIDENCE_TAG_RULE)가 태그 규칙을 알려주고, 여기서 그 결과를 파싱한다.
//
// (2026-09-19 수정) 처음엔 "[USED]가 마지막 줄 전체"라고 가정하고 줄 단위로 잘랐는데, 모델이
// "...관찰되었습니다. [USED] EL1,EL2"처럼 마지막 문장 뒤에 줄바꿈 없이 이어 붙이는 경우가 있었다
// — 그러면 매칭에 실패해서 [USED] 태그가 안 지워진 채로 화면에 그대로 노출됐다. 줄 단위 대신
// 문자열 끝에서 "[USED] 태그, 태그" 패턴을 직접 찾도록 바꿔서 줄바꿈 유무와 무관하게 잡는다.
//
// (2026-09-19 수정, Claude 전환 후) "인용 없으면 [USED] 생략"이라고 지시했더니 Claude가 그
// "생략"을 문자 그대로 답변에 적어버린 사례가 나왔다("[USED] 생략") — 태그 형식(EM1 등)이 아니라
// 정규식 매칭에 실패하고, 그러면 그 줄이 안 지워진 채 화면에 노출됐다. prompt.ts도 지시문을 더
// 명확하게 고쳤지만, 모델이 또 다른 변형("[USED] none", "[USED] -" 등)을 쓸 수도 있으니 여기서도
// "[USED]로 시작하는 마지막 줄"이면 태그를 못 읽어도 일단 화면에서는 지우는 방어 코드를 둔다.
function extractUsedEvidence(rawText: string, evidenceIndex: Map<string, string>, fallback: string[]): { text: string; evidence: string[] } {
  const match = rawText.match(/\[USED\]\s*([A-Za-z]{2}\d+(?:\s*,\s*[A-Za-z]{2}\d+)*)\s*$/);
  if (match && match.index !== undefined) {
    const tags = match[1].split(",").map((t) => t.trim().toUpperCase());
    const used = tags.map((t) => evidenceIndex.get(t)).filter((label): label is string => Boolean(label));
    const text = rawText.slice(0, match.index).trim();
    if (!used.length) return { text: text || rawText, evidence: fallback };
    return { text: text || rawText, evidence: used };
  }

  // 태그 형식이 아예 안 맞는 "[USED] 생략"류 — 근거는 못 걸러도(안전한 폴백: 전체 다 보여줌),
  // 적어도 이 문구가 답변에 그대로 노출되는 것만은 막는다.
  const looseMatch = rawText.match(/\n?\[USED\][^\n]*$/);
  if (looseMatch && looseMatch.index !== undefined) {
    const text = rawText.slice(0, looseMatch.index).trim();
    return { text: text || rawText, evidence: fallback };
  }

  return { text: rawText, evidence: fallback };
}

async function runDomain(domain: DomainContext, question: string, studentName: string | null): Promise<DomainFinding> {
  if (!domain.text) return { ...domain, finding: "이 영역에는 참고할 기록이 없습니다." };
  try {
    const raw = await callTeacherAgentModel(
      buildDomainSystemPrompt(domain.domain, studentName),
      `${domain.text}\n\n[교사 질문]\n${question}`,
      15_000,
    );
    const { text, evidence } = extractUsedEvidence(raw, buildEvidenceIndex([domain]), domain.evidence);
    return { ...domain, finding: text, evidence };
  } catch {
    // 도메인 하나가 실패해도 전체 답변을 막지 않는다 — 원본 컨텍스트를 그대로 소견 대신 보여준다.
    return { ...domain, finding: domain.text };
  }
}

function toFindingPayload(f: DomainFinding) {
  return { domain: f.domain, label: DOMAIN_LABEL[f.domain], finding: f.finding, evidence: f.evidence };
}

// (2026-09-20) 공개 데모 AI 호출 비용 제한 — 로그인한(익명 포함) 세션이 있으면 auth.uid()로,
// 없으면 IP로 시간창 안 호출 횟수를 센다(lib/ai/rateLimit.ts, DB 원자적 카운터).
async function resolveRateLimitSubject(request: Request): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return `user:${user.id}`;
  } catch {
    // 세션 확인 실패 — IP로 대체
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "유효한 JSON을 보내주세요." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ message: "question이 필요합니다." }, { status: 400 });
  }

  const rateLimitSubject = await resolveRateLimitSubject(request);
  const withinLimit = await checkAndIncrementRateLimit(rateLimitSubject, { windowSeconds: 3600, maxCalls: 30 });
  if (!withinLimit) {
    return NextResponse.json({ message: "잠시 후 다시 시도해주세요 (요청이 너무 많아요)." }, { status: 429 });
  }
  const studentId = typeof body.studentId === "string" && body.studentId.trim() ? body.studentId.trim() : null;
  const requestedDomains = parseDomains(body.domains);

  try {
    const { studentName, domains } = await buildAgentContext(studentId, question);
    // 아무것도 안 골랐으면 라이트 모드(전체), 골랐으면 그 도메인들만.
    const selected = requestedDomains.length > 0 ? domains.filter((d) => requestedDomains.includes(d.domain)) : [];
    const respond = (payload: object) =>
      NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });

    if (!hasClaudeKey()) {
      const prefix = "[개발용 응답 · ANTHROPIC_API_KEY 미설정]\n\n";
      if (selected.length === 0) {
        const answer = prefix + domains.map((d) => `[${DOMAIN_LABEL[d.domain]}]\n${d.text || "참고할 기록이 없습니다."}`).join("\n\n");
        return respond({ answer, studentName, evidence: domains.flatMap((d) => d.evidence), domainFindings: [], respondedDomain: null, mocked: true });
      }
      if (selected.length === 1) {
        const d = selected[0];
        return respond({ answer: prefix + (d.text || "참고할 기록이 없습니다."), studentName, evidence: d.evidence, domainFindings: [], respondedDomain: d.domain, mocked: true });
      }
      const domainFindings = selected.map((d) => ({ domain: d.domain, label: DOMAIN_LABEL[d.domain], finding: d.text || "참고할 기록이 없습니다.", evidence: d.evidence }));
      const answer = prefix + domainFindings.map((f) => `[${f.label}]\n${f.finding}`).join("\n\n");
      return respond({ answer, studentName, evidence: selected.flatMap((d) => d.evidence), domainFindings, respondedDomain: null, mocked: true });
    }

    // 라이트 모드 — 1회 호출. 3개 도메인 텍스트를 합치므로 태그(EM/EL/EH)가 도메인마다 구분돼 있어야
    // 어느 도메인의 몇 번째 근거인지 안 헷갈린다 (buildEvidenceIndex가 도메인별 접두사로 맵을 만든다).
    if (selected.length === 0) {
      const combinedText = domains.map((d) => d.text).filter(Boolean).join("\n\n") || "참고할 기록이 없습니다.";
      const raw = await callTeacherAgentModel(buildLightSystemPrompt(studentName), `${combinedText}\n\n[교사 질문]\n${question}`, 20_000);
      const { text, evidence } = extractUsedEvidence(raw, buildEvidenceIndex(domains), domains.flatMap((d) => d.evidence));
      return respond({ answer: text, studentName, evidence, domainFindings: [], respondedDomain: null, mocked: false });
    }

    // 도메인 1개 — 그 도메인 호출 결과를 그대로 답으로(합치기 생략)
    if (selected.length === 1) {
      const finding = await runDomain(selected[0], question, studentName);
      return respond({ answer: finding.finding, studentName, evidence: finding.evidence, domainFindings: [], respondedDomain: finding.domain, mocked: false });
    }

    // 도메인 2~3개 — 병렬 호출 + 합치기
    const findings = await Promise.all(selected.map((d) => runDomain(d, question, studentName)));
    const domainFindings = findings.map(toFindingPayload);
    const mergeInput =
      findings.map((f) => `[${DOMAIN_LABEL[f.domain]} 소견]\n${f.finding}`).join("\n\n") + `\n\n[교사 질문]\n${question}`;
    const answer = await callTeacherAgentModel(buildMergeSystemPrompt(studentName), mergeInput, 20_000);
    // 전체 근거 칩도 findings(도메인별로 이미 [USED]로 걸러진 evidence)를 합친 것으로 —
    // selected(원본 전체)를 쓰면 종합의견 밑에도 다시 근거가 과하게 붙는다.
    return respond({ answer, studentName, evidence: findings.flatMap((f) => f.evidence), domainFindings, respondedDomain: null, mocked: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "답변을 만들지 못했습니다.";
    return NextResponse.json({ message }, { status: 502 });
  }
}

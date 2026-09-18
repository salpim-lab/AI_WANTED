// 담당: 이지현
// 선생님 agent (협진 챗봇) — 교사 화면 어디서나 뜨는 전역 챗봇의 서버 쪽.
// 컨텍스트는 components/teacher/agent/context.ts(이지현 소유, 김현우의 조회 함수 재사용)로
// 정서/학교생활 관찰/가정 연계 3개 도메인으로 모으고, 도메인마다 OpenAI를 병렬 호출해 소견을 낸 뒤
// 마지막에 하나로 합친다 (image.png "3개 system prompt 병렬 호출 후 합치는 구조").
// OPENAI_API_KEY가 없으면(로컬 개발 중 키 미설정) 도메인별 컨텍스트를 그대로 보여주는 개발용
// 폴백을 준다 — 화면 전체 흐름을 키 없이도 끝까지 테스트할 수 있다.
//
// 근거(evidence)는 각 도메인이 어떤 기록(날짜·종류)을 봤는지 사람이 읽을 수 있는 문자열로 같이
// 내려준다 — DB 스키마 v0.3 §9.2 agent_messages.evidence(근거 레코드 ID 목록) 설계와 같은 취지를
// mock 단계에서 문자열로 구현한 것. 화면에는 "📎 근거" 칩으로 보여준다(TeacherAgentWidget).
//
// (2026-09-18) 합친 답변만 보이면 어떤 도메인 보조가 뭐라고 했는지 구분이 안 된다는 피드백을 받아,
// domainFindings(도메인별 라벨+소견+근거)도 같이 내려준다 — 최종 답변은 여전히 "요약"으로 위에 두고,
// 화면에서 그 아래 펼쳐서 보여준다(TeacherAgentWidget). 클라이언트는 서버 전용(context.ts)의
// DOMAIN_LABEL을 직접 import할 수 없어서(그 파일 상단에 "server-only") 라벨은 여기서 문자열로 미리
// 박아 내려보낸다.
//
// TODO(다음 단계): agent_threads/agent_messages(DB 스키마 v0.3 §9.1~§9.2)에 대화를 영구 저장하는 건
// 교사 인증이 붙은 뒤로 미룬다 — 지금은 auth.uid()가 없어서 RLS 쓰기 정책을 만족할 수 없다.

import { NextResponse } from "next/server";
import { buildAgentContext, DOMAIN_LABEL, type DomainContext } from "@/components/teacher/agent/context";
import { buildDomainSystemPrompt, buildMergeSystemPrompt } from "@/components/teacher/agent/prompt";
import { callTeacherAgentModel, hasOpenAIKey } from "@/lib/openai/teacherAgentModel";

export const runtime = "nodejs";

type RequestBody = { question?: unknown; studentId?: unknown };
type DomainFinding = DomainContext & { finding: string };

async function runDomain(domain: DomainContext, question: string, studentName: string | null): Promise<DomainFinding> {
  if (!domain.text) return { ...domain, finding: "이 영역에는 참고할 기록이 없습니다." };
  try {
    const finding = await callTeacherAgentModel(
      buildDomainSystemPrompt(domain.domain, studentName),
      `${domain.text}\n\n[교사 질문]\n${question}`,
      15_000,
    );
    return { ...domain, finding };
  } catch {
    // 도메인 하나가 실패해도 전체 답변을 막지 않는다 — 원본 컨텍스트를 그대로 소견 대신 보여준다.
    return { ...domain, finding: domain.text };
  }
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
  const studentId = typeof body.studentId === "string" && body.studentId.trim() ? body.studentId.trim() : null;

  try {
    const { studentName, domains } = await buildAgentContext(studentId, question);
    const evidence = domains.flatMap((d) => d.evidence);

    if (!hasOpenAIKey()) {
      const domainFindings = domains.map((d) => ({
        domain: d.domain,
        label: DOMAIN_LABEL[d.domain],
        finding: d.text || "참고할 기록이 없습니다.",
        evidence: d.evidence,
      }));
      const answer = `[개발용 응답 · OpenAI 키 미설정]\n\n` + domainFindings.map((f) => `[${f.label}]\n${f.finding}`).join("\n\n");
      return NextResponse.json(
        { answer, studentName, evidence, domainFindings, mocked: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const findings = await Promise.all(domains.map((d) => runDomain(d, question, studentName)));
    const domainFindings = findings.map((f) => ({
      domain: f.domain,
      label: DOMAIN_LABEL[f.domain],
      finding: f.finding,
      evidence: f.evidence,
    }));
    const mergeInput =
      findings.map((f) => `[${DOMAIN_LABEL[f.domain]} 소견]\n${f.finding}`).join("\n\n") +
      `\n\n[교사 질문]\n${question}`;
    const answer = await callTeacherAgentModel(buildMergeSystemPrompt(studentName), mergeInput, 20_000);

    return NextResponse.json(
      { answer, studentName, evidence, domainFindings, mocked: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "답변을 만들지 못했습니다.";
    return NextResponse.json({ message }, { status: 502 });
  }
}

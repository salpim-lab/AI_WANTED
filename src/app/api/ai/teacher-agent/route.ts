// 담당: 이지현
// 선생님 agent (협진 챗봇) — 교사 화면 어디서나 뜨는 전역 챗봇의 서버 쪽.
// 컨텍스트는 components/teacher/agent/context.ts(이지현 소유, 김현우의 조회 함수 재사용)로 모으고,
// 답변은 lib/openai/teacherAgentModel.ts(이지현 소유)로 만든다.
// OPENAI_API_KEY가 없으면(로컬 개발 중 키 미설정) 컨텍스트를 정리해서 그대로 보여주는 개발용
// 폴백을 준다 — 화면 전체 흐름(질문 → 컨텍스트 조회 → 답변 표시)을 키 없이도 끝까지 테스트할 수 있다.
//
// TODO(다음 단계): agent_threads/agent_messages(DB 스키마 v0.3 §9.1~§9.2)에 대화를 영구 저장하는 건
// 교사 인증이 붙은 뒤로 미룬다 — 지금은 auth.uid()가 없어서 RLS 쓰기 정책을 만족할 수 없다.

import { NextResponse } from "next/server";
import { buildAgentContext } from "@/components/teacher/agent/context";
import { buildSystemPrompt } from "@/components/teacher/agent/prompt";
import { callTeacherAgentModel, hasOpenAIKey } from "@/lib/openai/teacherAgentModel";

export const runtime = "nodejs";

type RequestBody = { question?: unknown; studentId?: unknown };

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
    const { studentName, contextText } = await buildAgentContext(studentId);
    const safeContext = contextText || "참고할 기록이 없습니다.";

    if (!hasOpenAIKey()) {
      const answer = `[개발용 응답 · OpenAI 키 미설정]\n\n${safeContext}`;
      return NextResponse.json(
        { answer, studentName, mocked: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const systemPrompt = buildSystemPrompt(studentName);
    const answer = await callTeacherAgentModel(systemPrompt, `${safeContext}\n\n[교사 질문]\n${question}`);
    return NextResponse.json(
      { answer, studentName, mocked: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "답변을 만들지 못했습니다.";
    return NextResponse.json({ message }, { status: 502 });
  }
}

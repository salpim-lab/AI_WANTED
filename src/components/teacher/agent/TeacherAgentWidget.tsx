// 담당: 이지현
// 교사 화면 어디서나 떠 있는 플로팅 챗봇. (teacher)/layout.tsx 에서만 마운트할 것.
// 대화 상태는 layout이 탭 이동 시 리마운트되지 않는 특성을 이용해 로컬 state로 유지
// (전역 상태관리 라이브러리 불필요 — useAgentChat 훅 안에서 useState로 충분).
// /api/ai/teacher-agent(이지현)로 실제 요청을 보낸다. OPENAI_API_KEY가 없는 로컬 환경에서도
// 라우트가 컨텍스트 그대로 보여주는 개발용 응답을 주므로 화면은 끝까지 확인 가능하다.
// 답변마다 어떤 기록을 근거로 했는지 "📎 근거" 칩으로 같이 보여준다(DB 스키마 v0.3 §9.2
// agent_messages.evidence와 같은 취지 — 지금은 레코드 ID 대신 사람이 읽는 문자열로 표시).
// 3개 도메인 보조(정서/학교생활/가정)가 각자 낸 소견을 먼저 보여주고, 그 아래 "🧩 종합의견"으로
// 최종 답변을 잇는다 — 토글로 접어두지 않고 항상 다 보이게 한다(route.ts가 domainFindings로 내려줌).
//
// (2026-09-19) 질문창 위에 도메인 선택 칩 3개를 둔다 — 하나도 안 고르면 라이트 모드(답 하나만,
// 가벼운 질문용), 하나 고르면 그 도메인 답만(작은 라벨만 붙고 카드/종합의견은 안 나옴), 2~3개
// 고르면 지금까지 하던 대로 카드+종합의견이 나온다. "모든 질문에 4개씩 나와서 방대하다"는
// 피드백으로 추가.
//
// (2026-09-19) UI를 Tailwind로 다시 짬 — docs/ARCHITECTURE.md 원칙 6번(화면별 점진적 전환)에 따라
// 제 담당 화면부터 시작. styles/prototype-teacher-shared.css의 .btn 계열은 더 안 쓴다(전부 Tailwind).
// 응답이 3~8초 걸리는데 그동안 아무 표시가 없었던 것도 같이 고쳐서, 보내는 동안 타이핑 점 3개를 보여준다.
// 패널은 대화가 없어도 답변이 있을 때와 같은 높이로 뜬다(h-[600px] 고정) — 열자마자 작았다가
// 답변 나오면 커지는 게 어색하다는 피드백.

"use client";

import { useEffect, useRef } from "react";
import { useAgentChat, type AgentDomain, type DomainFinding } from "./useAgentChat";
// 로봇 이모지(🤖)는 차갑다는 피드백 → 학생 쪽 브랜드 얼굴(SalpimFace)로 바꿔봤는데 그것도 안 예쁘다는
// 피드백 → 올빼미로 교체 (AgentOwlIcon, 이 폴더 안에서 직접 만든 아이콘, 단독 소유).
import AgentOwlIcon from "./AgentOwlIcon";
// (2026-09-19) 도메인 카드 색깔바를 사이트 신호등 색과 통일해달라는 피드백. 처음엔 김현우 소유
// shared/signalStyles.ts(SIGNAL_DOT)를 썼는데, 그건 "교사 화면" 신호등 색이고 담당자가 곧 학생
// 화면 기준으로 다시 맞출 예정이라고 함 — 그러면 여기도 같이 틀어진다. 진짜 원본은
// lib/constants/colors.ts(이유민 소유, SIGNAL_COLORS)의 hex 값 — "여기 값만 고치면 전체 앱에
// 반영되도록 항상 이걸 참조할 것"이라고 파일에 명시돼 있는 SSOT라서, 교사 화면 쪽 색이 나중에
// 바뀌어도 이 컴포넌트는 계속 학생 화면과 같은 색을 쓰게 된다. Tailwind 클래스 대신 hex를 인라인
// style로 직접 적용한다(className으로 하려면 hex를 문자열로 박아 넣어야 해서 SSOT를 못 따라간다).
import { SIGNAL_COLORS } from "@/lib/constants/colors";

// context.ts(server-only)의 DOMAIN_LABEL을 클라이언트에서 못 불러오니 여기서 아이콘·짧은 라벨을
// 따로 정의한다 — 값("emotion"|"learning"|"home")만 서버와 맞으면 된다.
// (DomainFinding.domain은 string이라 조회 키도 string으로 열어둔다 — AgentDomain으로 좁히면
// f.domain 인덱싱에서 타입 에러가 난다.)
// barColor는 신호등 색 순서(초록·노랑·남색)를 그대로 매긴 것 — 실제 정서/학교생활/가정 상태를
// 나타내는 색은 아니고, 세 카드를 구분하는 용도로 사이트 색상 팔레트를 재사용한 것뿐이다.
const DOMAIN_STYLE: Record<string, { icon: string; barColor: string; label: string }> = {
  emotion: { icon: "💚", barColor: SIGNAL_COLORS.green.hex, label: "정서" },
  learning: { icon: "📔", barColor: SIGNAL_COLORS.yellow.hex, label: "학교생활" },
  home: { icon: "🏠", barColor: SIGNAL_COLORS.navy.hex, label: "가정 연계" },
};
const DOMAIN_ORDER: AgentDomain[] = ["emotion", "learning", "home"];

function EvidenceChips({ evidence }: { evidence: string[] }) {
  if (evidence.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {evidence.map((e, i) => (
        <span
          key={i}
          className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
        >
          📎 {e}
        </span>
      ))}
    </div>
  );
}

function DomainFindings({ findings }: { findings: DomainFinding[] }) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      {findings.map((f) => {
        const style = DOMAIN_STYLE[f.domain] ?? { icon: "🔹", barColor: "#d1d5db" };
        return (
          <div key={f.domain} className="flex gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
            <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: style.barColor }} aria-hidden />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="text-[11px] font-bold text-gray-600">
                {style.icon} {f.label}
              </div>
              <div className="whitespace-pre-line text-xs text-gray-900">{f.finding}</div>
              <EvidenceChips evidence={f.evidence} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 self-start rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}

export default function TeacherAgentWidget() {
  const {
    messages,
    open,
    setOpen,
    input,
    setInput,
    send,
    sending,
    scopedStudentName,
    studentId,
    selectedDomains,
    toggleDomain,
  } = useAgentChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  return (
    // 바깥 틀은 클릭을 받지 않는다(pointer-events-none) — 닫힌 창도 자리(360×600)는 차지해서,
    // 틀이 클릭을 받으면 오른쪽 아래의 보이지 않는 상자가 그 밑 화면의 버튼을 막는다.
    // 클릭은 열린 창과 🦉 버튼만 받는다(pointer-events-auto). (2026-09-19 김현우 수정 — 이지현 님과 PR 공유)
    <div className="pointer-events-none fixed right-5 bottom-5 z-[1500] flex flex-col items-end gap-2.5">
      <div
        className={`flex h-[600px] w-[360px] max-h-[80vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5 transition-all duration-150 ease-out origin-bottom-right ${
          open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <AgentOwlIcon className="h-7 w-7" />
            <span className="text-sm font-bold text-gray-900">살핌 도우미</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="닫기"
            className="grid h-6 w-6 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {studentId && (
          <div className="border-b border-indigo-100 bg-indigo-50 px-4 py-1.5 text-[11px] font-medium text-indigo-700">
            📌 {scopedStudentName ?? "이 페이지의 학생"} 기준으로 답해요
          </div>
        )}

        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5">
          {messages.length === 0 && (
            <div className="rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-500">
              우리 반 아이들 기록에 대해 궁금한 걸 물어보세요.
              <br />
              예: &quot;오늘 살펴볼 아이 있어?&quot;
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex max-w-[92%] flex-col gap-1.5 ${m.role === "user" ? "self-end items-end" : "self-start items-start"}`}
            >
              {m.domainFindings && m.domainFindings.length > 0 && (
                <>
                  <DomainFindings findings={m.domainFindings} />
                  <div className="mt-0.5 text-[11px] font-bold text-gray-500">🧩 종합의견</div>
                </>
              )}
              {m.respondedDomain && (
                <div className="text-[11px] font-bold text-gray-500">
                  {DOMAIN_STYLE[m.respondedDomain]?.icon} {DOMAIN_STYLE[m.respondedDomain]?.label} 관점
                </div>
              )}
              <div
                className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  m.role === "user" ? "rounded-br-sm bg-indigo-600 text-white" : "rounded-bl-sm bg-gray-100 text-gray-900"
                }`}
              >
                {m.text}
              </div>
              {!m.domainFindings && m.evidence && <EvidenceChips evidence={m.evidence} />}
            </div>
          ))}
          {sending && <TypingDots />}
        </div>

        <div className="border-t border-gray-100 px-2.5 pt-2">
          {/* 안내 문구를 칩 위에 둔다 — 행동(칩 선택)보다 먼저 읽혀야 하는 정보라 위가 자연스럽고,
              가로 폭을 혼자 다 쓰니 줄바꿈 걱정도 없다. */}
          <p className="mb-1 text-[10px] text-gray-400">관점을 선택하면 그 영역을 자세히 답해요!</p>
          <div className="flex flex-wrap gap-1.5">
            {DOMAIN_ORDER.map((domain) => {
              const style = DOMAIN_STYLE[domain];
              const active = selectedDomains.includes(domain);
              return (
                <button
                  key={domain}
                  type="button"
                  onClick={() => toggleDomain(domain)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? "border-indigo-500 bg-indigo-600 text-white"
                      : "border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                  }`}
                >
                  {style.icon} {style.label}
                </button>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-1.5 border-t border-gray-100 p-2.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="질문을 입력하세요…"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="grid place-items-center rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            전송
          </button>
        </form>
      </div>

      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "살핌 도우미 닫기" : "살핌 도우미 열기"}
        className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-white shadow-lg shadow-indigo-500/30 ring-1 ring-black/5 transition-all duration-200 hover:scale-105 hover:shadow-[0_0_30px_8px_rgba(255,255,255,0.9)] hover:ring-2 hover:ring-white/90 active:scale-95"
      >
        {open ? (
          <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xl text-white">
            ✕
          </span>
        ) : (
          <AgentOwlIcon className="h-11 w-11" />
        )}
      </button>
    </div>
  );
}

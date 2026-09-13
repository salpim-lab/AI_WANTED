// 담당: 이유민
// AI 꼬리질문(등교)/고정질문(하교) 대화 화면. 텍스트 입력이 아니라 녹음(VoiceRecorder) 기반.
// 참고: docs/prototype/prototype-student.html #s3 (.chat-area)
// 흐름: VoiceRecorder로 녹음 → /api/ai/transcribe → 텍스트 → /api/ai/chat

import VoiceRecorder from "./VoiceRecorder";

export default function ChatPanel({
  flow,
}: {
  flow: "checkin" | "checkout";
}) {
  return (
    <section>
      {/* TODO(이유민): 대화 말풍선 렌더 */}
      <VoiceRecorder onRecorded={() => {}} />
    </section>
  );
}

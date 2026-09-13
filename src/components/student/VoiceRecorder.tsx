// 담당: 이유민
// 마이크 버튼. 지금은 답장칩(reply-chip)과 나란히 두는 자리표시자 — 실제 녹음/STT 연결은
// useVoiceRecorder + /api/ai/transcribe 붙일 때 여기서 처리. 지금은 누르면 녹음 중 표시만 토글.

"use client";

import { useState } from "react";

export default function VoiceRecorder({
  onRecorded,
}: {
  onRecorded?: (transcript: string) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);

  return (
    <button
      type="button"
      className={"voice-record-btn" + (isRecording ? " recording" : "")}
      onClick={() => {
        // TODO(이유민): useVoiceRecorder()로 교체 — 녹음 종료 시 /api/ai/transcribe 호출 후 onRecorded(transcript)
        setIsRecording((v) => !v);
      }}
      aria-label="음성으로 답하기"
    >
      🎤
    </button>
  );
}

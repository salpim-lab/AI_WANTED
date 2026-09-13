// 담당: 이유민
// MediaRecorder API 래핑 훅. 녹음 종료 시 Blob을 반환하되, 호출부(VoiceRecorder)가
// /api/ai/transcribe 로 보낸 직후 참조를 버리는 걸 전제로 설계할 것 (오디오 영구 저장 금지).

"use client";

export function useVoiceRecorder() {
  // TODO(이유민): start(), stop() → Blob 반환
  return {
    isRecording: false,
    start: () => {},
    stop: async (): Promise<Blob | null> => null,
  };
}

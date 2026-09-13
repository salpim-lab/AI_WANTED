// 담당: 이유민
// 마이크 버튼 + 녹음 UI (파형 등). useVoiceRecorder 훅으로 MediaRecorder 제어.
// 주의: 녹음된 오디오 Blob은 /api/ai/transcribe 로 전송 후 폐기 — 클라이언트에도 영구 저장 금지.

"use client";

export default function VoiceRecorder({
  onRecorded,
}: {
  onRecorded: (transcript: string) => void;
}) {
  // TODO(이유민): useVoiceRecorder() 사용, 녹음 종료 시 /api/ai/transcribe 호출
  return <button type="button">{/* 마이크 아이콘 */}</button>;
}

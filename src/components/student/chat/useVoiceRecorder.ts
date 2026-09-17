// 담당: 이유민
// 녹음 + 파생 수치 측정.
//
// ⚠️ 원칙(기획안 §8.1): 아동 음성은 생체정보에 준한다.
//    오디오 Blob 은 이 훅과 전사 요청 안에서만 존재하고, 전사가 끝나면 폐기한다.
//    DB·Storage·전역 state 에 오디오를 넣는 코드를 여기에 추가하면 안 된다.
//
// 종료는 아이가 직접 누른다. 무음 자동 종료를 쓰지 않는 이유:
// 기획안의 파생 수치 예시에 "무음 구간 2회 (1.8s, 1.3s)" 가 있다.
// 아이는 원래 말하다 1~2초씩 멈칫하므로, 임계값을 짧게 잡으면 말 도중에 끊기고
// 길게 잡으면 어색하게 기다린다. 끊기는 쪽은 "내 말을 안 들어줬다"는 경험이 된다.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASK_IF_DONE_MS,
  MAX_RECORDING_MS,
  countSilences,
  meanLoudness,
  type UtteranceProsody,
} from "@/lib/chat/prosody";

const SAMPLE_MS = 100;

export type RecorderStatus = "idle" | "requesting" | "recording" | "processing" | "denied" | "error";

export type RecordingResult = {
  /** 전사에 보낼 오디오. 사용 후 참조를 버린다 */
  audio: Blob;
  /** index 와 syllables_per_sec 는 호출한 쪽에서 채운다 */
  prosody: Omit<UtteranceProsody, "index" | "syllables_per_sec">;
};

export function useVoiceRecorder({
  /** 질문이 화면에 뜬 시각. 응답 지연(response_delay_sec) 계산의 기준 */
  promptShownAt,
  onResult,
}: {
  promptShownAt: number | null;
  onResult: (result: RecordingResult) => void;
}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [askIfDone, setAskIfDone] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelsRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setStatus("processing");
    rec.stop();
  }, []);

  const start = useCallback(async () => {
    setStatus("requesting");
    setAskIfDone(false);
    levelsRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("denied");
      return;
    }
    streamRef.current = stream;

    // 음량 측정용. 녹음과 별개 경로라 녹음 품질에 영향을 주지 않는다.
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const chunks: BlobPart[] = [];
    const rec = new MediaRecorder(stream);
    recorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      const durationSec = (Date.now() - startedAtRef.current) / 1000;
      const levels = levelsRef.current;
      const { silence_count, silence_total_sec } = countSilences(levels, SAMPLE_MS);
      const audio = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      cleanup();
      setStatus("idle");
      setElapsedMs(0);
      setLevel(0);
      setAskIfDone(false);
      onResult({
        audio,
        prosody: {
          duration_sec: +durationSec.toFixed(2),
          response_delay_sec: promptShownAt
            ? +((startedAtRef.current - promptShownAt) / 1000).toFixed(2)
            : 0,
          silence_count,
          silence_total_sec,
          loudness_raw: meanLoudness(levels),
        },
      });
    };

    startedAtRef.current = Date.now();
    lastVoiceAtRef.current = Date.now();
    rec.start();
    setStatus("recording");

    timerRef.current = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      // 128 이 무음 기준선. 편차의 평균을 0~1 로 정규화한다.
      let sum = 0;
      for (const v of buf) sum += Math.abs(v - 128);
      const lv = Math.min(1, sum / buf.length / 64);
      levelsRef.current.push(lv);
      setLevel(lv);

      const now = Date.now();
      if (lv >= 0.02) lastVoiceAtRef.current = now;
      setElapsedMs(now - startedAtRef.current);
      // 조용하면 물어보기만 한다. 끄지 않는다.
      setAskIfDone(now - lastVoiceAtRef.current >= ASK_IF_DONE_MS);
      // 상한은 지킨다 — 마이크를 켜둔 채 방치되는 것을 막는다.
      if (now - startedAtRef.current >= MAX_RECORDING_MS) stop();
    }, SAMPLE_MS);
  }, [cleanup, onResult, promptShownAt, stop]);

  return { status, elapsedMs, level, askIfDone, start, stop };
}

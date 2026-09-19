// 담당: 이유민
// 개발 전용 — 편지 닫기 동작을 눈으로 보며 맞추는 패널. /checkin?tune=1 에서만 뜬다.
// 값이 정해지면 letterMotion.ts 의 기본값에 옮기고 이 패널은 지운다.
//
// 스테이지(.tablet-stage)는 container-type 때문에 고정 위치(fixed) 요소를 가둬 버려서
// document.body 로 꺼내 그린다.
"use client";

import { createPortal } from "react-dom";
import type { LetterMotion } from "./letterMotion";

const FIELDS: { key: keyof LetterMotion; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "dropDelay", label: "봉투 내려가기 시작", min: 0.3, max: 1.4, step: 0.05, unit: "s" },
  { key: "dropDuration", label: "내려가는 시간", min: 0.3, max: 1.6, step: 0.05, unit: "s" },
  { key: "dropDistance", label: "내려가는 거리", min: 20, max: 110, step: 2, unit: "cqh" },
  { key: "tilt", label: "기울기", min: -8, max: 8, step: 0.5, unit: "°" },
  { key: "greetDelay", label: "인사 시작", min: 0.4, max: 2.2, step: 0.05, unit: "s" },
];

export default function LetterMotionTuner({
  value,
  onChange,
  onReplay,
}: {
  value: LetterMotion;
  onChange: (next: LetterMotion) => void;
  onReplay: () => void;
}) {
  if (typeof document === "undefined") return null;
  const summary = FIELDS.map((f) => `${f.key}: ${value[f.key]}`).join(", ");

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 9999,
        width: 280,
        padding: 14,
        borderRadius: 12,
        background: "rgba(255,255,255,0.96)",
        boxShadow: "0 6px 24px rgba(30,30,60,0.2)",
        font: "13px/1.4 system-ui, sans-serif",
        color: "#23284a",
      }}
    >
      <strong style={{ display: "block", marginBottom: 8 }}>편지 닫기 조절 (개발 전용)</strong>
      {FIELDS.map((f) => (
        <label key={f.key} style={{ display: "block", marginBottom: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{f.label}</span>
            <span>
              {value[f.key]}
              {f.unit}
            </span>
          </span>
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step}
            value={value[f.key]}
            onChange={(e) => onChange({ ...value, [f.key]: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
        </label>
      ))}
      <button
        type="button"
        onClick={onReplay}
        style={{
          width: "100%",
          padding: "8px 0",
          border: 0,
          borderRadius: 8,
          background: "#6c63ff",
          color: "#fff",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        다시 열고 닫아 보기
      </button>
      {/* 마음에 드는 값을 그대로 복사해서 알려주면 기본값으로 고정한다 */}
      <p style={{ margin: "8px 0 0", fontSize: 11, color: "#6b7090", wordBreak: "break-all" }}>{summary}</p>
    </div>,
    document.body,
  );
}

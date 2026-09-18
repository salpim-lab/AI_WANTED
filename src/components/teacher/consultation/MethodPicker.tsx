// 담당: 김현우
// 학부모 상담 팝업(상담 예약·상담 기록·일정 변경)의 "상담 방식" 고르기 — 전화/방문/온라인.
// 옆 칸 "상담 대상" 입력창과 나란히 놓이므로 제목은 같은 fieldLabel(<legend>는 브라우저가 위 여백을 따로 계산해
// 옆 제목과 줄이 어긋난다), 버튼 줄은 입력창과 같은 높이(h-9)로 세 칸을 꽉 채운다.
// 폼 제출 값은 name="method" 라디오로 나간다.

"use client";

import { fieldLabel } from "@/components/shared/ui";
import type { ConsultationMethod } from "@/lib/types/teacherRecord";

const METHODS: { value: ConsultationMethod; label: string }[] = [
  { value: "phone", label: "전화" },
  { value: "visit", label: "방문" },
  { value: "online", label: "온라인" },
];

const segment =
  "flex h-full cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[#e6e2fb] bg-white/80 text-xs font-semibold text-[#7d849b] transition-colors hover:border-[#8b83ff] hover:text-[#635bff] peer-checked:border-[#635bff] peer-checked:bg-[#ede9ff] peer-checked:text-[#3f37c9] peer-focus-visible:ring-2 peer-focus-visible:ring-[#b9b2f5]";

export default function MethodPicker({
  id,
  value,
  onChange,
}: {
  /** 제목과 라디오 묶음을 잇는 id — 한 화면에 여러 개가 뜰 수 있어 부르는 쪽이 정한다 */
  id: string;
  value: ConsultationMethod;
  onChange: (method: ConsultationMethod) => void;
}) {
  return (
    <div>
      <span id={id} className={fieldLabel}>
        상담 방식
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid h-9 grid-cols-3 gap-1.5">
        {METHODS.map((m) => (
          <label key={m.value} className="block h-full">
            <input
              type="radio"
              name="method"
              value={m.value}
              checked={value === m.value}
              onChange={() => onChange(m.value)}
              className="peer sr-only"
            />
            <span className={segment}>{m.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

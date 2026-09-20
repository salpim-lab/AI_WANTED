// 담당: 김현우
// 아이 프로필 그림. 학생 화면과 같은 그림(public/students/<성 뺀 이름>.png)을 쓴다 —
// 경로는 lib/students/photo.ts(이유민)의 studentPhotoPath 한 곳에서만 정한다.
// 그림은 시드 학생용 AI 생성 이미지다(실제 아동 사진 아님). 그림이 없거나 못 불러오면 이름 첫 글자로 대신한다.
//   size="lg": 아이 상세 머리 / size="sm": 자리 배치도 카드 / size="chat": 대화 말풍선 옆 (동그라미)

"use client";

import { useState } from "react";
import { studentPhotoPath } from "@/lib/students/photo";

const SIZE = {
  lg: { box: "size-14 rounded-[20px]", text: "text-2xl" },
  sm: { box: "size-8 rounded-xl", text: "text-sm" },
  seat: { box: "size-9 rounded-xl lg:h-[44%] lg:w-auto lg:aspect-square lg:rounded-2xl", text: "text-sm lg:text-2xl" },
  chat: { box: "size-9 rounded-full", text: "text-base" },
} as const;

export default function StudentAvatar({
  name,
  initial,
  size = "lg",
}: {
  name: string;
  initial: string;
  size?: keyof typeof SIZE;
}) {
  const src = studentPhotoPath(name);
  const [failed, setFailed] = useState(false);
  const { box, text } = SIZE[size];

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-[#8b83ff] to-[#635bff] font-[family-name:var(--font-cute)] text-white ${box} ${text} ${
          size === "lg" ? "shadow-[0_6px_16px_rgba(99,91,255,.3)]" : ""
        }`}
      >
        {initial}
      </div>
    );
  }

  return (
    // 작은 정사각 그림 하나라 next/image 최적화 없이 그대로 쓴다
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      onError={() => setFailed(true)}
      className={`shrink-0 bg-[#ede9ff] object-cover ${box} ${
        size === "lg" ? "shadow-[0_6px_16px_rgba(99,91,255,.25)] ring-2 ring-white" : "ring-1 ring-white"
      }`}
    />
  );
}

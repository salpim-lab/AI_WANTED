// 담당: 김현우
// 아이 상세 머리의 프로필 그림. 학생 화면과 같은 그림(public/students/<성 뺀 이름>.png)을 쓴다 —
// 경로는 lib/students/photo.ts(이유민)의 studentPhotoPath 한 곳에서만 정한다.
// 그림은 시드 학생용 AI 생성 이미지다(실제 아동 사진 아님). 그림이 없거나 못 불러오면 이름 첫 글자로 대신한다.

"use client";

import { useState } from "react";
import { studentPhotoPath } from "@/lib/students/photo";

export default function StudentAvatar({ name, initial }: { name: string; initial: string }) {
  const src = studentPhotoPath(name);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className="flex size-14 shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#8b83ff] to-[#635bff] font-[family-name:var(--font-cute)] text-2xl text-white shadow-[0_6px_16px_rgba(99,91,255,.3)]"
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
      onError={() => setFailed(true)}
      className="size-14 shrink-0 rounded-[20px] bg-[#ede9ff] object-cover shadow-[0_6px_16px_rgba(99,91,255,.25)] ring-2 ring-white"
    />
  );
}

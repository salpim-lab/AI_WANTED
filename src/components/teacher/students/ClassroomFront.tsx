// 담당: 김현우
// 자리 배치도 맨 아래 "교탁" 표시 — 교실 앞쪽이 어디인지 알려준다. 마지막 행이 교탁에 가장 가까운 줄이다.

export default function ClassroomFront({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex justify-center ${compact ? "mt-2" : "mt-4"}`}>
      <span
        className={`rounded-md bg-gray-200/70 font-semibold text-gray-500 ${
          compact ? "px-4 py-0.5 text-[10px]" : "px-8 py-1 text-[11px]"
        }`}
      >
        교탁
      </span>
    </div>
  );
}

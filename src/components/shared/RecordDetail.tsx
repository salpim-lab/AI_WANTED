// 담당: 이유민 (화면 담당은 김현우 — 기록 상세 모달의 모양만 맡는다)
// 이미 쓴 기록을 눌렀을 때 뜨는 상세 모달의 본문. 학생관찰일지·학생 상담·학부모 상담이 같이 쓴다.
// 작성 모달과 같은 말씨로 칸을 나눈다: 작은 굵은 라벨 + 연보라 테두리의 칸. 줄글로 죽 이어 쓰지 않고
// [종류·🔒] → [시각 카드들] → [아이·대상 카드] → [내용 카드] 순서로 끊어서 보여준다.
// 읽기 전용이라 입력칸이 아니라 값 카드로 그린다(수정 불가 원칙).

import type { ReactNode } from "react";
import { immutableBadge } from "@/components/shared/ui";

const valueBox = "rounded-xl border-[1.5px] border-[#e6e2fb] bg-[#faf9ff] px-3.5 py-2.5";
const label = "mb-1.5 block text-xs font-bold tracking-[0.5px] text-[#7d849b]";

export type DetailField = {
  label: string;
  /** 칸 안에 그릴 내용. 글자 하나면 문자열, 태그 링크 같은 건 노드로 */
  value: ReactNode;
  /** true면 두 칸을 다 차지한다 (여러 아이 태그처럼 긴 것) */
  wide?: boolean;
};

export default function RecordDetail({
  kind,
  kindClassName,
  fields,
  bodyLabel,
  body,
}: {
  /** "관찰" · "학부모 상담" 같은 종류 이름 */
  kind: string;
  /** 종류 태그의 색 (배경·글자) */
  kindClassName: string;
  /** 위쪽 카드들. 두 칸씩 나란히 놓인다 */
  fields: DetailField[];
  bodyLabel: string;
  body: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${kindClassName}`}>{kind}</span>
        <span className={immutableBadge}>🔒 수정 불가</span>
      </div>

      {fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className={`min-w-0${field.wide ? " sm:col-span-2" : ""}`}>
              <span className={label}>{field.label}</span>
              <div className={`${valueBox} text-[13px] font-semibold text-[#102a56] break-keep`}>{field.value}</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <span className={label}>{bodyLabel}</span>
        <div
          className={`${valueBox} max-h-[46vh] overflow-y-auto px-4 py-3 text-[13px] leading-[1.85] whitespace-pre-wrap text-[#102a56]`}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

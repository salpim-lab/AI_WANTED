// 담당: 김현우
// 학생관찰일지 "학생 상담 작성" 버튼 — 아이 본인과 나눈 상담 내용을 적는 팝업(Modal, size="wide")을 연다.
// 학부모 상담(ConsultationComposer, 학부모상담기록 화면)과는 다른 기록이다. 관찰일지 기록 버튼과 같은 글쓰기 폼
// (ObservationWriteForm, kind="student_consultation")을 같은 배치로 쓰고, 저장은 같은 Server Action(createObservation)에
// recordType="student_consultation"으로 표시해 관찰 기록과 구분한다. 저장하면 팝업이 닫힌다.
//
// 대시보드 "오늘 예정된 상담"의 학생 상담 줄에서 넘어오면(?consult=&at=) 이 팝업이 아이 이름과
// 상담 일시가 채워진 채로 바로 열린다 — 넘어오자마자 같은 정보를 손으로 다시 넣게 하지 않는다.
// 닫을 때는 주소에서 그 두 값을 지운다. 안 지우면 새로고침이나 뒤로가기 때 팝업이 되살아난다.

"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Modal from "@/components/shared/Modal";
import { boardActionButton } from "@/components/shared/ui";
import type { ClassStudent } from "@/lib/types/teacherRecord";
import ObservationWriteForm, { type WritePrefill } from "./ObservationWriteForm";

export default function StudentConsultationComposer({
  students,
  date,
  today,
  prefill,
}: {
  students: ClassStudent[];
  date: string;
  today: string;
  /** 예정돼 있던 상담에서 넘어온 경우 — 있으면 팝업이 채워진 채로 바로 열린다 */
  prefill?: WritePrefill;
}) {
  const [open, setOpen] = useState(Boolean(prefill));
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const close = () => {
    setOpen(false);
    if (!prefill) return;
    // 열리게 한 값만 걷어낸다 — 날짜·탭 같은 나머지 조건은 보던 대로 남긴다
    const next = new URLSearchParams(searchParams);
    next.delete("consult");
    next.delete("at");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <>
      <button type="button" className={boardActionButton} onClick={() => setOpen(true)}>
        학생 상담 작성
      </button>

      <Modal open={open} title="아이와 상담한 내용" onClose={close} size="wide">
        <ObservationWriteForm
          kind="student_consultation"
          students={students}
          date={date}
          today={today}
          prefill={prefill}
          onSaved={close}
        />
      </Modal>
    </>
  );
}

// 원본(불변) 데이터 전용 insert 함수 모음.
// 살핌_기획안.md "8.3 DB 구조 — 원본은 불변, 해석은 버전" 원칙:
//   - 여기서 다루는 데이터(등하교 대화 텍스트, 색 선택, 학생관찰일지, 학부모상담기록)는
//     한 번 쓰면 수정 API를 만들지 않는다. 수정이 필요하면 새 레코드를 추가한다.
//   - update/delete 함수를 이 파일에 추가하지 말 것. 해석/코멘트류는 interpretation.ts로.

// TODO(전체): insertSignalCheckIn(), insertObservationLog(), insertConsultationLog() 등

export {};

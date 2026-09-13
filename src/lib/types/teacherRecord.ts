// 담당: 김현우 — 교사 코멘트/관찰일지/상담기록 관련 타입. 이 파일은 김현우만 고친다.

export type TeacherComment = {
  id: string;
  studentId: string;
  date: string;
  content: string; // 해석/버전 데이터 — 교사가 저장한 최종본
  createdAt: string;
};

export type ObservationLog = {
  id: string;
  content: string;
  taggedStudentIds: string[];
  createdAt: string; // 서버 타임스탬프, 불변
};

export type ConsultationLog = {
  id: string;
  studentId: string;
  content: string;
  createdAt: string; // 서버 타임스탬프, 불변
};

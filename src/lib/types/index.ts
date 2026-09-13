// 도메인 타입 모음. Supabase 스키마가 정해지면 `npx supabase gen types typescript`로
// database.ts를 생성해 여기서 함께 export할 것.

// TODO: 팀 전체 — 아래는 초기 뼈대. 실제 테이블 설계 후 채워 넣기.

export type Student = {
  id: string;
  name: string;
  seatNumber: number;
};

export type SignalCheckIn = {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  flow: "checkin" | "checkout";
  color: "green" | "yellow" | "red" | "navy";
  transcript: string | null; // 원본, 불변
  createdAt: string;
};

export type TeacherComment = {
  id: string;
  studentId: string;
  date: string;
  content: string; // 해석/버전 데이터 — 교사가 저장한 최종본
  createdAt: string;
};

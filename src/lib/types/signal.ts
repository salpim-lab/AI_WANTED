// 담당: 이유민 — 등/하교 체크인 관련 타입. 이 파일은 이유민만 고친다.

export type SignalColor = "green" | "yellow" | "red" | "navy";

export type SignalCheckIn = {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  flow: "checkin" | "checkout";
  color: SignalColor;
  transcript: string | null; // 원본, 불변
  createdAt: string;
};

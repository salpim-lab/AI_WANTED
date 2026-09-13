// 기초 타입 — 자주 안 바뀌어야 정상. 고칠 일 생기면 팀에 먼저 공지할 것
// (거의 모든 화면이 Student를 참조하므로 여기 고치면 여러 명 코드가 동시에 깨짐).

export type Student = {
  id: string;
  name: string;
  seatNumber: number;
};

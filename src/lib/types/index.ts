// 배럴(barrel) 파일 — 절대 여기 직접 타입을 정의하지 말 것.
// 새 타입은 담당 도메인 파일(student.ts / signal.ts / teacherRecord.ts 등)에 추가하고
// 여기엔 export 한 줄만 추가한다 (한 줄 추가는 거의 충돌 안 남).

export * from "./student";
export * from "./signal";
export * from "./teacherRecord";

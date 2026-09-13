// OpenAI 클라이언트. 반드시 서버(app/api/**/route.ts)에서만 import할 것 —
// API 키가 클라이언트 번들에 노출되면 안 되므로 "use client" 파일에서 직접 호출 금지.
// TODO: 팀 전체 — `npm install openai` 설치 후 아래 구현.
//
// import OpenAI from "openai";
//
// export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export {};

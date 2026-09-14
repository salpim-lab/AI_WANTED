// 담당: 강윤지 — 등/하교 흐름과 독립적으로 3D 섬을 확인하는 화면.
import type { Metadata } from "next";
import IslandExperience from "@/components/student/island/IslandExperience";

export const metadata: Metadata = {
  title: "나의 작은 섬 · 살핌",
  description: "이야기가 자라는 나만의 3D 퍼즐 섬. 서로의 섬이 모여 우리 반 마을이 됩니다.",
};

export default function IslandPage() {
  return <IslandExperience/>;
}

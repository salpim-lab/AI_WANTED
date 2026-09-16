import type { Metadata } from "next";
import ItemLab from "@/components/items/ItemLab";

export const metadata: Metadata = { title: "3D 아이템 테스트 · 살핌" };

export default function ItemLabPage() {
  return <ItemLab />;
}

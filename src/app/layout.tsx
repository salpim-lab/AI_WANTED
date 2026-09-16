import type { Metadata } from "next";
import { Noto_Sans_KR, Gaegu, Jua } from "next/font/google";
import "./globals.css";

// 본문·제목용 한글 고딕. 이전에는 Geist(라틴 전용)만 있어서 한글이 전부
// 시스템 기본 폰트로 떨어졌다. 목업의 두꺼운 둥근 고딕을 내려면 900까지 필요.
const notoSansKr = Noto_Sans_KR({
  variable: "--font-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

// 제목·버튼용 둥근 한글 서체. 아이가 보는 화면이라 딱딱한 고딕보다 친근하다.
const jua = Jua({
  variable: "--font-cute",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

// 손글씨용. 선생님 편지 본문과 화면 가장자리 메모에만 쓴다.
const gaegu = Gaegu({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "살핌",
  description: "오늘도, 너의 마음을 들어요",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${jua.variable} ${gaegu.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

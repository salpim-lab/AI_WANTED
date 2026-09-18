import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 화면 하단에 뜨는 Next.js 개발용 오버레이(Route/Bundler 정보 아이콘) 끄기.
  // 빌드된 실제 배포판에는 원래부터 안 나오는 dev 전용 UI라 심사 화면엔 영향 없음 —
  // 로컬에서 보기 불편하다는 이유로만 끔.
  devIndicators: false,
};

export default nextConfig;

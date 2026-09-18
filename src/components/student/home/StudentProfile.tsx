// 담당: 이유민 (Claude 세션)
// 우측 상단 프로필 pill. 홈·마음·대화 세 화면이 모두 이걸 쓴다.
//
// photoSrc 를 안 넘기면 이름으로 찾는다. 화면마다 따로 넘기게 하면
// 한 화면에서 빠뜨려도 티가 안 나서, 실제로 홈과 마음 화면에는 사진이 없었다.
import { studentPhotoPath } from "@/lib/students/photo";

export default function StudentProfile({
  name,
  photoSrc,
}: {
  name: string;
  photoSrc?: string;
}) {
  const src = photoSrc ?? studentPhotoPath(name);
  return (
    <div className="sh-profile absolute right-[2.2cqw] top-[4.2cqh] z-[2] gap-[1.2cqw] py-[0.9cqh] pl-[0.9cqh] pr-[1.8cqw]">
      {src ? (
        <img
          src={src}
          alt=""
          className="sh-avatar"
          style={{ width: "5.4cqh", height: "5.4cqh" }}
          // 사진이 없는 아이도 있다. 깨진 이미지 대신 빈 원으로 남긴다.
          onError={(e) => {
            e.currentTarget.removeAttribute("src");
          }}
        />
      ) : (
        <span className="sh-avatar block" style={{ width: "5.4cqh", height: "5.4cqh" }} aria-hidden="true" />
      )}
      <span className="sh-cute text-[2.7cqh] text-[var(--sh-navy)]">{name}</span>
      <svg viewBox="0 0 8 14" style={{ height: "2.2cqh" }} aria-hidden="true">
        <path d="M1.5 1 6.5 7l-5 6" stroke="#9aa2ba" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

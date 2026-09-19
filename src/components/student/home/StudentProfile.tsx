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
    <div
      // 로고와 같은 기준(top 4.4cqh)을 쓴다.
      // 누를 수 있는 것처럼 보이지 않게 꺾쇠(>)를 두지 않는다 — 이 pill 은 이름표일 뿐
      // 상세 화면으로 가지 않는다. 오른쪽 여백은 사진 쪽(0.9cqh)보다 넓게 둔다:
      // 둥근 사진은 가장자리에 붙어도 되지만 글자는 붙으면 답답해 보인다.
      className="sh-profile absolute right-[2.2cqw] top-[4.4cqh] z-[2] gap-[1.4cqh] py-[0.9cqh] pl-[0.9cqh] pr-[2.6cqh]"
    >
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
    </div>
  );
}

// 담당: 이유민
// 등/하교 4단계: 대화에서 추출한 아이템 1개 미리보기 + "섬에 배치하러 가기" 버튼
// 참고: docs/prototype/prototype-student.html #s4

import type { Item } from "./mockScenarios";

export default function ItemReveal({
  active,
  item,
  onNext,
}: {
  active: boolean;
  item: Item | null;
  onNext: () => void;
}) {
  return (
    <div className={"screen" + (active ? " active" : "")} id="s4">
      <div className="s4-title">
        <div className="label">✨ 오늘의 아이템</div>
        <h2>새 아이템이 생겼어!</h2>
        <p>오늘 이야기에서 만들어졌어</p>
      </div>

      <div className="item-reveal">
        <div className="item-box">{item?.emoji ?? "🎁"}</div>
        <div className="item-name">{item?.name ?? ""}</div>
        <div className="item-reason">{item?.reason ?? ""}</div>
      </div>

      <div className="s4-bottom">
        <button className="btn-primary" onClick={onNext}>
          섬에 배치하러 가기 🏝
        </button>
        <div className="skip-note">나중에 배치해도 아이템은 사라지지 않아</div>
      </div>
    </div>
  );
}

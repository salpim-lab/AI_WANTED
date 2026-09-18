// 담당: 이유민
// 대화 말풍선.
//
// 목업의 메신저 타임스탬프는 넣지 않는다 — 초3~4 아이에게 필요 없고 화면만 복잡해진다.
// 시각이 필요한 건 교사 화면이지 아이 화면이 아니다.
//
// 아바타는 연속된 살핌 말풍선 중 첫 번째에만 붙인다.
// 매 말풍선마다 붙이면 같은 얼굴이 반복돼 시끄럽다.
import SalpimFace from "../SalpimFace";
import type { ChatBubble as BubbleData } from "../useCheckinFlow";

export default function ChatBubble({
  bubble,
  showAvatar,
  studentName = "",
  studentPhotoSrc,
}: {
  bubble: BubbleData;
  showAvatar: boolean;
  studentName?: string;
  studentPhotoSrc?: string;
}) {
  const mine = bubble.type === "user";

  if (mine) {
    // 아이 쪽은 말풍선이 오른쪽이므로 아바타도 오른쪽에 둔다.
    // 사진이 없으면 이름 끝 글자를 쓴다 — 성(김)보다 이름(준)이 그 아이답다.
    const initial = studentName.trim().slice(-1) || "나";
    return (
      <div className="chat-row chat-row--mine">
        <Bubble bubble={bubble} />
        {showAvatar ? (
          <span className="chat-avatar chat-avatar--me" aria-hidden="true">
            {studentPhotoSrc ? (
              // 사진이 없는 아이가 있을 수 있다. 깨진 이미지 대신 이름 글자를 남긴다.
              <img
                src={studentPhotoSrc}
                alt=""
                className="chat-avatar__photo"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="chat-avatar__initial">{initial}</span>
            )}
          </span>
        ) : (
          <span className="chat-avatar chat-avatar--empty" aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <div className="chat-row chat-row--ai">
      {!mine &&
        (showAvatar ? (
          <span className="chat-avatar chat-avatar--ai" aria-hidden="true">
            <SalpimFace className="chat-avatar__face" withSparkles={false} />
          </span>
        ) : (
          // 아바타가 없는 줄도 같은 자리에서 시작하도록 자리만 비워둔다
          <span className="chat-avatar chat-avatar--empty" aria-hidden="true" />
        ))}

      <Bubble bubble={bubble} />
    </div>
  );
}

/** 말풍선 본체. 전사를 기다리는 동안에는 점 세 개를 보인다 */
function Bubble({ bubble }: { bubble: BubbleData }) {
  if (bubble.pending) {
    return (
      <p className="chat-bubble chat-bubble--user chat-bubble--pending" aria-label="옮기는 중">
        <span />
        <span />
        <span />
      </p>
    );
  }
  return (
    <p className={`chat-bubble chat-bubble--${bubble.type}`}>
      {bubble.text.split("\n").map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </p>
  );
}

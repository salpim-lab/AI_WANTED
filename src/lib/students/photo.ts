// 담당: 이유민
// 아이 프로필 사진 경로.
//
// 지금은 시드 학생 20명의 AI 생성 이미지가 public/students/<이름>.png 에 있다.
// 실제 사진 업로드가 붙으면 이 함수 대신 students 테이블의 경로를 쓰게 된다.
// 그때까지 화면은 이 한 곳만 보게 해서, 바뀔 때 고칠 자리를 하나로 둔다.

/** "김민준" → "민준". 성을 뗀 이름이 파일명이다. */
export function givenName(fullName: string) {
  const name = fullName.trim();
  // 한국 성은 대개 한 글자다. 세 글자 이상이면 앞 한 글자를 성으로 본다.
  return name.length >= 3 ? name.slice(1) : name;
}

/** 사진이 없으면 화면이 이름 첫 글자로 대신하므로 null 을 돌려줘도 된다. */
export function studentPhotoPath(fullName: string): string | undefined {
  const given = givenName(fullName);
  if (!given) return undefined;
  return `/students/${encodeURIComponent(given)}.png`;
}

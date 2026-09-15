import { execFileSync } from "node:child_process";

const baseRef = process.env.GITHUB_BASE_REF;

if (!baseRef) {
  process.stdout.write("PR base가 없어 태스크 일지 diff 검사를 건너뜁니다.\n");
} else {
  const changedPaths = execFileSync(
    "git",
    ["diff", "--name-only", "-z", `origin/${baseRef}...HEAD`],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);

  const hasTaskLog = changedPaths.some(
    (path) =>
      path.startsWith("docs/task-logs/") &&
      path.endsWith(".md") &&
      path !== "docs/task-logs/TEMPLATE.md",
  );

  if (!hasTaskLog) {
    process.stderr.write(
      "이 PR에서 변경한 태스크 일지가 없습니다. docs/task-logs/*.md를 추가하거나 갱신하세요.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("이 PR에 태스크 일지가 포함되어 있습니다.\n");
  }
}

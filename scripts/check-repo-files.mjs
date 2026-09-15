import { execFileSync } from "node:child_process";

const trackedPaths = execFileSync("git", ["ls-files", "--cached", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);

const blockedPrefixes = [".sf/", ".sfdx/", "force-app/"];
const blockedFileNames = new Set(["sfdx-project.json", ".forceignore"]);
const blockedSuffixes = [".cls", ".trigger", ".apex", "-meta.xml"];

const blockedPaths = trackedPaths.filter((path) => {
  const normalized = path.toLowerCase();
  const fileName = normalized.split("/").at(-1);

  return (
    blockedPrefixes.some((prefix) => normalized.startsWith(prefix)) ||
    blockedFileNames.has(fileName) ||
    blockedSuffixes.some((suffix) => normalized.endsWith(suffix))
  );
});

if (blockedPaths.length > 0) {
  process.stderr.write(
    "Salesforce 관련 파일이 Git 추적 목록에 있습니다. 별도 저장소로 옮기고 AI_WANTED에서는 제거하세요.\n",
  );
  for (const path of blockedPaths) process.stderr.write(`- ${path}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Git 추적 파일에 Salesforce 관련 경로가 없습니다.\n");
}

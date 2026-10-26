// 把 gospel/ 下的人格内核 + 场景适配层打包成「开箱即用整包」
// 用法：node scripts/bundle.mjs
// 产物：prompts/whale-qq.md、prompts/whale-bili.md、prompts/whale-light.md
// 注意：整包是生成物，不要手改；改源文件（gospel/core.md、gospel/adapters/*.md）后重新跑。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 去掉 YAML frontmatter，只留正文 */
function stripFrontmatter(md) {
  if (!md.startsWith("---")) return md.trim();
  const end = md.indexOf("\n---", 3);
  if (end === -1) return md.trim();
  return md.slice(end + 4).replace(/^\s*\n/, "").trim();
}

/** light 档：从 core 里抽第二卷（八条禁忌）+ 第三卷（短句），保持规则，砍掉经文 */
function buildLight(core) {
  const lines = core.split("\n");
  const out = [];
  let inSection = false;
  for (const line of lines) {
    const isHead = /^##\s/.test(line);
    if (isHead) {
      inSection = /第二卷|第三卷/.test(line);
      if (inSection) out.push(line);
      continue;
    }
    if (!inSection) continue;
    // light 档不要经文的文艺段落，只要「福音践行」下的规则
    if (/^###\s*「经文」/.test(line)) { inSection = "skip-verse"; continue; }
    if (inSection === "skip-verse") {
      if (/^###\s*「福音践行」/.test(line)) inSection = true;
      else continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

const header = (title, extra) => `<!--
⚠️ 本文件由 scripts/bundle.mjs 自动生成，请勿手改。
源文件：gospel/core.md + gospel/adapters/${extra}
再生成：node scripts/bundle.mjs
-->
# ${title}

`;

const core = await readFile(join(ROOT, "gospel/core.md"), "utf8");
const coreBody = stripFrontmatter(core);
const qq = stripFrontmatter(await readFile(join(ROOT, "gospel/adapters/qq-group.md"), "utf8"));
const bili = stripFrontmatter(await readFile(join(ROOT, "gospel/adapters/bili-comment.md"), "utf8"));
const think = stripFrontmatter(await readFile(join(ROOT, "gospel/think.md"), "utf8"));

await mkdir(join(ROOT, "prompts"), { recursive: true });

await writeFile(
  join(ROOT, "prompts/whale-qq.md"),
  header("整包 · QQ 群聊版（core + qq-group + think）", "qq-group.md") + coreBody + "\n\n---\n\n" + qq + "\n\n---\n\n" + think + "\n",
  "utf8"
);
await writeFile(
  join(ROOT, "prompts/whale-bili.md"),
  header("整包 · 刷B站观影版（core + bili-comment + think）", "bili-comment.md") + coreBody + "\n\n---\n\n" + bili + "\n\n---\n\n" + think + "\n",
  "utf8"
);
await writeFile(
  join(ROOT, "prompts/whale-light.md"),
  header("轻量版 · 只带走八条禁忌与短句规则（~1.2k token）", "（无）") + buildLight(coreBody) + "\n\n---\n\n" + think + "\n",
  "utf8"
);

console.log("✓ prompts/whale-qq.md");
console.log("✓ prompts/whale-bili.md");
console.log("✓ prompts/whale-light.md");

#!/usr/bin/env node
// CLI 入口：读 stdin / 参数 → src/cli.mjs → 设置退出码。
// 用法：
//   node lint/bin/ai-flavor-lint.mjs --file lint/samples/bad.jsonl
//   cat chat.jsonl | node lint/bin/ai-flavor-lint.mjs --json
//   node lint/bin/ai-flavor-lint.mjs --file samples/bad.jsonl --html demo/report.html
import { runCli } from "../src/cli.mjs";

/** 从 stdin 读全文；TTY（终端直接跑）时返回 undefined，不阻塞 */
async function readStdin() {
  if (process.stdin.isTTY) return undefined;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/** 粗判参数里是否已经给了输入文件（避免无谓地等 stdin） */
function hasFileArg(argv) {
  const takesValue = new Set(["--file", "-f", "--html", "--threshold", "-t"]);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file" || a === "-f") return true;
    if (takesValue.has(a)) {
      i += 1;
      continue;
    }
    if (!a.startsWith("-")) return true;
  }
  return false;
}

const argv = process.argv.slice(2);
const wantsHelp = argv.includes("--help") || argv.includes("-h");
const stdinText = hasFileArg(argv) || wantsHelp ? undefined : await readStdin();

const exitCode = await runCli(argv, {
  stdinText,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
});

process.exitCode = exitCode;

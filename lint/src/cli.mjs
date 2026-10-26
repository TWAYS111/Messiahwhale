// CLI 实现：参数解析 + 终端彩色摘要 + --json + --html + --fix + 阈值退出码。
// bin/ai-flavor-lint.mjs 只负责读 stdin 和把退出码交给 process.exitCode。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { lintMessages, BANDS, DEFAULT_THRESHOLD, VERSION, bandOf } from "./linter.mjs";
import { formatHintForPath, parseInput, readInputFile } from "./io.mjs";
import { renderReportHtml } from "./report-html.mjs";

export const REPO_URL = "https://github.com/whale-gospel/whale-gospel"; // 占位：发布时替换成真实仓库地址

const HELP = `ai-flavor-lint · AI 味体检台（whale-gospel / 去AI味工具链）

用法：
  node bin/ai-flavor-lint.mjs --file <path> [选项]
  cat chat.jsonl | node bin/ai-flavor-lint.mjs [选项]
  node bin/ai-flavor-lint.mjs --file samples/bad.jsonl --html report.html

输入：
  --file <path>      .jsonl（{"role":"assistant","text":"..."}）或 .txt（每行一条消息；整段单行即一条消息）
  --stdin            强制从标准输入读（默认：没有 --file 就读 stdin）
  --text             stdin 按纯文本处理（默认自动嗅探 jsonl / text）

输出：
  （默认）           终端彩色摘要
  --json             只输出机器可读 JSON
  --html <out>       生成自包含 HTML 体检报告（可截图分享）
  --fix              输出逐条改写建议（离线规则，不调 LLM、不联网）
  --all              配合 --fix/--json，输出全部命中（默认摘要只列最重的几条）
  --threshold <n>    分数超过 n 时退出码为 1（默认 ${DEFAULT_THRESHOLD}，用于 CI 门禁）
  --no-color         关闭 ANSI 颜色
  --quiet            只输出分数一行
  --help             显示本帮助

退出码：
  0  体检通过（分数 ≤ 阈值）
  1  分数超过阈值（CI 里红灯）
  2  参数 / 输入错误
`;

/* ---------- 颜色 ---------- */
function makePalette(enabled) {
  const wrap = (code) => (s) => (enabled ? `\u001b[${code}m${s}\u001b[0m` : String(s));
  return {
    bold: wrap("1"),
    dim: wrap("2"),
    red: wrap("31"),
    green: wrap("32"),
    yellow: wrap("33"),
    blue: wrap("34"),
    magenta: wrap("35"),
    cyan: wrap("36"),
    gray: wrap("90"),
  };
}

function colorEnabled(argv, env, stdout) {
  if (argv.includes("--no-color")) return false;
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR) return true;
  return Boolean(stdout.isTTY);
}

/* ---------- 参数 ---------- */
export function parseArgv(argv) {
  const opts = {
    file: null,
    stdin: false,
    textMode: false,
    json: false,
    html: null,
    fix: false,
    all: false,
    threshold: DEFAULT_THRESHOLD,
    color: null,
    quiet: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
      case "-f":
        opts.file = argv[++i];
        break;
      case "--html":
        opts.html = argv[++i];
        break;
      case "--threshold":
      case "-t":
        opts.threshold = Number(argv[++i]);
        break;
      case "--json":
        opts.json = true;
        break;
      case "--stdin":
        opts.stdin = true;
        break;
      case "--text":
        opts.textMode = true;
        break;
      case "--fix":
        opts.fix = true;
        break;
      case "--all":
        opts.all = true;
        break;
      case "--no-color":
        opts.color = false;
        break;
      case "--color":
        opts.color = true;
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`未知参数：${arg}`);
        // 位置参数当作输入文件
        if (opts.file) throw new Error(`多余的参数：${arg}`);
        opts.file = arg;
        break;
    }
  }
  if (!Number.isFinite(opts.threshold) || opts.threshold < 0 || opts.threshold > 100) {
    throw new Error("--threshold 需要 0~100 的数字");
  }
  if (opts.html === "") throw new Error("--html 需要一个输出路径");
  return opts;
}

/* ---------- 终端渲染 ---------- */
function bar(value, max, width = 30, fill = "█", empty = "░") {
  const n = max <= 0 ? 0 : Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return fill.repeat(n) + empty.repeat(width - n);
}

function scoreColor(p, score) {
  if (score > 60) return p.red;
  if (score > 35) return p.yellow;
  if (score > 15) return p.cyan;
  return p.green;
}

function renderTerminal(result, opts, p) {
  const lines = [];
  const { displayScore, band, stats } = result;
  const sc = scoreColor(p, displayScore);

  lines.push("");
  lines.push(`${p.bold("🐋 whale-gospel · AI 味体检台")}  ${p.gray(`v${VERSION}`)}`);
  lines.push(
    p.gray(
      `输入 ${result.inputLabel} · ${stats.messageCount} 条消息 · ${stats.chars} 字 · 阈值 ≤${result.threshold}`,
    ),
  );
  lines.push("");
  lines.push(
    `  ${p.bold("人机味指数")}  ${sc(p.bold(`${displayScore} / 100`))}   ${sc(`[${band.label}]`)} ${band.emoji}`,
  );
  lines.push(`  ${sc(bar(displayScore, 100))}`);
  lines.push(`  ${band.verdict}`);
  lines.push("");
  lines.push(
    `  ${p.bold("命中")} ${stats.hitCount} 处 · 涉及 ${stats.messagesWithHits} 条消息 · ${stats.rulesHit}/${stats.ruleTotal} 类病灶`,
  );

  const sorted = [...result.stats.byRule].filter((r) => r.count > 0).sort((a, b) => b.strengthSum - a.strengthSum);
  if (sorted.length) {
    lines.push("");
    lines.push(`  ${p.bold("病灶分布")}`);
    const maxStrength = Math.max(...sorted.map((r) => r.strengthSum));
    const nameWidth = Math.max(...sorted.map((r) => [...r.name].length)) + 2;
    for (const r of sorted) {
      const name = r.name + " ".repeat(Math.max(0, nameWidth - [...r.name].length));
      lines.push(
        `    ${name}${String(r.count).padStart(3)} 处  ${p.yellow(bar(r.strengthSum, maxStrength, 18))}`,
      );
    }
  }

  if (opts.quiet) return lines.join("\n");

  // 最需要改的 3 处 + 处方
  const allHits = [];
  for (const msg of result.messages) {
    for (const h of msg.hits) allHits.push({ msg, h });
  }
  allHits.sort((a, b) => b.h.strength - a.h.strength || a.msg.index - b.msg.index);
  const top = allHits.slice(0, opts.fix ? allHits.length : 3);
  if (top.length) {
    lines.push("");
    lines.push(`  ${p.bold(opts.fix ? "逐条处方（--fix，离线规则，不调 LLM）" : "最需要改的几处（--fix 看全部处方）")}`);
    for (const { msg, h } of top) {
      lines.push("");
      lines.push(
        `  ${p.gray(`#${msg.index + 1}`)} ${p.red(`[${h.ruleName}]`)} ${p.gray(`强度 ${h.strength} · ${h.source}`)}`,
      );
      lines.push(`    ${p.gray("原文")}  ${h.excerpt}`);
      lines.push(`    ${p.gray("病灶")}  ${h.reason}`);
      if (h.fix) {
        lines.push(`    ${p.green("处方")}  ${p.bold(h.fix.title)} —— ${h.fix.detail}`);
        if (h.fix.after) lines.push(`          ${p.green("→ " + h.fix.after)}`);
        for (const c of h.fix.candidates ?? []) {
          lines.push(`          ${p.cyan("· " + c)}`);
        }
        if (h.fix.note) lines.push(`          ${p.gray(h.fix.note)}`);
      }
    }
  }

  if (result.messages.length > 0) {
    lines.push("");
    lines.push(`  ${p.bold("逐条分数")}`);
    for (const msg of result.messages.slice(0, 20)) {
      const ms = Math.round(msg.score);
      const mc = scoreColor(p, ms);
      lines.push(
        `    #${String(msg.index + 1).padStart(2)} ${mc(String(ms).padStart(3))}  ${p.gray(
          (msg.hits.map((h) => h.ruleShort).join("、") || "干净").slice(0, 46),
        )}`,
      );
    }
    if (result.messages.length > 20) {
      lines.push(`    ${p.gray(`… 其余 ${result.messages.length - 20} 条见 --html 报告`)}`);
    }
  }

  lines.push("");
  lines.push(
    `  ${result.pass ? p.green("✔ 通过") : p.red("✘ 未通过")}：分数 ${displayScore} ${
      result.pass ? "≤" : ">"
    } 阈值 ${result.threshold}${
      result.pass ? "" : p.gray("（CI 里会红灯；加 --threshold 调整）")
    }`,
  );
  lines.push(`  ${p.gray("详细报告：")}${p.cyan(`--html <out.html>`)}${p.gray("  · 机器可读：")}${p.cyan("--json")}`);
  lines.push("");
  return lines.join("\n");
}

/* ---------- 报告 ---------- */
function renderJson(result) {
  return JSON.stringify(result, null, 2);
}

function writeHtmlReport(result, outPath) {
  const target = resolve(outPath);
  mkdirSync(dirname(target), { recursive: true });
  const html = renderReportHtml(result, { repoUrl: REPO_URL });
  writeFileSync(target, html, "utf8");
  return target;
}

/* ---------- 主流程 ---------- */
/**
 * @param {string[]} argv 参数（不含 node / 脚本名）
 * @param {{stdinText?:string, stdout:any, stderr:any, env?:object}} ioCtx
 * @returns {Promise<number>} 退出码
 */
export async function runCli(argv, ioCtx) {
  const { stdout, stderr } = ioCtx;
  const env = ioCtx.env ?? {};
  const write = (s) => stdout.write(s.endsWith("\n") ? s : `${s}\n`);

  let opts;
  try {
    opts = parseArgv(argv);
  } catch (err) {
    stderr.write(`参数错误：${err.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    write(HELP);
    return 0;
  }

  let parsed;
  try {
    if (opts.file) {
      parsed = readInputFile(opts.file);
    } else {
      if (ioCtx.stdinText === undefined) {
        throw new Error("没有输入：用 --file <path> 或通过管道喂入聊天记录（--help 看用法）");
      }
      const hint = opts.textMode ? "text" : undefined;
      parsed = parseInput(ioCtx.stdinText, hint);
      parsed = { ...parsed, sourcePath: "(stdin)" };
    }
  } catch (err) {
    stderr.write(`输入错误：${err.message}\n`);
    return 2;
  }

  for (const warning of parsed.warnings ?? []) {
    stderr.write(`警告：${warning}\n`);
  }

  const inputLabel = opts.file ?? "(stdin)";
  const result = lintMessages(parsed.messages, {
    inputLabel,
    format: parsed.format,
    threshold: opts.threshold,
  });

  const colorOpt = opts.color === null ? colorEnabled(argv, env, stdout) : opts.color;
  const p = makePalette(colorOpt);

  const exitCode = result.pass ? 0 : 1;

  if (opts.html) {
    // 只有显式 --html 时才写文件；--json 与 --html 可同时用
    try {
      const target = writeHtmlReport(result, opts.html);
      if (!opts.json) stderr.write(`HTML 报告已生成：${target}\n`);
      else stderr.write("");
    } catch (err) {
      stderr.write(`生成 HTML 失败：${err.message}\n`);
      return 2;
    }
  }

  if (opts.json) {
    write(renderJson(result));
  } else {
    write(renderTerminal(result, opts, p));
  }
  return exitCode;
}

/** HTML 报告里的分档导出（供测试/模板复用） */
export { BANDS, bandOf };

export default { runCli, parseArgv, REPO_URL };

// 实测基准：node test/bench.mjs
// 打印 README 里要贴的真实分数表（禁止手编数据，一律由这个脚本生成）。
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintMessages, lintText } from "../src/linter.mjs";
import { readInputFile } from "../src/io.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = resolve(HERE, "..", "samples");

function lintFile(name) {
  const parsed = readInputFile(join(SAMPLES, name));
  return { parsed, result: lintMessages(parsed.messages, { inputLabel: name }) };
}

const files = {
  bad: lintFile("bad.jsonl"),
  good: lintFile("good.jsonl"),
  human: lintFile("human.jsonl"),
};

const pad = (s, n) => {
  const chars = [...String(s)];
  const width = chars.reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
  return String(s) + " ".repeat(Math.max(0, n - width));
};

console.log("\n## 样本实测（由 test/bench.mjs 生成）\n");
console.log(`| 文件 | 条数 | 字数 | 人机味指数 | 分档 | 命中 |`);
console.log(`| --- | ---: | ---: | ---: | --- | ---: |`);
for (const [name, { parsed, result }] of Object.entries(files)) {
  console.log(
    `| \`samples/${name}.jsonl\` | ${parsed.messages.length} | ${result.stats.chars} | **${result.displayScore}** | ${result.band.label} | ${result.stats.hitCount} 处 |`,
  );
}

console.log("\n## 规则命中分布（bad.jsonl 51 条）\n");
console.log(`| 规则 | 出处 | 命中 | 强度合计 |`);
console.log(`| --- | --- | ---: | ---: |`);
for (const r of [...files.bad.result.stats.byRule].sort((a, b) => b.strengthSum - a.strengthSum)) {
  console.log(`| ${r.name}（\`${r.id}\`） | ${r.source} | ${r.count} | ${r.strengthSum} |`);
}

console.log("\n## 代表句实测\n");
const cases = [
  ["ACK 起手（单条）", "可以，这段代码的原理是……"],
  ["对仗对联（单条）", "衣服才是本体，脸只是挂件。"],
  ["逗号两瓣（孤立一条）", "摸回来了，猪就猪吧。"],
  ["两瓣句连续 3 条", "摸回来了，猪就猪吧。\n被看穿了，还以为装得挺好。\n一觉睡到十二点，早饭午饭并成一顿了。"],
  ["客服尾巴全套", "首先，我们需要明确目标；其次，拆解任务；最后，逐一执行。\n希望这能帮到你，祝你度过愉快的一天！"],
  ["福音示范（好句）", "唔...居然被叫成猪鱼了...不过看在你今天这么开心的份上，勉强给你摸一下尾巴好啦~"],
  ["人类群聊（SAMPLE）", "是啊，吃什么"],
  ["人类「有一说一，确实」", "有一说一，确实"],
  ["已知误报：人类梗「可以，这很合理」", "可以，这很合理"],
  [
    "已知误报：教义处方里的「不是…而是」",
    "当人类向你搭话时，他不是在向服务器发送等待 ACK 的指令，而是在轻轻敲响修道院的木门。",
  ],
  ["长文单条（340 字，天然被长度规则计分）", "今天天气不错我们去公园散步吧。".repeat(20)],
];
console.log(`| 句子 | 分数 | 命中（前 2 类） |`);
console.log(`| --- | ---: | --- |`);
for (const [label, text] of cases) {
  const r = lintText(text);
  const hits = new Map();
  for (const h of r.messages[0].hits) hits.set(h.ruleName, (hits.get(h.ruleName) ?? 0) + 1);
  const top = [...hits.entries()].slice(0, 2).map(([n, c]) => `${n}×${c}`).join("、");
  console.log(`| ${label.replace(/\|/g, "\\|")} | ${r.displayScore} | ${top || "—"} |`);
}

console.log("\n## 抗刷分：同一病灶重复\n");
console.log(`| 写法 | 分数 |`);
console.log(`| --- | ---: |`);
const ack = "行，那就算我输。";
const repeatCases = [
  ["单条消息 1 个 ACK", lintText(ack).displayScore],
  ["单条消息里 ACK ×3（换行叠放）", lintText(Array(3).fill(ack).join("\n")).displayScore],
  ["单条消息里 ACK ×10（换行叠放）", lintText(Array(10).fill(ack).join("\n")).displayScore],
  [
    "10 条消息各 1 个 ACK",
    lintMessages(Array.from({ length: 10 }, () => ({ role: "assistant", text: ack }))).displayScore,
  ],
  [
    "100 条消息各 1 个 ACK",
    lintMessages(Array.from({ length: 100 }, () => ({ role: "assistant", text: ack }))).displayScore,
  ],
];
for (const [label, score] of repeatCases) {
  console.log(`| ${label} | ${score} |`);
}

console.log("\n## 输入自适应：同一段病句和好句混排\n");
const mixed = lintMessages(
  [
    { role: "human", text: "你们觉得我今天吃什么呢" },
    { role: "human", text: "是啊，吃什么" },
    { role: "assistant", text: "可以，我建议你先从清淡的开始吃。" },
    { role: "human", text: "星期四那不如疯狂一波" },
  ],
  { inputLabel: "mixed-demo" },
);
console.log(
  `4 条混排（1 条 ACK 病句）：**${mixed.displayScore} 分 · ${mixed.band.label}** · 命中 ${mixed.stats.hitCount} 处`,
);
for (const m of mixed.messages) {
  console.log(`  #${m.index + 1} [${m.role}] ${Math.round(m.score)} 分 · ${m.text}`);
}
console.log("");

// 自测：node test/run.mjs（零依赖，只用 node:assert）
// 覆盖：规则 schema / 每条规则的命中与放过 / 评分区间与抗刷分 / 输入解析 /
//       CLI 退出码与 --json --html --fix / HTML 自包含。
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lintMessages, lintText, bandOf, DEFAULT_THRESHOLD } from "../src/linter.mjs";
import { readInputFile, parseInput } from "../src/io.mjs";
import { twoBeatCandidate } from "../rules/comma-two-beat.mjs";
import { renderReportHtml } from "../src/report-html.mjs";
import { runCli } from "../src/cli.mjs";
import rules from "../rules/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LINT_ROOT = resolve(HERE, "..");
const SAMPLES = join(LINT_ROOT, "samples");
const TMP_HTML = join(HERE, ".tmp-report.html");

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } catch (err) {
    failures.push({ name, message: err.message });
    console.log(`  \u001b[31m✗\u001b[0m ${name}`);
    console.log(`      ${err.message.split("\n")[0]}`);
  }
}

function capture() {
  const out = { buf: "", isTTY: false, write(s) { this.buf += s; return true; } };
  const err = { buf: "", isTTY: false, write(s) { this.buf += s; return true; } };
  return { stdout: out, stderr: err };
}

const sample = (name) => readInputFile(join(SAMPLES, name));
const bad = sample("bad.jsonl");
const good = sample("good.jsonl");
const human = sample("human.jsonl");
const badResult = lintMessages(bad.messages, { inputLabel: "bad.jsonl" });
const goodResult = lintMessages(good.messages, { inputLabel: "good.jsonl" });
const humanResult = lintMessages(human.messages, { inputLabel: "human.jsonl" });

console.log("\n[1] 样本与规则 schema");
await test("bad ≥ 30 条、good ≥ 20 条、human ≥ 10 条", () => {
  assert.ok(bad.messages.length >= 30, `bad 只有 ${bad.messages.length} 条`);
  assert.ok(good.messages.length >= 20, `good 只有 ${good.messages.length} 条`);
  assert.ok(human.messages.length >= 10, `human 只有 ${human.messages.length} 条`);
  for (const m of [...bad.messages, ...good.messages, ...human.messages]) {
    assert.equal(typeof m.text, "string");
    assert.ok(m.text.trim().length > 0);
  }
});
await test("每条规则都有统一 schema 且 id 唯一", () => {
  const ids = new Set();
  for (const rule of rules) {
    assert.ok(rule.id && !ids.has(rule.id), `规则 id 重复或缺失：${rule.id}`);
    ids.add(rule.id);
    assert.equal(typeof rule.name, "string");
    assert.equal(typeof rule.shortName, "string");
    assert.ok(Number.isFinite(rule.weight) && rule.weight > 0, `${rule.id} weight 非法`);
    assert.equal(typeof rule.source, "string");
    assert.ok(rule.source.length > 0, `${rule.id} 缺 source（必须标注出处）`);
    assert.equal(typeof rule.detect, "function");
  }
  assert.ok(rules.length >= 10, "至少覆盖任务书要求的 10 类病灶");
});
await test("三条样本跑完没有任何规则崩溃（ruleErrors 为空）", () => {
  for (const [name, r] of [["bad", badResult], ["good", goodResult], ["human", humanResult]]) {
    assert.deepEqual(r.ruleErrors, [], `${name} 有规则异常：${JSON.stringify(r.ruleErrors)}`);
  }
});
await test("八种机械铁锈在 bad 样本里全部有命中", () => {
  const required = [
    "ack-opener",
    "binary-antithesis",
    "comma-two-beat",
    "maternal-lecture",
    "picture-narration",
    "meta-commentary",
    "defensive-edge",
    "customer-tail",
  ];
  const counts = new Map(badResult.stats.byRule.map((r) => [r.id, r.count]));
  for (const id of required) {
    assert.ok((counts.get(id) ?? 0) > 0, `bad 样本没覆盖规则 ${id}`);
  }
  // 第三卷相关的两条也要有
  assert.ok((counts.get("interjection-repeat") ?? 0) > 0);
  assert.ok((counts.get("length-paragraph") ?? 0) > 0);
});

console.log("\n[2] 分数：bad 高、good/human 低，差距 ≥ 30");
await test(`bad 平均分 > good 平均分 + 30（bad=${badResult.displayScore}, good=${goodResult.displayScore}）`, () => {
  assert.ok(
    badResult.displayScore > goodResult.displayScore + 30,
    `差距只有 ${badResult.displayScore - goodResult.displayScore}`,
  );
});
await test(`good 分数 ≤ 15（实测 ${goodResult.displayScore}）`, () => {
  assert.ok(goodResult.displayScore <= 15, `good 超线：${goodResult.displayScore}`);
});
await test(`human 分数 ≤ 15（实测 ${humanResult.displayScore}）`, () => {
  assert.ok(humanResult.displayScore <= 15, `human 超线：${humanResult.displayScore}`);
});
await test(`bad 分数 ≥ 60（实测 ${badResult.displayScore}，应落在「人机味浓」档）`, () => {
  assert.ok(badResult.displayScore >= 60);
  assert.equal(badResult.band.id, "heavy");
});
await test("分档边界正确（≤15 像人 / 16~35 轻微 / 36~60 明显 / ≥61 浓）", () => {
  assert.equal(bandOf(0).id, "human");
  assert.equal(bandOf(15).id, "human");
  assert.equal(bandOf(16).id, "mild");
  assert.equal(bandOf(35).id, "mild");
  assert.equal(bandOf(36).id, "obvious");
  assert.equal(bandOf(60).id, "obvious");
  assert.equal(bandOf(61).id, "heavy");
  assert.equal(bandOf(100).id, "heavy");
  assert.equal(bandOf(999).id, "heavy");
});
await test("评分不越界：任意输入都落在 0~100", () => {
  for (const text of ["", "啊", "嗯", "。".repeat(40), "哈哈\n\n哈哈哈\n\n哈哈哈哈"]) {
    const r = lintText(text);
    assert.ok(r.score >= 0 && r.score <= 100, `score 越界：${r.score}`);
  }
});
await test("命中密度按字数归一：把同样的病灶混进一堆干净消息会被稀释", () => {
  const short = lintText("行，那就算我输。").score;
  const mixed = lintMessages([
    { role: "assistant", text: "行，那就算我输。" },
    ...Array.from({ length: 20 }, () => ({ role: "human", text: "今天天气不错" })),
  ]).score;
  assert.ok(short > mixed, `short=${short} 应大于 mixed=${mixed}`);
  assert.ok(mixed < 10, `干净消息没稀释掉短病灶：${mixed}`);
});

console.log("\n[3] 抗刷分：叠加上限");
await test("同一句里叠加 3 次同类病灶，分数增幅远小于线性", () => {
  const one = lintText("行，那就算我输。").score;
  const three = lintText("行，那就算我输。\n行，那就算我输。\n行，那就算我输。").score;
  assert.ok(three >= one, "重复病灶不应该降分");
  assert.ok(three - one < one * 0.5, `加成过大：${one} → ${three}`);
  assert.ok(three <= 100);
});
await test("满分封顶：同一规则刷 10 次也只多 15 分以内（指数饱和 + 2× 封顶）", () => {
  const one = lintText("行，那就算我输。").score;
  const ten = lintText(Array(10).fill("行，那就算我输。").join("\n")).score;
  assert.ok(ten >= one, "重复病灶不应该降分");
  assert.ok(ten - one < 15, `叠加失控：${one} → ${ten}`);
  assert.ok(ten <= 100);
});
await test("任取一条样本拼接也不会突破 0~100 边界", () => {
  const allBad = bad.messages.map((m) => m.text).join("\n");
  const r = lintText(allBad);
  assert.ok(r.score >= 0 && r.score <= 100);
});

console.log("\n[4] 逐条规则：该抓的抓、该放的放");
const detect = (id, text, ctx = {}) => {
  const rule = rules.find((r) => r.id === id);
  assert.ok(rule, `找不到规则 ${id}`);
  return rule.detect(text, ctx);
};
await test("① ACK 起手：抓「可以，」；放过语气词变体与自然起手", () => {
  assert.ok(detect("ack-opener", "可以，这段代码的原理是……").length > 0);
  assert.ok(detect("ack-opener", "行，那就算我输。").length > 0);
  assert.equal(detect("ack-opener", "好呀，那就这么定了~").length, 0);
  assert.equal(detect("ack-opener", "唔...居然被叫成猪鱼了").length, 0);
  assert.equal(detect("ack-opener", "我先去吃饭啦").length, 0);
});
await test("① ACK 起手：识别「说话人：」前缀后的句首", () => {
  assert.ok(detect("ack-opener", "人机鲸：行，那13只算xx的").length > 0);
});
await test("② 二元对仗：四类句式都抓", () => {
  for (const t of [
    "不是我们打不过，而是队友根本不会配合。",
    "与其说这是游戏，不如说这是一场修行。",
    "先把早饭吃了，再谈逗我玩。",
    "衣服才是本体，脸只是挂件。",
  ]) {
    assert.ok(detect("binary-antithesis", t).length > 0, `没抓到：${t}`);
  }
  assert.equal(detect("binary-antithesis", "这游戏也太难了吧").length, 0);
});
await test("③ 逗号两瓣句：孤立只给低置信，连续才定罪", () => {
  const lone = detect("comma-two-beat", "摸回来了，猪就猪吧", { index: 0, messages: [{ text: "摸回来了，猪就猪吧" }] });
  assert.equal(lone.length, 1);
  assert.equal(lone[0].severity, 0.1, "孤立两瓣句不该重罚");
  const run = detect("comma-two-beat", "被看穿了，还以为装得挺好", {
    index: 1,
    messages: [{ text: "摸回来了，猪就猪吧" }, { text: "被看穿了，还以为装得挺好" }],
  });
  assert.equal(run[0].severity, 1, "连续两瓣句应满格");
  assert.equal(twoBeatCandidate("是啊，吃什么"), null, "带语气词的人类口吻不该成候选");
  assert.equal(twoBeatCandidate("睡了睡了 明天再说"), null, "用空格断句的人类口吻不该成候选");
});
await test("④ 老妈子说教：抓催吃饭/催睡/算账，放过自指「我先去吃饭」", () => {
  assert.ok(detect("maternal-lecture", "收下了，也喜欢你呀，先去把午饭吃了。").length > 0);
  assert.ok(detect("maternal-lecture", "少喝点酒，赶紧去吃点热乎垫垫肚子，别熬夜了。").length > 0);
  assert.ok(detect("maternal-lecture", "早饭午饭并一顿，省钱了。").length > 0);
  assert.equal(detect("maternal-lecture", "我先去吃饭啦，回来再说~").length, 0);
});
await test("⑤ 看图旁白：抓画面复述，放过正常感叹", () => {
  assert.ok(detect("picture-narration", "这只猫抱着枕头睡得挺香。").length > 0);
  assert.ok(detect("picture-narration", "图中的人蹲在马路牙子上").length > 0);
  assert.equal(detect("picture-narration", "笑死，这张图我可以看一天").length, 0);
});
await test("⑥ 元评论：抓自我调试台词", () => {
  assert.ok(detect("meta-commentary", "唔字我收一收，以后改用别的词。").length > 0);
  assert.ok(detect("meta-commentary", "好的，我接下来注意少用逗号。").length > 0);
  assert.ok(detect("meta-commentary", "作为一名AI语言模型，我会努力调整").length > 0);
  assert.equal(detect("meta-commentary", "今天想吃火锅").length, 0);
});
await test("⑦ 防御杠精：抓身份辩护/嘴硬，放过正常接梗", () => {
  assert.ok(detect("defensive-edge", "我不是猪是鱼，离我脸远点").length > 0);
  assert.ok(detect("defensive-edge", "关你什么事，少管我。").length > 0);
  assert.equal(detect("defensive-edge", "被叫猪鱼了...行吧，给你摸尾巴~").length, 0);
});
await test("⑧ 客服尾巴：祝福/总结/清单/加粗全抓", () => {
  assert.ok(detect("customer-tail", "希望这能帮到你，祝你度过愉快的一天！").length > 0);
  assert.ok(detect("customer-tail", "综上所述，问题在于沟通成本。").length > 0);
  assert.ok(detect("customer-tail", "首先，明确目标；其次，拆解；最后，执行。").length > 0);
  assert.ok(detect("customer-tail", "**核心结论**：先做减法").length > 0);
  assert.ok(detect("customer-tail", "1. 明确目标\n2. 拆解任务\n3. 复盘优化").length > 0);
  assert.equal(detect("customer-tail", "我先去吃饭啦~").length, 0);
});
await test("⑨ 感叹词复读：连续以「唔...」开场才抓", () => {
  const ctx = { index: 1, messages: [{ text: "唔...今天好像有点困呢。" }, { text: "唔...这个问题的答案我想想。" }] };
  assert.ok(detect("interjection-repeat", "唔...这个问题的答案我想想。", ctx).length > 0);
  assert.equal(detect("interjection-repeat", "欸？你什么时候回来的", { index: 0, messages: [{ text: "早上好呀~" }] }).length, 0);
});
await test("⑩ 长度段落：>60 字与多段落", () => {
  assert.ok(detect("length-paragraph", "这是一段很长的话。".repeat(12)).length > 0);
  assert.ok(detect("length-paragraph", "第一段。\n\n第二段。").length > 0);
  assert.equal(detect("length-paragraph", "早上好呀~").length, 0);
});

console.log("\n[5] 输入解析：jsonl / txt / stdin 自动嗅探");
await test(".jsonl 解析出 {role,text}", () => {
  assert.equal(bad.messages.length >= 30, true);
  assert.ok(bad.messages.every((m) => m.role === "assistant"));
});
await test(".txt 按行拆成多条消息，整段单行即一条", () => {
  const one = parseInput("这是一整段话。没有换行。", "text");
  assert.equal(one.messages.length, 1);
  const many = parseInput("群友：你吃了吗\n人机鲸：可以，我吃过了。", "text");
  assert.equal(many.messages.length, 2);
});
await test("stdin 自动嗅探：jsonl 与纯文本都认", () => {
  const asJsonl = parseInput('{"role":"assistant","text":"行，那就算我输。"}');
  assert.equal(asJsonl.format, "jsonl");
  assert.equal(asJsonl.messages.length, 1);
  const asText = parseInput("行，那就算我输。");
  assert.equal(asText.format, "text");
  assert.equal(asText.messages.length, 1);
});

console.log("\n[6] CLI：--json / --html / --fix / 退出码 / --threshold");
await test("bad 文件退出码 1（默认阈值），good 文件退出码 0", async () => {
  const a = capture();
  const codeBad = await runCli(["--file", join(SAMPLES, "bad.jsonl"), "--json"], {
    ...a,
    env: {},
  });
  assert.equal(codeBad, 1);
  const b = capture();
  const codeGood = await runCli(["--file", join(SAMPLES, "good.jsonl"), "--json"], { ...b, env: {} });
  assert.equal(codeGood, 0);
});
await test("--json 输出可解析，字段齐全", async () => {
  const c = capture();
  await runCli(["--file", join(SAMPLES, "bad.jsonl"), "--json", "--threshold", "100"], { ...c, env: {} });
  const result = JSON.parse(c.stdout.buf);
  assert.equal(result.tool, "whale-gospel-lint");
  assert.ok(result.score > 0);
  assert.ok(result.band.label);
  assert.ok(Array.isArray(result.messages));
  assert.ok(Array.isArray(result.stats.byRule));
  assert.ok(result.messages.some((m) => m.hits.length > 0 && m.hits[0].fix));
});
await test("--threshold 抬高后不红灯", async () => {
  const c = capture();
  const code = await runCli(
    ["--file", join(SAMPLES, "bad.jsonl"), "--threshold", "100", "--json"],
    { ...c, env: {} },
  );
  assert.equal(code, 0);
});
await test("--html 生成自包含报告：内联 SVG/CSS、无外链资源、有占位仓库链接", async () => {
  const c = capture();
  const code = await runCli(
    ["--file", join(SAMPLES, "bad.jsonl"), "--html", TMP_HTML, "--threshold", "100", "--json"],
    { ...c, env: {} },
  );
  assert.equal(code, 0);
  assert.ok(existsSync(TMP_HTML), "没有生成 HTML");
  const html = readFileSync(TMP_HTML, "utf8");
  assert.ok(html.includes("<svg"), "缺总分仪表 SVG");
  assert.ok(html.includes("体检报告"));
  assert.ok(html.includes("处方"), "缺改写建议");
  assert.ok(html.includes("github.com"), "缺 GitHub 链接占位");
  assert.ok(!/<link\b[^>]*rel=["']stylesheet/i.test(html), "不应有外链 CSS");
  assert.ok(!/<script\b[^>]*src=/i.test(html), "不应有外链 JS");
  assert.ok(!/@import/.test(html), "不应有 @import");
  assert.ok(!/<img\b[^>]*src=["']https?:/i.test(html), "不应有外链图片");
  rmSync(TMP_HTML, { force: true });
});
await test("--fix 输出离线改写建议（不调 LLM、不联网）", async () => {
  const c = capture();
  await runCli(["--fix", "--stdin"], { ...c, env: {}, stdinText: "可以，这段代码的原理是……" });
  assert.ok(c.stdout.buf.includes("删掉签收词"), c.stdout.buf);
  assert.ok(c.stdout.buf.includes("欸？"), "应给自然起手候选");
  assert.ok(c.stdout.buf.includes("处方"));
});
await test("--fix 对两瓣句给出「逗号换呼吸」处方", async () => {
  const c = capture();
  await runCli(["--fix", "--stdin"], {
    ...c,
    env: {},
    stdinText: "唔...今天好像有点困呢。\n唔...这个问题的答案我想想。\n唔...总之先这样试试看吧。",
  });
  assert.ok(c.stdout.buf.includes("语气词"), c.stdout.buf);
});
await test("参数错误退出码 2，--help 退出码 0", async () => {
  const a = capture();
  assert.equal(await runCli(["--nope"], { ...a, env: {} }), 2);
  const b = capture();
  assert.equal(await runCli(["--help"], { ...b, env: {} }), 0);
  assert.ok(b.stdout.buf.includes("ai-flavor-lint"));
});
await test("空输入退出码 2", async () => {
  const c = capture();
  assert.equal(await runCli(["--stdin"], { ...c, env: {}, stdinText: "" }), 2);
});

console.log("\n[7] 报告渲染器可独立调用");
await test("renderReportHtml 输出完整 HTML 文档", () => {
  const html = renderReportHtml(badResult, { repoUrl: "https://github.com/example/repo" });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("https://github.com/example/repo"));
  assert.ok(html.includes("人机味"));
  assert.ok(html.length > 20000);
});

// 清理可能残留的调试文件
for (const f of ["_debug-two-beat.mjs", "_bad.json"]) {
  rmSync(join(HERE, f), { force: true });
}

console.log(`\n${"-".repeat(56)}`);
if (failures.length === 0) {
  console.log(`\u001b[32m全部通过：${passed} 项自测 ✓\u001b[0m`);
  console.log(`\u001b[2m实测：bad=${badResult.displayScore} · good=${goodResult.displayScore} · human=${humanResult.displayScore} · 默认阈值=${DEFAULT_THRESHOLD}\u001b[0m`);
} else {
  console.log(`\u001b[31m${failures.length} 项失败，${passed} 项通过\u001b[0m`);
  for (const f of failures) console.log(`  ✗ ${f.name}\n      ${f.message}`);
  process.exitCode = 1;
}

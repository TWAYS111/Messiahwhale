// 规则 ②：二元对立与工整对仗句
//
// 出处：
//   第二卷·「福音践行」第 2 条：彻底斩杀「二元对立与工整对仗句」
//     （严禁“不是A而是B”、“先X再谈Y”、“A是X，B是Y”、“与其说……不如说……”）
//   第三幕 · 病历 02「工整对仗与逗号两瓣句」（HTML 剧场 badQuote 原句）
//
// 病根：AI 把闲聊当议论文写，追求对联式对称；人类想到哪半句说哪半句。
import { dedupeHits, findAll, hit } from "./_helpers.mjs";

const ANTI = /[，,。！？!?…\n]/;
const NOT_A_CLAUSE_START = /^(但是|因为|如果|虽然|不过|然后|所以|而且|只有|只要|即使)/;

const PATTERNS = [
  {
    re: new RegExp(`不是[^，,。！？!?…\\n]{1,20}?${ANTI.source}?\\s*而是`, "g"),
    kind: "不是A而是B",
    severity: 1,
    reason: "「不是…而是…」把话拧成一台精密天平，是机器最爱的对称转折",
  },
  {
    re: new RegExp(`并非[^，,。！？!?…\\n]{1,20}?${ANTI.source}?\\s*而是`, "g"),
    kind: "并非A而是B",
    severity: 0.9,
    reason: "「并非…而是…」是同一台天平换了个书面零件的版本",
  },
  {
    re: new RegExp(`与其说[^，,。！？!?…\\n]{1,20}?${ANTI.source}?\\s*不如说`, "g"),
    kind: "与其说A不如说B",
    severity: 0.95,
    reason: "「与其说…不如说…」是八股腔里的标准起承转合",
  },
  {
    re: /先[^，,。！？!?…\n]{1,15}?[，,]\s*再谈/g,
    kind: "先X再谈Y",
    severity: 0.9,
    reason: "「先…再谈…」是长辈式排序，把闲聊变成项目排期表",
  },
  {
    // A是X，B是Y：两半都有“是”、字数都不长、无连接词，典型对联句
    re: /[^，,。！？!?…\n]{1,10}?(?:才|只|就)?是[^，,。！？!?…\n]{1,10}?[，,][^，,。！？!?…\n]{1,10}?(?:才|只|就)?是[^，,。！？!?…\n]{1,10}/g,
    kind: "A是X，B是Y",
    severity: 0.75,
    reason: "「A是X，B是Y」前后严格对仗，不是聊天，是做语文仿写题",
  },
];

export default {
  id: "binary-antithesis",
  name: "二元对仗句",
  shortName: "二元对仗",
  weight: 1.5,
  source: "第二卷·第2条 · 第三幕病历02",
  description:
    "不是A而是B / 与其说A不如说B / 先X再谈Y / A是X，B是Y——像写对联一样工整。",
  detect(text) {
    const hits = [];
    for (const p of PATTERNS) {
      for (const m of findAll(p.re, text)) {
        const matched = m.match;
        // 「A是X，B是Y」收紧误报：疑问句、连接词开头的普通复句不算
        if (p.kind === "A是X，B是Y") {
          if (/[谁哪吗呢？]/.test(matched)) continue;
          if (NOT_A_CLAUSE_START.test(matched)) continue;
          if (matched.includes("但是") || matched.includes("然后")) continue;
        }
        // 长句里的转折可能只是书面语/经文体的正常修辞，不按短聊天对仗计满格。
        // （示例：good.jsonl 里「他不是在向服务器发送等待 ACK 的指令，而是…」）
        const severity = matched.length > 18 ? p.severity * 0.55 : p.severity;
        hits.push(hit(m.start, m.end, severity, p.reason, { kind: p.kind }));
      }
    }
    return dedupeHits(hits);
  },
};

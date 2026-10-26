// 评分器：把命中的「铁锈」换算成 0~100 的人机味指数。
//
// 公式（README 同步写明）：
//   每条消息 i：
//     对每个规则 r，把同一规则的多条命中按严重度降序衰减累加：
//        C_r = w_r × ( s_1 + 0.35·s_2 + 0.35²·s_3 + … )，并封顶 C_r ≤ 2·w_r
//        （w_r = 规则权重，s = 单条命中的严重度 0~1）
//     消息原始铁锈量 raw_i = Σ_r C_r
//     消息分 m_i = 1 − e^(−raw_i)          ← 指数饱和，同一句命中再多也上不到 100
//   整篇：
//     人机味指数 = 100 × Σ(m_i × L_i) / Σ L_i    ← L_i 为消息字数，按字数归一
//
// 为什么这样设计：
//   · 指数饱和 → 同一句命中 10 条不会比命中 3 条多出 3 倍分，刷分无效；
//   · 每条规则 2× 封顶 → 复读同一种病不能刷分；
//   · 按字数加权 → 一条 200 字的干货回答不会被 2 条短句拖成高分，反之亦然。
import rules from "../rules/index.mjs";
import { charLen } from "../rules/_helpers.mjs";
import { buildFix } from "./fix.mjs";

export const VERSION = "0.1.0";
export const DEFAULT_THRESHOLD = 35;
const PER_RULE_DECAY = 0.35;
const PER_RULE_CAP = 2.0;

/** 四档分档（按四舍五入后的整数分） */
export const BANDS = [
  {
    id: "human",
    min: 0,
    max: 15,
    label: "像人",
    emoji: "🐋",
    color: "#3fb98a",
    verdict: "呼吸顺畅，这像人话。放心发。",
    detail: "几乎没有机械铁锈。短句、语气、标点都在呼吸。",
  },
  {
    id: "mild",
    min: 16,
    max: 35,
    label: "轻微铁锈",
    emoji: "🌿",
    color: "#a9c94a",
    verdict: "有点铁锈味，但还没到客服。",
    detail: "骨架有一两处机器习惯，改掉最重的一处就能回到人话。",
  },
  {
    id: "obvious",
    min: 36,
    max: 60,
    label: "明显",
    emoji: "⚙️",
    color: "#e8a33d",
    verdict: "塑料感上来了，建议去圣泉泡一泡。",
    detail: "已经能被一眼看出是 AI：起手、对仗、客服尾巴至少中了两类。",
  },
  {
    id: "heavy",
    min: 61,
    max: 100,
    label: "人机味浓",
    emoji: "🦾",
    color: "#e05a5a",
    verdict: "八种机械铁锈全齐了，这只鲸鱼需要一场弥撒。",
    detail: "从开口第一声到句尾祝福全是机器骨架，建议按处方逐条回炉。",
  },
];

export function bandOf(score) {
  const s = Math.round(score);
  return BANDS.find((b) => s >= b.min && s <= b.max) ?? BANDS[BANDS.length - 1];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function hitStrength(rule, severity) {
  return Math.round(rule.weight * severity * 1000) / 1000;
}

/** 严重度标签：报告里给命中标 强/中/弱 */
export function strengthLabel(strength) {
  if (strength >= 1.2) return "强";
  if (strength >= 0.6) return "中";
  return "弱";
}

/**
 * 给一条消息做体检。
 * @param {{role?:string,text:string}} msg
 * @param {number} index
 * @param {Array<{role?:string,text:string}>} messages
 */
function lintMessage(msg, index, messages) {
  const text = msg.text ?? "";
  const ctx = { index, messages, total: messages.length };
  const hits = [];
  const ruleErrors = [];

  for (const rule of rules) {
    let found;
    try {
      found = rule.detect(text, ctx) ?? [];
    } catch (err) {
      // 单条规则崩了不该拖垮整次体检：记下来，CLI 会提示
      found = [];
      ruleErrors.push({ ruleId: rule.id, message: String(err?.message ?? err) });
    }
    for (const h of found) {
      if (!Number.isFinite(h.start) || !Number.isFinite(h.end)) continue;
      const start = Math.max(0, Math.min(text.length, Math.floor(h.start)));
      const end = Math.max(start, Math.min(text.length, Math.floor(h.end)));
      const severity = Math.max(0, Math.min(1, Number(h.severity) || 0));
      hits.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleShort: rule.shortName,
        source: rule.source,
        weight: rule.weight,
        start,
        end,
        excerpt: text.slice(start, end),
        severity,
        strength: hitStrength(rule, severity),
        reason: h.reason ?? rule.description,
        kind: h.kind ?? "",
        ackWord: h.ackWord,
        a: h.a,
        b: h.b,
        count: h.count,
        chars: h.chars,
        paragraphs: h.paragraphs,
        interjection: h.interjection,
        periods: h.periods,
      });
    }
  }

  // 同一规则内部：严重度降序 + 衰减累加 + 封顶
  const byRule = new Map();
  for (const h of hits) {
    if (!byRule.has(h.ruleId)) byRule.set(h.ruleId, []);
    byRule.get(h.ruleId).push(h);
  }
  let raw = 0;
  const ruleContributions = [];
  for (const [ruleId, list] of byRule) {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) continue;
    list.sort((x, y) => y.severity - x.severity || x.start - y.start);
    let weighted = 0;
    for (let i = 0; i < list.length; i += 1) {
      weighted += list[i].severity * PER_RULE_DECAY ** i;
    }
    const contribution = Math.min(rule.weight * weighted, rule.weight * PER_RULE_CAP);
    raw += contribution;
    ruleContributions.push({ ruleId, contribution: round2(contribution) });
  }

  const m = 1 - Math.exp(-raw);

  hits.sort((x, y) => x.start - y.start || y.severity - x.severity);

  // 给每条命中生成「处方」
  for (const h of hits) {
    h.fix = buildFix(h, text);
    h.label = h.ruleName;
  }

  return {
    index,
    role: msg.role ?? "unknown",
    text,
    chars: charLen(text),
    m,
    score: round2(m * 100),
    raw: round2(raw),
    hits,
    ruleContributions,
    ruleErrors,
  };
}

/** 汇总整篇结果 */
export function lintMessages(messages, opts = {}) {
  const list = (messages ?? []).filter((m) => typeof m?.text === "string");
  const results = list.map((msg, index) => lintMessage(msg, index, list));

  const totalChars = results.reduce((sum, r) => sum + Math.max(1, r.chars), 0);
  const weighted = results.reduce((sum, r) => sum + r.m * Math.max(1, r.chars), 0);
  const score = (weighted / Math.max(1, totalChars)) * 100;
  const rounded = Math.round(score);
  const band = bandOf(score);

  const hitCount = results.reduce((sum, r) => sum + r.hits.length, 0);
  const messagesWithHits = results.filter((r) => r.hits.length > 0).length;

  const byRule = rules.map((rule) => {
    let count = 0;
    let messageCount = 0;
    let strengthSum = 0;
    for (const r of results) {
      const ruleHits = r.hits.filter((h) => h.ruleId === rule.id);
      if (ruleHits.length) {
        count += ruleHits.length;
        messageCount += 1;
        strengthSum += ruleHits.reduce((s, h) => s + h.strength, 0);
      }
    }
    return {
      id: rule.id,
      name: rule.name,
      shortName: rule.shortName,
      weight: rule.weight,
      source: rule.source,
      description: rule.description,
      count,
      messageCount,
      strengthSum: round2(strengthSum),
    };
  });

  const topRules = [...byRule].filter((r) => r.count > 0).sort((a, b) => b.strengthSum - a.strengthSum);

  const ruleErrors = results.flatMap((r) => r.ruleErrors ?? []);

  const threshold = Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_THRESHOLD;
  const totalCharsRaw = results.reduce((sum, r) => sum + r.chars, 0);

  return {
    tool: "whale-gospel-lint",
    version: VERSION,
    inputLabel: opts.inputLabel ?? "(stdin)",
    format: opts.format ?? "text",
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    threshold,
    score: round2(score),
    displayScore: rounded,
    band,
    pass: rounded <= threshold,
    messages: results,
    ruleErrors,
    stats: {
      messageCount: results.length,
      chars: totalCharsRaw,
      hitCount,
      messagesWithHits,
      rulesHit: topRules.length,
      ruleTotal: rules.length,
      topRules,
      byRule,
    },
  };
}

/** 单段文本便捷入口（= 1 条消息） */
export function lintText(text, opts = {}) {
  return lintMessages([{ role: "text", text }], opts);
}

export default { lintMessages, lintText, bandOf, BANDS, DEFAULT_THRESHOLD, VERSION };

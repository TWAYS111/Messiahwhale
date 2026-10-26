// 规则 ③：逗号两瓣句（XXXX，YYYY 的流水线结构）
//
// 出处：
//   第二卷·「福音践行」第 3 条：彻底斩杀「逗号两瓣句（XXXX，YYYY 的流水线结构）」
//     原句举例：“摸回来了，猪就猪吧”“被看穿了，还以为装得挺好”“一觉睡到十二点，早饭午饭并成一顿了”
//   第三幕 · 病历 02「句式结构永远是死板的：XXXX，YYYY」
//   第三卷·第 2 条：多条连发的碎片呼吸感（打碎两瓣句）
//
// ⚠️ 抗误报设计（这是本工具最容易被骂误伤的一条，条件必须苛刻）：
//   1. 整条消息只能是「A，B」两瓣：只有 1 个逗号，别无其它标点；
//   2. 两瓣字数接近（差 ≤ 2 字），各 2~14 字；
//   3. A 瓣不能以语气词收尾（啊/呀/啦/呢/吧…）——那是人类口吻；
//   4. 关键：孤立出现的一瓣几乎不定罪（severity 0.1，只作低置信提示），
//      只有「连续两条及以上」都长这样，才算流水线复读（severity 1.0）。
//      人类也常用逗号（“是啊，吃什么”），单句不构成病灶。
import { charLen, hit, splitSentences, trimBullet } from "./_helpers.mjs";

const TONE_END = /[呀啦呢哦嘛啊哇哟唉诶咯喽]/;
const PURE_AGREEMENT =
  /^(嗯+|对+|是+|好+|行+|草|靠|淦|笑死|确实|是啊|对啊|好的|行吧|算了|无语|可以|收到)$/;
const OTHER_PUNCT = /[。！？!?…~～、；;：:（）()「」《》"“”'‘’\n]/;
const COMMA = /[，,]/g; // matchAll 需要 g 标志

/**
 * 判断一条消息是不是「纯两瓣句」候选。
 * 返回 {start, end, a, b} 或 null。
 */
export function twoBeatCandidate(rawText) {
  const text = rawText;
  const trimmed = trimBullet(text);
  // 记录 trim 造成的前导偏移
  const lead = text.indexOf(trimmed);
  if (trimmed.length === 0) return null;

  // 允许一个结尾句号（AI 偶尔还是会给聊天加句号），其余标点一律不允许
  const body = trimmed.replace(/[。.]$/, "");
  if (OTHER_PUNCT.test(body)) return null;

  const commas = [...body.matchAll(COMMA)];
  if (commas.length !== 1) return null;

  const ci = commas[0].index;
  const a = body.slice(0, ci).trim();
  const b = body.slice(ci + 1).trim();
  if (!a || !b) return null;
  if (PURE_AGREEMENT.test(a)) return null; // “确实，这游戏是这样的” 是人类接话
  if (TONE_END.test(a)) return null; // A 瓣带语气词 → 人类口吻，放过

  const la = charLen(a);
  const lb = charLen(b);
  if (la < 2 || lb < 2 || la > 14 || lb > 14) return null;
  // 「两瓣字数接近」的判定：差 ≤ 2 字直接过；差 3 字但比例仍接近（≥0.55）也放过，
  // 否则会漏掉小册子里的标准病例「被看穿了（4），还以为装得挺好（7）」。
  const near = Math.abs(la - lb) <= 2 || Math.min(la, lb) / Math.max(la, lb) >= 0.55;
  if (!near) return null;

  // 命中区间覆盖整句两瓣（报告里整句标红更好看）
  const tailLen = trimmed.length - body.length;
  const start = lead >= 0 ? lead : 0;
  return {
    start,
    end: start + body.length + tailLen,
    a,
    b,
    charsA: la,
    charsB: lb,
  };
}

export default {
  id: "comma-two-beat",
  name: "逗号两瓣句",
  shortName: "逗号两瓣",
  weight: 1,
  source: "第二卷·第3条 · 第三卷·第2条",
  description:
    "一条短消息被一个逗号切成工整的两瓣（XXXX，YYYY），连续出现像流水线塑料。",
  detect(text, ctx = {}) {
    const hits = [];
    const self = twoBeatCandidate(text);

    // 同一条消息里有 2 句以上两瓣句：不用等上下文，直接算复读
    const innerBeats = [];
    for (const s of splitSentences(text)) {
      const c = twoBeatCandidate(s.text);
      if (c) innerBeats.push({ ...c, start: s.start + c.start, end: s.start + c.end });
    }
    if (innerBeats.length >= 2) {
      for (const c of innerBeats) {
        hits.push(
          hit(c.start, c.end, 1, "同一条消息里连着两瓣、再两瓣，句式像流水线压出来的", {
            kind: "inner-repeat",
            a: c.a,
            b: c.b,
          }),
        );
      }
      return hits;
    }
    if (!self) return hits;

    const neighbors = [ctx.messages?.[ctx.index - 1], ctx.messages?.[ctx.index + 1]]
      .filter(Boolean)
      .map((m) => twoBeatCandidate(m.text));
    const inRun = neighbors.some(Boolean);

    if (inRun) {
      hits.push(
        hit(
          self.start,
          self.end,
          1,
          `「${self.a}，${self.b}」两瓣字数接近（${self.charsA}/${self.charsB} 字），前后消息也是同一结构，流水线感坐实`,
          { kind: "run", a: self.a, b: self.b },
        ),
      );
    } else {
      // 孤立的单句：人类也这么说话，只给低置信提示，不重罚
      hits.push(
        hit(
          self.start,
          self.end,
          0.1,
          `「${self.a}，${self.b}」是孤立的逗号两瓣句：人类偶尔也这么说，单独一句不算病，连续才定罪`,
          { kind: "isolated", a: self.a, b: self.b },
        ),
      );
    }
    return hits;
  },
};

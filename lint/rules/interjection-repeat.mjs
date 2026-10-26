// 规则 ⑨：感叹词复读（连续以「唔…」「欸…」开头）
//
// 出处：
//   第二卷·「福音践行」第 1 条特别注意：
//     「严禁把单一语气词当成万能起手式句句复读，例如严禁每句话都以“唔...”开头，
//       人类不会每说一句话都先呻吟一声」
//   第三卷·第 2 条：多条连发的碎片呼吸感（碎片化 ≠ 每片都长一样）
//
// 病根：AI 把「唔.../嗯...」当成万能起手模板，句句复读，像卡带的呻吟机。
import { hit } from "./_helpers.mjs";

const INTERJECTIONS = "唔|嗯|欸|诶|啊|呃|哦|唉|噢";
// 语气词 + 停顿（.../…）或逗号，才算「模板起手」
const OPENER_RE = new RegExp(
  `^(?:[^\\s：:]{1,10}[：:]\\s*)?(${INTERJECTIONS})(…{1,2}|\\.{3,}|，|,)`,
);

function openerOf(text) {
  const m = text.match(OPENER_RE);
  return m ? m[1] : null;
}

export default {
  id: "interjection-repeat",
  name: "感叹词复读",
  shortName: "感叹词复读",
  weight: 1.15,
  source: "第二卷·第1条特别注意 · 第三卷·第2条",
  description:
    "连续多条都以「唔…」「嗯…」开场，把单一语气词当万能起手式句句复读。",
  detect(text, ctx = {}) {
    const hits = [];
    const messages = ctx.messages ?? [];
    const index = ctx.index ?? 0;
    const mine = openerOf(text);

    // 1) 跨消息：当前消息与前面 1~2 条用同一个语气词起手
    if (mine) {
      const prev = [messages[index - 1], messages[index - 2]].filter(Boolean);
      const sameRun = prev.filter((m) => openerOf(m.text) === mine).length;
      if (sameRun > 0) {
        hits.push(
          hit(
            0,
            Math.min(text.length, 3),
            1,
            `连续用「${mine}...」起手，语气词变万能模板，人类不会每句话都先呻吟一声`,
            { kind: "cross-message", interjection: mine },
          ),
        );
      }
    }

    // 2) 同一条消息里：两个分句都以同一语气词+停顿开场
    const sentenceStarts = [];
    const re = /(^|[。！？!?…\n])\s*(唔|嗯|欸|诶|啊|呃|哦|唉|噢)(…{1,2}|\.{3,})/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      sentenceStarts.push({ start: m.index + m[1].length, interjection: m[2] });
    }
    const counts = new Map();
    for (const s of sentenceStarts) counts.set(s.interjection, (counts.get(s.interjection) ?? 0) + 1);
    const repeated = [...counts.entries()].find(([, n]) => n >= 2);
    if (repeated) {
      hits.push(
        hit(0, Math.min(text.length, 3), 0.85, `一句话里两次用「${repeated[0]}…」起头，复读机卡带`, {
          kind: "inner-repeat",
          interjection: repeated[0],
        }),
      );
    }
    return hits;
  },
};

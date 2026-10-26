// 规则 ⑪（辅助）：冷硬的句号 / 缺失的呼吸标点
//
// 出处：
//   第三卷·「福音践行」第 3 条：有体温的标点与尾音
//     「少用冷冰冰、硬邦邦的句号 。；可以自然地使用连续的句号/省略号 ... 与轻快上扬的波浪号 ~」
//
// 病根：短聊天回复拿硬句号断句，没有一点点犹豫/呼吸。
// 这条权重放低、范围收紧：只逐行判断「短聊天句（≤40 字）」的标点体温；
// 长文/知识回答属于书面语，不在这里扣分（标点习惯受个人风格影响大）。
import { charLen, hit, lines } from "./_helpers.mjs";

const BREATH = /[…~～]/; // 有呼吸感的标点
const CHAT_MAX = 40; // 单行超过这个长度按书面语处理

export default {
  id: "punctuation-coldness",
  name: "冷硬句号病",
  shortName: "冷硬句号",
  weight: 0.6,
  source: "第三卷·第3条",
  description:
    "短聊天句里只挂硬句号、完全没有「...」或「~」的呼吸停顿，语气像在念公文。",
  detect(text) {
    const hits = [];
    for (const { line, start } of lines(text)) {
      const t = line.trim();
      if (!t) continue;
      const len = charLen(t);
      if (len > CHAT_MAX) continue;
      if (BREATH.test(t)) continue;

      const periods = (t.match(/。/g) ?? []).length;
      if (periods === 0) continue;

      const lead = line.indexOf(t);
      // 单个句号只算「凉」，连用才明显冷；权重本来就低，不喧宾夺主
      const severity = periods === 1 ? 0.3 : Math.min(1, 0.45 + 0.25 * (periods - 2));
      hits.push(
        hit(
          start + lead,
          start + lead + t.length,
          severity,
          periods === 1 && len <= 12
            ? "超短回复还挂一个硬句号收尾，像系统回执；人类这里多半是「...」或「~」"
            : `短短 ${len} 字里用了 ${periods} 个硬句号，没有一个「...」或「~」的呼吸停顿`,
          { kind: periods === 1 && len <= 12 ? "stiff-short" : "hard-periods", periods },
        ),
      );
    }
    return hits;
  },
};

// 规则 ⑩：长度与段落病（闲聊单条 >60 字、多段落、多条硬塞）
//
// 出处：
//   第三卷·「福音践行」第 1 条：快节奏与极致的短句（日常闲聊 1~15 字；
//     「哪怕稍微长一点也绝不会变成密密麻麻的段落」）
//   第三卷·「福音践行」第 2 条：多条连发的碎片呼吸感（不要用句号硬塞进同一个长气泡）
//
// 病根：闲聊时抖出一整块「巨石」；人类会把话拆成两三条长短短不一的碎片。
import { charLen, hit } from "./_helpers.mjs";

const LONG_SOFT = 60; // 超过 60 字开始轻度计分
const PARAGRAPH = 2; // 两个段落起算

export default {
  id: "length-paragraph",
  name: "长度与段落病",
  shortName: "长度段落",
  weight: 1.2,
  source: "第三卷·第1、2条",
  description:
    "闲聊单条超过 60 字、或者一条消息里塞多个段落——把话当成一整块巨石发出来。",
  detect(text) {
    const hits = [];
    const len = charLen(text.trim());

    if (len > LONG_SOFT) {
      // 60 字以内不算；越往 240 字走越重（长回答本身不是罪，只是闲聊里的巨石）
      const severity = Math.min(1, (len - LONG_SOFT) / (240 - LONG_SOFT));
      hits.push(
        hit(
          0,
          text.length,
          severity,
          `单条 ${len} 字：日常闲聊 1~15 字，${len} 字已经是一整块巨石，该拆成几条碎片`,
          { kind: "too-long", chars: len },
        ),
      );
    }

    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length >= PARAGRAPH) {
      hits.push(
        hit(
          0,
          text.length,
          0.8,
          `一条消息里塞了 ${paragraphs.length} 个段落，像把整篇文档塞进一个气泡`,
          { kind: "multi-paragraph", paragraphs: paragraphs.length },
        ),
      );
    }
    return hits;
  },
};

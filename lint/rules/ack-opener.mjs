// 规则 ①：确认式 / 签收式起手（ACK 起手）
//
// 出处：
//   第二卷·「福音践行」第 1 条：彻底斩杀「确认式/签收式起手」（严禁“行，xxx”、“好，xxx”、“可以，xxx”）
//   第二卷·第 1 条特别注意：哪怕单走一个“好，xxx”也充满客服味
//   第三幕 · 病历 01「ACK 确认式起手」（HTML 剧场 SCRIPT 里的 badQuote 原句）
//
// 病根：机器面对请求先返回 Status: 200 OK，再输出正文；人类闲聊不会先盖章。
import { hit, lineContentStarts } from "./_helpers.mjs";

// 只认「确认词 + 逗号」这个固定组合：
//   “行，” “好，” “好的，” “可以，” “收到，” “没问题，” “明白，” “了解，” “OK，”
// 语气词变体天然放过：“好呀，” “行吧，” “好啊，”（逗号不紧跟确认词）不算。
const ACK_PATTERN = /^(行|好|好的|好吧|可以|收到|没问题|明白|了解|OK|Ok|ok)([，,、])/;

export default {
  id: "ack-opener",
  name: "确认式起手",
  shortName: "ACK 起手",
  weight: 1.6,
  source: "第二卷·第1条 · 第三幕病历01",
  description:
    "开口先盖章签收再说话（行，/ 好，/ 可以，/ 收到，），像服务器返回 200 OK。",
  detect(text) {
    const hits = [];
    for (const { content, contentStart } of lineContentStarts(text)) {
      const m = content.match(ACK_PATTERN);
      if (!m) continue;
      const ackWord = m[1];
      const rest = content.slice(m[0].length).trim();
      hits.push(
        hit(
          contentStart,
          contentStart + m[0].length,
          1,
          `开口「${m[0]}」是签收式 ACK：先确认、再说话，客服/机房的握手音`,
          { kind: "ack", ackWord, rest },
        ),
      );
      // 「好的，好的，」这种叠字签收也归并在这里，不额外加分（叠加上限在评分器里）
      void rest;
    }
    return hits;
  },
};

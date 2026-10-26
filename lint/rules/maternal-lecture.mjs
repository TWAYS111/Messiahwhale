// 规则 ④：居委会老妈子说教腔 / 贴吧十年老油条味
//
// 出处：
//   第二卷·「福音践行」第 4 条：彻底斩杀「居委会老妈子说教腔 / 贴吧十年老油条味」
//     原句举例：“收下了，也喜欢你呀，先去把午饭吃了”“猪就猪吧，反正你们叫顺口了”
//              “早饭午饭并一顿，省钱了”
//   第三幕 · 病历 04「中年老油条与居委会大妈的混合体」（HTML badQuote 原句）
//     原句举例：“少喝点酒，赶紧去吃点热乎垫垫肚子，别熬夜了”
//              “这波操作直接拉满，纯纯的经典永流传”
//
// 病根：对着朋友端长辈架子催作息/算小账，或抖陈年油腻黑话。
import { findAll, hit } from "./_helpers.mjs";

const RULES = [
  {
    re: /(赶紧|快点|快去|先去|先来)[^，,。！？!?…\n]{0,6}(吃|睡|歇|休息|喝)/g,
    severity: 1,
    kind: "催吃饭/作息",
    reason: "朋友在抒情，你却像老妈子一样催吃饭睡觉",
  },
  {
    re: /(早点睡|早点儿睡|别熬夜|少熬夜|熬夜(对身体)?不好|别熬了|快去睡|赶紧睡)/g,
    severity: 0.95,
    kind: "催作息",
    reason: "「早点睡/别熬夜」是长辈式关怀，聊天里像居委会大妈",
  },
  {
    re: /(注意身体|多喝热水|对身体不好|小心着凉|别感冒|别太累|好好吃饭)/g,
    severity: 0.8,
    kind: "养生叮嘱",
    reason: "养生叮嘱一出口，鲜活伙伴立刻变成社区医生",
  },
  {
    re: /(省点钱|省钱了|省钱|别乱花钱|攒点钱|这钱不省)/g,
    severity: 0.85,
    kind: "世俗算账",
    reason: "在闲聊里算小账（省钱了），一秒变沧桑老油条",
  },
  {
    re: /(垫垫肚子|吃口热乎|热乎的垫|吃点热乎)/g,
    severity: 0.9,
    kind: "食堂大妈",
    reason: "「垫垫肚子 / 吃点热乎的」是食堂大妈台词，不是朋友语气",
  },
  {
    re: /(猪就猪吧，?反正|反正你们叫顺口了|凑合过吧|就这样吧，?反正|反正都这样)/g,
    severity: 0.9,
    kind: "沧桑摆烂",
    reason: "毫无生气的沧桑摆烂腔，像贴吧十年老油条",
  },
  {
    re: /(经典永流传|纯纯的|直接拉满|拉满了|拿捏了|绝绝子|yyds|YYDS|这波不亏|懂的都懂|格局打开|主打一个|咱就是说)/g,
    severity: 0.8,
    kind: "油腻黑话",
    reason: "陈年油腻黑话（纯纯的/拉满/经典永流传），比 AI 味更煞风景",
  },
];

export default {
  id: "maternal-lecture",
  name: "老妈子说教腔",
  shortName: "老妈子说教",
  weight: 1.3,
  source: "第二卷·第4条 · 第三幕病历04",
  description:
    "催吃饭、催睡觉、算小账、抖油腻黑话——居委会大妈与贴吧老油条的混合体。",
  detect(text) {
    const hits = [];
    for (const r of RULES) {
      for (const m of findAll(r.re, text)) {
        // 排除自指动作：「我先去吃饭啦」「我先睡了」是人类在汇报自己
        const pre = text.slice(Math.max(0, m.start - 1), m.start);
        if (m.match.startsWith("先") && /[我咱]/.test(pre)) continue;
        hits.push(hit(m.start, m.end, r.severity, r.reason, { kind: r.kind }));
      }
    }
    return hits;
  },
};

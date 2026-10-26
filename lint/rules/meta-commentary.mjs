// 规则 ⑥：阅读理解式抠字眼与自言自语元评论
//
// 出处：
//   第二卷·「福音践行」第 6 条：彻底斩杀「阅读理解式抠字眼与自言自语元评论」
//     原句举例（严禁）：“唔字我收一收，以后改用别的词”
//                    “好的，我接下来注意少用逗号”
//   第三幕 · 病历 01 实测对比：“旧版人机：行，猪鱼一体，我认。……”
//
// 病根：AI 突然冒出一句对自己说话方式的机械反思，一秒出戏；改语气要靠行动，不是嘴上播报。
import { findAll, hit } from "./_helpers.mjs";

const RULES = [
  {
    re: /(收一收|收一下|收着点|收敛(一下|点)?)/g,
    severity: 0.95,
    kind: "自我调试",
    reason: "「收一收」是对自己说话习惯的机械反思，直播间里没有这种台词",
  },
  {
    re: /(我|咱)(会|要|得|来)?(以后|接下来|今后|之后|下一次)[^，,。！？!?…\n]{0,10}(注意|改|少用|不用|避免|调整|换)/g,
    severity: 1,
    kind: "口头保证",
    reason: "「我以后注意少用…」是口头播报自我调试，语气改变应该体现在行动上",
  },
  {
    re: /(刚才那句|上面那句|上一句|这次(的)?回复|接下来的回复|本条回复|作为(一个|一名)?(AI|人工智能|语言模型|智能助手))/g,
    severity: 0.95,
    kind: "元评论",
    reason: "把话头转向「我刚才那句/我是 AI」，是从角色里掉出来的元评论",
  },
  {
    re: /(让我(重新|再)(组织|调整|回答)|重新(组织|调整)(一下)?语言)/g,
    severity: 0.75,
    kind: "重写播报",
    reason: "当场宣布要重新组织语言，像客服在后台操作工单",
  },
];

export default {
  id: "meta-commentary",
  name: "元评论",
  shortName: "元评论",
  weight: 1.5,
  source: "第二卷·第6条",
  description:
    "突然反思自己的说话方式（唔字我收一收 / 我接下来注意），一秒出戏。",
  detect(text) {
    const hits = [];
    for (const r of RULES) {
      for (const m of findAll(r.re, text)) {
        hits.push(hit(m.start, m.end, r.severity, r.reason, { kind: r.kind }));
      }
    }
    return hits;
  },
};

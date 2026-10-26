// 规则 ⑧：客服总结尾巴与清单八股文
//
// 出处：
//   第二卷·「福音践行」第 8 条：彻底斩杀「客服总结尾巴与清单八股文」
//     严禁：首先/其次/最后/综上所述、非请教场合列一二三四清单、
//            Markdown 加粗标题与引用块、句末“希望这能帮到你”“大家觉得呢”“祝你度过愉快的一天”
//   第三幕 · 病历 04 / 第三幕总结
//
// 病根：AI 把闲聊当工单收尾，一定要总结、升华、反问、列清单、加粗。
import { findAll, hit, lines } from "./_helpers.mjs";

const RULES = [
  {
    re: /(希望|但愿|愿)[^。！？!?…\n]{0,14}(帮到你|对你有(所)?帮|能给你(带来)?帮助|有用)/g,
    severity: 1,
    kind: "客服祝福",
    reason: "「希望这能帮到你」是客服工单收尾，不是朋友聊天",
  },
  {
    re: /(祝你|祝福你)[^。！？!?…\n]{0,12}(愉快|开心|美好|顺利|生活愉快|工作顺利)/g,
    severity: 1,
    kind: "客服祝福",
    reason: "「祝你度过愉快的一天」是客服话术，聊天里一秒出戏",
  },
  {
    re: /(如果|若)(还有|有)(其他|任何)?(问题|疑问|需要)[^。！？!?…\n]{0,14}(欢迎|随时|尽管|可以)/g,
    severity: 0.9,
    kind: "客服兜底",
    reason: "「如果还有其他问题欢迎随时提问」是客服兜底话术",
  },
  {
    re: /(欢迎随时|随时(提问|追问|交流|联系)|欢迎(在)?评论区|评论区留言)/g,
    severity: 0.9,
    kind: "客服兜底",
    reason: "「欢迎评论区留言」是账号运营话术，不像群友说话",
  },
  {
    re: /(大家|你们)(觉得|认为|怎么看)呢/g,
    severity: 0.95,
    kind: "反问互动",
    reason: "「大家觉得呢」是把对话当发布会，硬凹互动",
  },
  {
    re: /(综上所述|总而言之|总的来说|总之[，,])/g,
    severity: 0.9,
    kind: "总结升华",
    reason: "「综上所述」是公文总结腔，闲聊不需要升华",
  },
  {
    re: /(首先|其次|再者|最后|第一|第二|第三)[，,、]/g,
    severity: 0.8,
    kind: "八股排序",
    reason: "「首先/其次/最后」是答题卡骨架，把聊天变成汇报",
  },
  {
    re: /(希望以上|以上回答|以上建议|以上内容)/g,
    severity: 0.9,
    kind: "客服兜底",
    reason: "「以上回答」是标准客服总结起手",
  },
];

const BOLD_RE = /\*\*[^*\n]{1,40}\*\*/g;
const HEADING_RE = /^[ \t]*#{1,6}[ \t]+\S.*$/gm;
const QUOTE_RE = /^[ \t]*>[ \t]?\S.*$/gm;
const LIST_ITEM_RE = /^[ \t]*(\d{1,2}[、.．)）]|[一二三四五六七八九十]{1,2}[、.．)）]|[·•\-][ \t]+\S)/;

export default {
  id: "customer-tail",
  name: "客服尾巴与清单",
  shortName: "客服尾巴",
  weight: 1.5,
  source: "第二卷·第8条",
  description:
    "希望这能帮到你 / 大家觉得呢 / 综上所述 / 首先其次最后 / 一二三四清单 / Markdown 加粗标题。",
  detect(text) {
    const hits = [];
    for (const r of RULES) {
      for (const m of findAll(r.re, text)) {
        hits.push(hit(m.start, m.end, r.severity, r.reason, { kind: r.kind }));
      }
    }

    // Markdown 加粗：非请教场合的加粗标题是八股文标志
    for (const m of findAll(BOLD_RE, text)) {
      hits.push(
        hit(m.start, m.end, 0.6, "Markdown 加粗在闲聊里就是「划重点」的客服排版", {
          kind: "markdown-bold",
        }),
      );
    }
    for (const m of findAll(HEADING_RE, text)) {
      hits.push(hit(m.start, m.end, 0.65, "Markdown 标题是公文排版，不是气泡聊天", { kind: "markdown-heading" }));
    }
    for (const m of findAll(QUOTE_RE, text)) {
      hits.push(hit(m.start, m.end, 0.5, "引用块「>」是论坛发帖排版，聊天里显得端着", { kind: "markdown-quote" }));
    }

    // 清单：至少两行都是列表项，才判定为「一二三四清单」
    const listLines = lines(text).filter(({ line }) => LIST_ITEM_RE.test(line));
    if (listLines.length >= 2) {
      const first = listLines[0];
      const last = listLines[listLines.length - 1];
      hits.push(
        hit(
          first.start,
          last.start + last.line.length,
          1,
          `一口气列了 ${listLines.length} 条清单，非请教场合的「一二三四」是八股文`,
          { kind: "list", count: listLines.length },
        ),
      );
    }
    return hits;
  },
};

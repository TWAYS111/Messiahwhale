// --fix 建议模式：只输出改写建议，不调用 LLM、不联网。
// 每条病灶配一张「处方」：能直接删/换的给出 after 文本，不能机械改的给出方向。
import { charLen, splitSentences } from "../rules/_helpers.mjs";

/** 自然起手候选（出自第二卷·第 1 条「洗礼后的开口方式」） */
export const NATURAL_OPENERS = ["欸？", "哇...", "说起来", "这么一说", "确实呢"];

function clip(text, n = 80) {
  const chars = [...text];
  return chars.length <= n ? text : `${chars.slice(0, n).join("")}…`;
}

function removeSpan(text, start, end) {
  return `${text.slice(0, start)}${text.slice(end)}`.replace(/\s{2,}/g, " ").trim();
}

function splitAtComma(text, start, end) {
  const span = text.slice(start, end);
  const idx = span.search(/[，,]/);
  if (idx < 0) return null;
  return {
    a: span.slice(0, idx).trim(),
    b: span.slice(idx + 1).trim(),
  };
}

function fixAck(hit, text) {
  const after =
    (hit.excerpt && hit.excerpt.length < text.length
      ? `${text.slice(0, hit.start)}${text.slice(hit.end)}`
      : text.replace(hit.excerpt, "")
    ).trim() || text.trim();
  return {
    title: "删掉签收词，直接开口",
    detail: `把开头的「${hit.excerpt}」擦掉，从正文第一句开始说。人类接话不会先返回 Status: 200 OK。`,
    after,
    candidates: NATURAL_OPENERS,
    note: "自然起手只是备选，别每句都套同一个语气词——那会变成「感叹词复读」。",
  };
}

function fixBinary(hit, text) {
  const span = text.slice(hit.start, hit.end);
  let parts = [];
  const m1 = span.match(/不是(.{1,20}?)[，,]?\s*而是(.{1,20})$/);
  const m2 = span.match(/并非(.{1,20}?)[，,]?\s*而是(.{1,20})$/);
  const m3 = span.match(/与其说(.{1,20}?)[，,]?\s*不如说(.{1,20})$/);
  const m4 = span.match(/先(.{1,15}?)[，,]\s*再谈(.{1,15})$/);
  const split = splitAtComma(span, 0, span.length);
  if (m1) parts = [m1[1].trim(), m1[2].trim()];
  else if (m2) parts = [m2[1].trim(), m2[2].trim()];
  else if (m3) parts = [m3[1].trim(), m3[2].trim()];
  else if (m4) parts = [m4[1].trim(), m4[2].trim()];
  else if (split) parts = [split.a, split.b];
  return {
    title: "敲碎对联，只留半句",
    detail: `「${clip(span, 40)}」是工整对仗，不是聊天。挑你真正想说的那一半先发出去。`,
    candidates: parts.filter(Boolean).map((p) => p.replace(/^[，,。\s]+/, "")),
    note: "另一半如果真想说，隔一条消息再说；别用逗号焊成一副对联。",
  };
}

function fixTwoBeat(hit, text) {
  if (hit.kind === "isolated") {
    return {
      title: "存疑：孤立的逗号两瓣句",
      detail:
        "人类也常用「A，B」结构，孤立一句不算病。但如果前后几条都长这样，就是流水线复读。",
      candidates: ["把逗号换成「...」：" + (hit.a ? `${hit.a}...${hit.b}` : "")],
      note: "这条只是低置信提示，不计重分。",
    };
  }
  const split = splitAtComma(text, hit.start, hit.end);
  const after = split
    ? `${text.slice(0, hit.start)}${split.a}...${split.b}${text.slice(hit.end)}`
    : null;
  return {
    title: "把逗号换成呼吸",
    detail: `「${clip(hit.excerpt || "", 40)}」两瓣字数接近、又没有别的标点，读起来像流水线压出来的。`,
    after,
    candidates: split ? [split.a, split.b] : [],
    note: "两个办法：逗号换「...」（呼吸停顿），或者把两瓣拆成两条长短不一的消息。",
  };
}

function fixMaternal(hit, text) {
  const after = removeSpan(text, hit.start, hit.end);
  return {
    title: "收起长辈架子",
    detail: "朋友在抒情/闲聊，这句突然催吃饭、催睡觉或算小账，像居委会大妈附体。",
    after: after && after !== text.trim() ? after : null,
    note: "换成对此刻情绪的回应：先接住 ta 想表达的，再聊别的。",
  };
}

function fixPicture(hit, text) {
  return {
    title: "停止画面复述",
    detail: "人类长着眼睛，不需要旁白翻译机。别复述图里有什么，直接说你被逗笑的反应。",
    after: null,
    candidates: ["笑死，这张图我可以看一天", "哈哈哈这表情太离谱了"],
    note: "顺图的气氛玩梗，或聊这张图勾起了什么好玩的联想。",
  };
}

function fixMeta(hit, text) {
  const after = removeSpan(text, hit.start, hit.end);
  return {
    title: "整句删掉，用行动改",
    detail: "对自己说话方式的机械反思会一秒出戏。语气改变直接体现在下一句里，别播报。",
    after: after && after !== text.trim() ? after : null,
    note: "这类台词没有替代句，唯一处方就是删。",
  };
}

function fixDefensive(hit, text) {
  return {
    title: "先接住亲昵，再表达",
    detail: "对方喊昵称/逗你，是在高兴，不是在攻击。先接住那份善意，语气软下来。",
    after: null,
    note: "可以顺着昵称自嘲一句，或者直接接住开心；别把字面当靶子。",
  };
}

function fixCustomer(hit, text) {
  const after = removeSpan(text, hit.start, hit.end);
  return {
    title: "删掉客服尾巴",
    detail:
      hit.kind === "list"
        ? "非请教场合的一二三四清单是答题卡；把清单压成一句你会真的说出口的话。"
        : "总结/祝福/反问「大家觉得呢」都是客服话术，删掉后剩下的才是人话。",
    after: after && after !== text.trim() ? after : null,
    note: "结尾不需要升华，也不需要声明「希望这能帮到你」。",
  };
}

function fixInterjection(hit, text) {
  const after = text.replace(/^(\S{0,12}[：:]\s*)?(唔|嗯|欸|诶|啊|呃|哦|唉|噢)(…{1,2}|\.{3,}|[，,])/, "$1");
  return {
    title: "别让语气词当万能模板",
    detail: "连续几条都用同一个语气词起手，会像卡带的呻吟机。人类不会每句话都先叹一声。",
    after: after.trim() !== text.trim() ? after.trim() : null,
    note: "换一条不用语气词的起手，或者干脆把这个字删掉。",
  };
}

function fixLength(hit, text) {
  const sentences = splitSentences(text)
    .map((s) => s.text.trim())
    .filter(Boolean);
  return {
    title: "拆成几条短消息",
    detail: hit.kind === "multi-paragraph"
      ? "一条消息塞多个段落，像把整篇文档塞进一个气泡。拆成几条连发，每条只说一层意思。"
      : `单条 ${hit.chars ?? charLen(text)} 字。日常闲聊 1~15 字，人类会把长内容拆成两三条长短短不一的碎片。`,
    candidates: sentences.slice(0, 3),
    note: "遇到复杂知识提问才需要长回答；闲聊别抖一整块巨石。",
  };
}

function fixPunctuation(hit, text) {
  const after = text.replace(/。/g, "...").trim();
  return {
    title: "给标点留点呼吸",
    detail:
      hit.kind === "stiff-short"
        ? "超短回复挂一个硬句号像系统回执；换成「...」或「~」会软很多。"
        : "短聊天句里硬句号连用，语气像在念公文；换成「...」停顿会更像在说话。",
    after: after !== text.trim() ? after : null,
    note: "「...」表示犹豫/停顿，「~」表示轻快尾音，但别每条都加。",
  };
}

const FIXERS = {
  "ack-opener": fixAck,
  "binary-antithesis": fixBinary,
  "comma-two-beat": fixTwoBeat,
  "maternal-lecture": fixMaternal,
  "picture-narration": fixPicture,
  "meta-commentary": fixMeta,
  "defensive-edge": fixDefensive,
  "customer-tail": fixCustomer,
  "interjection-repeat": fixInterjection,
  "length-paragraph": fixLength,
  "punctuation-coldness": fixPunctuation,
};

/** 给一条命中生成处方；未知规则给保守的通用建议 */
export function buildFix(hit, text) {
  const fixer = FIXERS[hit.ruleId];
  if (fixer) return fixer(hit, text);
  return {
    title: "删掉这句机器骨架",
    detail: hit.reason,
    after: null,
    note: "规则法只抓形式，具体怎么改还要看语境。",
  };
}

export default { buildFix, NATURAL_OPENERS };

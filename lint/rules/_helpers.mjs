// 通用文本工具：所有规则共用，不依赖任何第三方库。
// 规则来源：《小鲸鱼温暖福音小册子（开源通用简化版）》第二卷 / 第三卷。

/** 按 code point 计算字数（中文、emoji 都算 1 个字） */
export function charLen(text) {
  return [...text].length;
}

/** 去掉行首项目符号与首尾空白（病句样本里常见「· 」前缀） */
export function trimBullet(text) {
  return text.replace(/^[\s·•\-–—*]+/, "").trim();
}

/** 按行扫描，返回每行在原文中的绝对偏移 */
export function lines(text) {
  const out = [];
  let start = 0;
  for (const [lineNo, line] of text.split("\n").entries()) {
    out.push({ line, lineNo, start });
    start += line.length + 1; // + "\n"
  }
  return out;
}

/** 行首可能的「说话人：」标签：群友： / 人机鲸： / ASK： */
export const SPEAKER_LABEL =
  /^([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_\-·]{0,11})[：:]\s*/;
// 不是说话人的提示词前缀，别把「注意：」当人
const NOT_SPEAKER = /^(注意|提示|例如|比如|结论|原因|方法|步骤|建议|分析|回答|正文)$/;

/**
 * 返回每一行「真正的正文」起点（跳过行首空白和说话人标签）。
 * 规则抓句首病时用它，这样贴进来的聊天记录「人机鲸：行，……」也能抓到。
 */
export function lineContentStarts(text) {
  const out = [];
  for (const { line, lineNo, start } of lines(text)) {
    const lead = line.match(/^[ \t]*/)[0].length;
    const rest = line.slice(lead);
    const label = rest.match(SPEAKER_LABEL);
    const useLabel = label && !NOT_SPEAKER.test(label[1]);
    const offset = lead + (useLabel ? label[0].length : 0);
    out.push({
      lineNo,
      lineStart: start,
      contentStart: start + offset,
      content: line.slice(offset),
    });
  }
  return out;
}

/** 切句：只按句末标点/换行切，逗号不切，保留绝对偏移 */
export function splitSentences(text) {
  const out = [];
  const enders = /[。！？!?…\n]/;
  let bufStart = 0;
  let i = 0;
  while (i < text.length) {
    if (enders.test(text[i])) {
      let j = i + 1;
      while (j < text.length && enders.test(text[j]) && text[j] !== "\n") j += 1;
      const raw = text.slice(bufStart, j);
      if (raw.trim()) out.push({ start: bufStart, end: j, text: raw });
      bufStart = j;
      i = j;
    } else {
      i += 1;
    }
  }
  const tail = text.slice(bufStart);
  if (tail.trim()) out.push({ start: bufStart, end: text.length, text: tail });
  return out;
}

/** 扫描某个带 g 正则的全部命中（每次调用重置 lastIndex，避免全局状态串味） */
export function findAll(re, text) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      match: m[0],
      start: m.index,
      end: m.index + m[0].length,
      groups: m.slice(1),
    });
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

/** 构造统一命中对象（各规则只负责找位置和给理由） */
export function hit(start, end, severity, reason, extra = {}) {
  return { start, end, severity, reason, ...extra };
}

/** 命中区间去重：去掉被另一个更长命中完全包住的低严重度命中 */
export function dedupeHits(hits) {
  const sorted = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const h of sorted) {
    const covered = out.some(
      (o) => o.start <= h.start && o.end >= h.end && (o.end - o.start) > h.end - h.start,
    );
    if (!covered) out.push(h);
  }
  return out;
}

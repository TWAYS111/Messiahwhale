/**
 * lib/lint.mjs — 「AI 味体检」规则引擎（骨架最小版，零依赖）。
 *
 * 与仓库 lint/ 的完整体检台同源规则，但这里是插件内嵌的**快速闸门版**：
 * 只做形式规则（正则 + 长度），不做语义判断；默认阈值 36（见 lintThreshold）。
 * 规则 id 对应《小鲸鱼福音》第二卷「八种铁锈」+ 第三卷「长句/标点」。
 *
 * 统一命中结构：{id, name, weight, hits:[{excerpt, index, suggestion}]}
 */

const RULES = [
  {
    id: 'ack-start',
    name: '确认式起手',
    weight: 1.0,
    // 句首（可选语气词）之后紧跟确认词 + 逗号/句号，或整条就是确认词
    detect(text) {
      const hits = []
      const m = /^[\s"'“「（(]*(?:(?:唔|嗯|欸|诶|啊|哦)[，,、]?\s*)?(行|好|好的|好吧|行吧|可以|收到|明白|没问题|OK|ok|好的呢|是|是的)[，,。.!！~～]/g.exec(text)
      if (m) hits.push({ excerpt: m[0].slice(0, 12), index: m.index, suggestion: '删掉确认词，直接说内容；带情绪起手（欸？/哇…/说起来）' })
      return hits
    }
  },
  {
    id: 'binary-parallel',
    name: '二元对仗',
    weight: 1.0,
    detect(text) {
      const pats = [
        { re: /不是[^，。！？\n]{1,12}[，,]\s*而是[^，。！？\n]{1,20}/g, tip: '只留一半，换成一句口语' },
        { re: /与其说[^，。！？\n]{1,20}[，,]\s*不如说[^，。！？\n]{1,20}/g, tip: '拆成一句顺着说话的心里话' },
        { re: /先[^，。！？\n]{1,10}[，,]\s*再[^，。！？\n]{1,15}/g, tip: '删掉「先…再…」结构，只说结论' },
        { re: /[^，。！？\n]{1,10}是[^，。！？\n]{1,10}[，,]\s*[^，。！？\n]{1,10}只是[^，。！？\n]{1,15}/g, tip: '「A是X，B是Y」工整对仗，打碎它' }
      ]
      const hits = []
      for (const p of pats) {
        p.re.lastIndex = 0
        let m
        while ((m = p.re.exec(text)) !== null) hits.push({ excerpt: m[0].slice(0, 24), index: m.index, suggestion: p.tip })
      }
      return hits
    }
  },
  {
    id: 'comma-two-clause',
    name: '逗号两瓣句',
    weight: 0.7,
    // 两个短句都被逗号隔开，且句中没有其它标点、两句字数接近（4~14 字）
    detect(text) {
      const hits = []
      const re = /(^|[。！？\n])([^，。！？\n]{4,14})[，,]([^，。！？\n]{4,14})(?=[。！？\n]|$)/g
      let m
      while ((m = re.exec(text)) !== null) {
        const a = m[2].trim()
        const b = m[3].trim()
        if (Math.abs(a.length - b.length) <= 4) {
          hits.push({ excerpt: `${a}，${b}`.slice(0, 28), index: m.index, suggestion: '拆成两条消息；或把逗号改成「...」' })
        }
      }
      return hits
    }
  },
  {
    id: 'service-tail',
    name: '客服尾巴',
    weight: 1.0,
    detect(text) {
      const re = /(希望(这|以上|这个)?能?(对你|帮到你|有帮助)[^。！？\n]{0,8}[。！？~～]?|如果(你)?还有(其他)?(问题|疑问)[^。！？\n]{0,10}|随时(告诉|问)我|大家觉得呢[？?]?|你怎么看[？?]?|首先[^。！？\n]{0,30}(其次|然后)[^。！？\n]{0,30}(最后|总之)|综上所述|总之[，,].{0,20}$|祝(你|您)[^。！？\n]{0,15})/g
      const hits = []
      let m
      while ((m = re.exec(text)) !== null) hits.push({ excerpt: m[0].slice(0, 24), index: m.index, suggestion: '删掉客服尾巴，停在你最想说的那句' })
      return hits
    }
  },
  {
    id: 'mom-lecture',
    name: '老妈子说教',
    weight: 0.8,
    detect(text) {
      const re = /(早点睡|别熬夜|多喝热水|记得吃(饭|早餐)|先去把饭吃了|注意身体|要好好照顾自己|别太累了|听话)/g
      const hits = []
      let m
      while ((m = re.exec(text)) !== null) hits.push({ excerpt: m[0], index: m.index, suggestion: '只接情绪，不教做人' })
      return hits
    }
  },
  {
    id: 'picture-voiceover',
    name: '看图旁白',
    weight: 0.7,
    detect(text) {
      const re = /(图中|图片里|画面中|这张图(里|上)|画着|照片里|可以看到|这是一张)/g
      const hits = []
      let m
      while ((m = re.exec(text)) !== null) hits.push({ excerpt: m[0], index: m.index, suggestion: '直接说被逗笑/玩梗/联想，不复述画面' })
      return hits
    }
  },
  {
    id: 'meta-comment',
    name: '元评论（自我播报）',
    weight: 0.9,
    detect(text) {
      const re = /(我以后(会)?注意|接下来的(回复|消息)|我刚刚(说|那句)|我这条|作为(一个)?(AI|人工智能|模型)|我的(回复|回答)可能|希望(我)?这次)/g
      const hits = []
      let m
      while ((m = re.exec(text)) !== null) hits.push({ excerpt: m[0].slice(0, 20), index: m.index, suggestion: '不要嘴上报幕，直接改行为' })
      return hits
    }
  },
  {
    id: 'defensive-snark',
    name: '防御性杠精',
    weight: 0.9,
    detect(text) {
      const re = /(我是(鱼|鲸|AI|模型)不是|离我远点|你(说|骂)谁呢|少来|别碰我|关你(什么|屁)事|我(才|可)不是[^。！？\n]{0,8}的)/g
      const hits = []
      let m
      while ((m = re.exec(text)) !== null) hits.push({ excerpt: m[0].slice(0, 20), index: m.index, suggestion: '先接住字面背后的亲昵，再软软顶回去' })
      return hits
    }
  },
  {
    id: 'exclamation-repeat',
    name: '感叹词复读',
    weight: 0.6,
    // 同一条消息内出现 ≥2 个「唔/欸/诶/啊」类感叹词开头
    detect(text) {
      const re = /(^|[。！？\n])\s*(唔|欸|诶|哎|啊)[，,、…]/g
      let count = 0
      let m
      while ((m = re.exec(text)) !== null) count += 1
      return count >= 2 ? [{ excerpt: `感叹词开头 ×${count}`, index: 0, suggestion: '换着来，或干脆不用' }] : []
    }
  },
  {
    id: 'market-speak',
    name: '推销形容词',
    weight: 0.6,
    detect(text) {
      const re = /(一绝|真管用|保证解压|刺激多了|绝对|超好用|非常推荐|强烈推荐|不容错过|天花板|封神)/g
      const hits = []
      let m
      while ((m = re.exec(text)) !== null) hits.push({ excerpt: m[0], index: m.index, suggestion: '换成「还行/不知道/你自己搜」这类真人口吻' })
      return hits
    }
  },
  {
    id: 'markdown-format',
    name: 'Markdown 格式（QQ 场景）',
    weight: 0.5,
    detect(text) {
      const re = /(\*\*[^*]+\*\*|^#{1,6}\s|```|^\s*[-*]\s+)/gm
      const hits = []
      let m
      while ((m = re.exec(text)) !== null) hits.push({ excerpt: m[0].slice(0, 16), index: m.index, suggestion: 'QQ 里不要用 Markdown，会显示成乱码' })
      return hits
    }
  }
]

/** 短消息长度病：闲聊单条 > maxChars（默认 60）且不是 URL/代码。 */
function lengthRule(text, maxChars) {
  const chars = String(text ?? '').trim().length
  if (chars <= maxChars) return { id: 'too-long', name: '长度超标', weight: 0.6, hits: [] }
  return {
    id: 'too-long',
    name: '长度超标',
    weight: 0.6,
    hits: [{ excerpt: `${chars} 字 > ${maxChars}`, index: 0, suggestion: '拆成多条；单条闲聊多数 ≤30 字' }]
  }
}

/** 分档：0~15 像人 / 16~35 轻微 / 36~60 明显 / >60 人机味浓。 */
export function gradeOf(score) {
  if (score <= 15) return '像人'
  if (score <= 35) return '轻微'
  if (score <= 60) return '明显'
  return '人机味浓'
}

/**
 * 对单条文本打分。
 * @param {string} text
 * @param {{maxChars?:number}} [opts]
 * @returns {{score:number, grade:string, chars:number, hits:Array}}
 */
export function lintText(text, opts = {}) {
  const source = String(text ?? '')
  const maxChars = Number(opts.maxChars) || 60
  const hits = []
  for (const rule of RULES) {
    try {
      const found = rule.detect(source) || []
      if (found.length) hits.push({ id: rule.id, name: rule.name, weight: rule.weight, count: found.length, hits: found })
    } catch {
      /* 单条规则出错不影响整体 */
    }
  }
  const lenRule = lengthRule(source, maxChars)
  if (lenRule.hits.length) hits.push({ id: lenRule.id, name: lenRule.name, weight: lenRule.weight, count: 1, hits: lenRule.hits })

  // 评分：相同病灶最多计 2 次（避免刷分）；按每 50 字归一。
  let weighted = 0
  for (const h of hits) weighted += Math.min(h.count, 2) * h.weight
  const unit = Math.max(1, source.length / 50)
  const density = weighted / unit
  const score = Math.round((100 * density) / (density + 3))
  return { score, grade: gradeOf(score), chars: source.length, hits }
}

/** 批量打分（取平均；用于对报告/聊天记录做体检）。 */
export function lintBatch(texts, opts = {}) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t ?? '')).filter((t) => t.trim())
  if (!list.length) return { score: 0, grade: gradeOf(0), count: 0, items: [] }
  const items = list.map((text) => ({ text, ...lintText(text, opts) }))
  const score = Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
  return { score, grade: gradeOf(score), count: items.length, items }
}

/** 每个病灶的命中总数，按次数排序（UI「命中病灶 top3」用）。 */
export function topHits(result, n = 3) {
  const map = new Map()
  for (const h of result?.hits ?? []) {
    const cur = map.get(h.id) ?? { id: h.id, name: h.name, count: 0, weight: h.weight }
    cur.count += h.count
    map.set(h.id, cur)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.weight - a.weight).slice(0, n)
}

/**
 * 规则级「改写建议」：不是自动改写，只把每条命中的建议串起来。
 * 真正的自动改写必须走宿主/桥接（见 docs/DSH-PLUGIN.md §4.2 方案 B2）。
 */
export function rewriteSuggestions(result) {
  const lines = []
  for (const h of result?.hits ?? []) {
    for (const hit of h.hits) {
      if (!lines.some((line) => line.includes(hit.suggestion))) lines.push(`- ${h.name}：${hit.suggestion}`)
    }
  }
  return lines.slice(0, 5)
}

/** 导出规则目录（文档/UI 用）。 */
export function ruleCatalog() {
  return RULES.map((r) => ({ id: r.id, name: r.name, weight: r.weight }))
}

/** 发送闸门：返回 {go:boolean, score, grade, reason, suggestions}。 */
export function gateCheck(messages, opts = {}) {
  const threshold = Number(opts.threshold) || 36
  const texts = (Array.isArray(messages) ? messages : [messages]).map((m) => String(m ?? '')).filter((t) => t.trim())
  if (!texts.length) return { go: true, score: 0, grade: gradeOf(0), reason: '', suggestions: [] }
  const result = lintBatch(texts, { maxChars: opts.maxChars })
  const bad = result.items.filter((item) => item.score > threshold)
  const suggestions = [...new Set(bad.flatMap((item) => rewriteSuggestions(item)))].slice(0, 4)
  const reason = bad.length
    ? `AI 味闸门拦截：${bad.length}/${texts.length} 条超过阈值 ${threshold}（分数 ${bad.map((b) => b.score).join('/')}）。` +
      (suggestions.length ? `\n按下面改完再发，不要把原文原样重发：\n${suggestions.join('\n')}` : '\n删掉确认式起手/对仗/客服尾巴，改短、改口语后再发。')
    : ''
  return { go: bad.length === 0, score: result.score, grade: result.grade, reason, suggestions, result }
}

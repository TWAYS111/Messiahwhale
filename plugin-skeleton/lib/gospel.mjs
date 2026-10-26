/**
 * lib/gospel.mjs — 「读 gospel.md → 生成注入块」核心逻辑（零第三方依赖）。
 *
 * 资产模型（与仓库 gospel/composition.md 对齐）：
 *   ① 角色卡（用户自己的，本插件不碰）
 *   ② gospel/core.md      —— 去 AI 味内核（本插件注入的内容主体）
 *   ③ gospel/adapters/<场景>.md —— 场景适配层（qq-group / bili-comment，一次只装一个）
 *   ④ 输出协议（由 adapter 内自带；桥接/宿主负责强制）
 *   强度：light / standard / full（standard = core + adapter，默认）
 *
 * 本文件只做「纯文本组装 + 受管段落写入」，不碰网络、不调 LLM，便于单测。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

export const PLUGIN_VERSION = '0.1.0-skeleton'
export const MARKER_BEGIN = (meta) =>
  `<!-- whale-gospel:begin version=${meta.version} core=${meta.coreVersion} sha=${meta.coreSha} strength=${meta.strength} adapter=${meta.adapter} -->`
export const MARKER_END = '<!-- whale-gospel:end -->'

/** 支持的强度档位（与 gospel/composition.md §2 一致）。 */
export const STRENGTHS = ['light', 'standard', 'full']
/** 支持的场景适配层。 */
export const ADAPTERS = ['qq-group', 'bili-comment', 'none']

/** $DSH_HOME 的兜底：DSH_HOME 环境变量 > ~/.dsh。 */
export function dshHome() {
  const home = process.env.DSH_HOME
  if (home && home.trim()) return resolve(home.trim())
  return join(homedir(), '.dsh')
}

/** 展开路径里的 $DSH_HOME / ~ / <plugin> 占位符。 */
export function expandPath(p, pluginDir = '') {
  let out = String(p ?? '').trim()
  if (!out) return ''
  out = out.replaceAll('$DSH_HOME', dshHome())
  out = out.replaceAll('${DSH_HOME}', dshHome())
  out = out.replace(/^~\//, join(homedir(), '/'))
  out = out.replaceAll('<plugin>', pluginDir)
  return resolve(out)
}

/** 找 gospel 资产根目录。返回 {root, source}；找不到 root=null。 */
export function resolveGospelRoot(config = {}, pluginDir = '') {
  const explicit = expandPath(config.gospelRoot, pluginDir)
  const candidates = []
  if (explicit) candidates.push(['config.gospelRoot', explicit])
  const env = process.env.WHALE_GOSPEL_ROOT
  if (env && env.trim()) candidates.push(['env.WHALE_GOSPEL_ROOT', resolve(env.trim())])
  candidates.push(['$DSH_HOME/whale-gospel/gospel', join(dshHome(), 'whale-gospel', 'gospel')])
  if (pluginDir) {
    candidates.push(['<plugin>/../../gospel', resolve(pluginDir, '..', '..', 'gospel')])
    candidates.push(['<plugin>/gospel', join(pluginDir, 'gospel')])
  }
  for (const [source, dir] of candidates) {
    try {
      if (existsSync(join(dir, 'core.md'))) return { root: dir, source }
    } catch {
      /* 继续找 */
    }
  }
  return { root: null, source: 'not-found', tried: candidates.map(([s, d]) => `${s}=${d}`) }
}

/** 极简 YAML frontmatter 解析（只取标量键；不做完整 YAML）。 */
export function parseFrontmatter(text) {
  const raw = String(text ?? '')
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!m) return { meta: {}, body: raw }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body: raw.slice(m[0].length) }
}

/** git 式短 sha；用于注入块指纹与「这一版有没有换」的判断。 */
export function sha256(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex')
}
export const sha8 = (text) => sha256(text).slice(0, 8)

/** light 档：优先用仓库生成好的 prompts/whale-light.md；没有就从 core 抽「禁忌/短句」相关小节。 */
export function extractLight(coreBody, root) {
  const lightFile = root ? join(resolve(root, '..'), 'prompts', 'whale-light.md') : ''
  if (lightFile && existsSync(lightFile)) {
    const text = readFileSync(lightFile, 'utf8').trim()
    if (text) return { text, source: lightFile }
  }
  const blocks = String(coreBody ?? '').split(/^(?=##+\s)/m)
  const keep = blocks.filter((b) => {
    const head = b.split(/\r?\n/, 1)[0] ?? ''
    return /(禁忌|铁锈|短句|句子|长度|标点|八条)/.test(head)
  })
  const text = (keep.length ? keep : blocks.slice(0, 2)).join('\n').trim()
  return { text, source: 'core.md#extract(light)' }
}

/**
 * 组装 gospel 注入块（未加标记；标记由 renderInjectionBlock 加）。
 * @returns {{text:string, meta:{version,coreVersion,coreSha,strength,adapter,root,source,chars,bytes}, warnings:string[]}}
 */
export function composeGospel(config = {}, pluginDir = '') {
  const strength = STRENGTHS.includes(config.strength) ? config.strength : 'standard'
  const adapter = ADAPTERS.includes(config.adapter) ? config.adapter : 'qq-group'
  const warnings = []
  const found = resolveGospelRoot(config, pluginDir)
  if (!found.root) {
    return {
      text: '',
      meta: {
        version: PLUGIN_VERSION,
        coreVersion: '',
        coreSha: '',
        strength,
        adapter,
        root: '',
        source: 'not-found',
        chars: 0,
        bytes: 0
      },
      warnings: [`gospel 资产未找到；尝试过：${(found.tried || []).join(' | ')}`]
    }
  }
  const root = found.root
  const coreFile = join(root, 'core.md')
  const coreRaw = readFileSync(coreFile, 'utf8')
  const { meta: coreMeta, body: coreBody } = parseFrontmatter(coreRaw)
  const coreVersion = String(coreMeta.version ?? 'unknown')
  const coreSha = sha8(coreBody)

  const parts = []
  let effectiveAdapter = adapter
  if (strength === 'light') {
    const light = extractLight(coreBody, root)
    parts.push(light.text)
    effectiveAdapter = 'none'
    warnings.push(`light 档：${light.source}`)
  } else {
    parts.push(coreBody.trim())
    if (adapter !== 'none') {
      const adapterFile = join(root, 'adapters', `${adapter}.md`)
      if (existsSync(adapterFile)) {
        const { body: adapterBody } = parseFrontmatter(readFileSync(adapterFile, 'utf8'))
        parts.push(adapterBody.trim())
      } else {
        warnings.push(`adapter 不存在：${adapterFile}（只注入 core）`)
        effectiveAdapter = 'none'
      }
    }
    if (strength === 'full') {
      // full = standard + few-shot/自检：仓库里生成物既已含 few-shot；这里只额外提示桥接协议。
      warnings.push('full 档：core + adapter；few-shot 已包含在 adapter 的示例节')
    }
  }
  const text = parts.filter(Boolean).join('\n\n')
  return {
    text,
    meta: {
      version: PLUGIN_VERSION,
      coreVersion,
      coreSha,
      strength,
      adapter: effectiveAdapter,
      root,
      source: found.source,
      chars: text.length,
      bytes: Buffer.byteLength(text, 'utf8')
    },
    warnings
  }
}

/** 给注入块套上可识别的受管标记（首尾），便于 UI/日志判断「这一版注入的是哪一版福音」。 */
export function renderInjectionBlock(composed) {
  if (!composed || !composed.text) return ''
  return `${MARKER_BEGIN(composed.meta)}\n${composed.text}\n${MARKER_END}`
}

/** 从文本里取出受管段落（没有返回空串）。 */
export function extractManagedSection(text, marker = 'whale-gospel') {
  const re = new RegExp(`<!-- ${marker}:begin[^>]*-->([\\s\\S]*?)<!-- ${marker}:end -->`)
  const m = re.exec(String(text ?? ''))
  return m ? m[1] : ''
}

/**
 * 幂等写入受管段落（先备份，再替换，再回读校验）。
 * position: 'tail'（追加到末尾，默认）| 'head'（插到文首；⚠️ 会挤占正文配额）
 */
export function upsertManagedSection({ filePath, block, marker = 'whale-gospel', position = 'tail', dryRun = true }) {
  const target = resolve(filePath)
  const old = existsSync(target) ? readFileSync(target, 'utf8') : ''
  const blockText = String(block ?? '').trim()
  if (!blockText) return { ok: false, reason: '注入块为空' }
  // block 可能已经是 renderInjectionBlock() 的成品（自带首尾标记）；否则补一对受管标记。
  const alreadyMarked = new RegExp(`<!-- ${marker}:begin`).test(blockText) && blockText.includes(MARKER_END)
  const section = alreadyMarked ? blockText : `<!-- ${marker}:begin managed -->\n${blockText}\n${MARKER_END}`
  const re = new RegExp(`<!-- ${marker}:begin[^>]*-->[\\s\\S]*?<!-- ${marker}:end -->`)
  let next
  if (re.test(old)) {
    next = old.replace(re, section)
  } else if (position === 'head') {
    next = `${section}\n\n${old}`
  } else {
    next = `${old.replace(/\s+$/, '')}\n\n${section}\n`
  }
  if (next === old) return { ok: true, changed: false, target, bytes: Buffer.byteLength(next, 'utf8') }
  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      changed: true,
      target,
      before: old.length,
      after: next.length,
      preview: next.slice(0, 400)
    }
  }
  const backup = `${target}.wg-bak-${Date.now()}`
  try {
    if (existsSync(target)) copyFileSync(target, backup)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, next, 'utf8')
    const readback = readFileSync(target, 'utf8')
    if (!re.test(readback)) return { ok: false, reason: '回读校验失败（受管段落没写进去）', target }
    return { ok: true, changed: true, target, backup, bytes: Buffer.byteLength(next, 'utf8') }
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error), target }
  }
}

/** 去掉受管段落（回滚用）。 */
export function removeManagedSection({ filePath, marker = 'whale-gospel', dryRun = true }) {
  const target = resolve(filePath)
  if (!existsSync(target)) return { ok: false, reason: '文件不存在', target }
  const old = readFileSync(target, 'utf8')
  const re = new RegExp(`<!-- ${marker}:begin[^>]*-->[\\s\\S]*?<!-- ${marker}:end -->\\n?`)
  const next = old.replace(re, '').replace(/\n{3,}/g, '\n\n')
  if (next === old) return { ok: true, changed: false, target }
  if (dryRun) return { ok: true, dryRun: true, changed: true, target, before: old.length, after: next.length }
  const backup = `${target}.wg-bak-${Date.now()}`
  copyFileSync(target, backup)
  writeFileSync(target, next, 'utf8')
  return { ok: true, changed: true, target, backup }
}

/** 默认插件目录（ESM 下取本文件所在目录的上一级）。 */
export function pluginDirOf(metaUrl = import.meta.url) {
  return resolve(dirname(fileURLToPath(metaUrl)), '..')
}

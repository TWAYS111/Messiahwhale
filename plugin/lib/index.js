/**
 * dsh-whale-gospel — 鲸鱼柔顺剂 v0.1（Host 半端）
 * ============================================================================
 * 一句话：**按 Agent 预设逐个开关，把「去 AI 味」人格提示词注入到选中的预设里。**
 *
 * 设计要点（全部按本机 DSH 真实契约核对过）：
 *  · 注入方式 = `agent/created` 时，在该 agent 的 scope 里注册一个
 *    `systemPrompt.section({ name, order: 20000 })`。排在官方 persona section 之后，
 *    让福音负责校准思考与表达；保留宿主安全、工具、团队等 section，不使用 complete 替换。
 *  · **不改 preset 文件、不覆盖角色卡、不做全局注入**；只对「被勾选的预设」新建的会话生效。
 *  · 检测：QQ 机器人 = 是否存在 `mcp__snowluma__qq_*` 工具 / 带 qq 的预设；
 *          刷B站   = 是否存在 `bili_*` 工具 / dsh-bili-scroll 插件 / 家目录 duty.md。
 *    检测不到也完全能用（给「创造模式」这类预设单独勾选）。
 *  · 刷B站开关 = 把注入块（带指针标记）写进 `$DSH_HOME/bili-duty/duty.md`，写前自动备份，
 *    关闭时只移除自己的块。headless 每轮都会重新读这份章程 ⇒ 下一轮生效。
 *
 * 零第三方依赖（本机 profile 是 autoInstallPeers:false，不能被依赖卡住激活）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = dirname(HERE)
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DSH_PROFILE_DIR = process.env.DSH_PROFILE_DIR || ''
const STATE_PATH = join(DSH_HOME, 'whale-gospel', 'v0.1-state.json')
const CUSTOM_PATH = join(DSH_HOME, 'whale-gospel', 'custom.md')
const SECTION_NAME = 'whale-gospel:core'
// 放在官方已分配 section 之后：角色卡提供事实与身份素材，福音最后校准思考和表达方式。
// 不使用 PromptSection.complete，避免吞掉安全、工具、团队等宿主提示词。
const SECTION_ORDER_DEFAULT = 20000
const VERSION = '0.2.0'
const ART_PATH = join(PKG_DIR, 'assets', 'whale.jpg')
const BEGIN_RE = /<!-- whale-gospel:begin[\s\S]*?<!-- whale-gospel:end -->/

export const name = 'whale-gospel'
export const inject = ['webServer']

/* ─────────────────────────── 配置 / 状态 ─────────────────────────── */

function normalizeConfig(config) {
  const src = config && typeof config === 'object' ? config : {}
  const order = Number(src.sectionOrder)
  return {
    gospelRoot: typeof src.gospelRoot === 'string' ? src.gospelRoot : '',
    sectionOrder: Number.isFinite(order) ? order : SECTION_ORDER_DEFAULT,
  }
}

function defaultState() {
  return {
    version: 1,
    pluginVersion: VERSION,
    strength: 'auto', // auto | light | standard
    presets: {},      // { [presetId]: { enabled: true, adapter, at } }
    bili: { enabled: false, at: null },
    custom: { enabled: false }, // 自定义补充规则的开关（正文在 custom.md）
    think: { enabled: true },   // 内省教义：thinking 用中文、入戏（正文在 gospel/think.md）
    stats: { injected: 0 },
    lastInjected: [],
    updatedAt: null,
  }
}

function loadState() {
  try {
    const raw = readFileSync(STATE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const base = defaultState()
    return {
      ...base,
      ...parsed,
      presets: parsed.presets && typeof parsed.presets === 'object' ? parsed.presets : {},
      bili: { enabled: !!(parsed.bili && parsed.bili.enabled), at: parsed.bili?.at ?? null },
      custom: { enabled: !!(parsed.custom && parsed.custom.enabled) },
      think: { enabled: parsed.think?.enabled !== false },
      stats: { injected: Number(parsed.stats?.injected) || 0 },
      lastInjected: Array.isArray(parsed.lastInjected) ? parsed.lastInjected.slice(0, 20) : [],
    }
  } catch {
    return defaultState()
  }
}

function saveState(state) {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    state.updatedAt = new Date().toISOString()
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
  } catch (err) {
    // 状态写不进去不影响注入，只是面板回显会旧；不让它抛出去
  }
}

/* ─────────────────────────── 自定义补充规则（用户自己的 md） ─────────────────────────── */

const CUSTOM_TEMPLATE = `# 我的补充规则（自定义）

> 这里写的东西会**追加在官方福音之后**再注入，不会替代官方内容。
> 只写你这个角色/这个群特有的东西：称呼、口头禅、禁区、群友黑话。
> 这一行和下面的示例可以整段删掉；留空或关掉开关就不生效。

- 群友叫我「鲸鱼猪」时别纠正，那是昵称。
- 凌晨两点以后说话更短，可以先说困了。
`

function ensureCustomFile() {
  try {
    if (existsSync(CUSTOM_PATH)) return
    mkdirSync(dirname(CUSTOM_PATH), { recursive: true })
    writeFileSync(CUSTOM_PATH, CUSTOM_TEMPLATE, 'utf8')
  } catch {
    /* 建不了就下次再试 */
  }
}

function readCustomText() {
  try {
    ensureCustomFile()
    return readFileSync(CUSTOM_PATH, 'utf8')
  } catch {
    return ''
  }
}

function writeCustomText(text) {
  mkdirSync(dirname(CUSTOM_PATH), { recursive: true })
  writeFileSync(CUSTOM_PATH, String(text ?? ''), 'utf8')
}

/** 在系统的编辑器/文件管理器里打开一个已知路径（白名单由调用方决定，不接任意路径）。 */
function openInShell(hostPath) {
  try {
    if (!existsSync(hostPath)) return { ok: false, error: '路径不存在：' + hostPath }
    const isDir = statSync(hostPath).isDirectory()
    const platform = process.platform
    let command
    let args
    if (platform === 'win32') {
      command = isDir ? 'explorer.exe' : 'notepad.exe'
      args = [hostPath]
    } else if (platform === 'darwin') {
      command = 'open'
      args = [hostPath]
    } else {
      command = 'xdg-open'
      args = [hostPath]
    }
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
    return { ok: true, path: hostPath, openedWith: command }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

/* ─────────────────────────── gospel 资产 ─────────────────────────── */

function stripFrontmatter(md) {
  let text = String(md || '')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3)
    if (end !== -1) text = text.slice(end + 4)
  }
  // 去掉文件头部的说明性 HTML 注释（它解释怎么拼接，不该被注入到模型提示词里）
  return text.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim()
}

function frontmatterValue(md, key) {
  const m = String(md || '').match(new RegExp('^' + key + ':\\s*(.+)$', 'm'))
  return m ? m[1].trim() : undefined
}

const sha8 = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8)

/** light 档：从 core 抽「第二卷八条禁忌 + 第三卷短句」，砍掉经文段落（与仓库 scripts/bundle.mjs 同逻辑）。 */
function extractLight(coreBody) {
  const out = []
  let mode = 'skip'
  for (const line of String(coreBody || '').split('\n')) {
    if (/^##\s/.test(line)) {
      mode = /第二卷|第三卷/.test(line) ? 'keep' : 'skip'
      if (mode === 'keep') out.push(line)
      continue
    }
    if (mode === 'skip') continue
    if (mode === 'keep' && /^###\s*「经文」/.test(line)) { mode = 'verse'; continue }
    if (mode === 'verse') {
      if (/^###\s*「福音践行」/.test(line)) mode = 'keep'
      else continue
    }
    out.push(line)
  }
  return out.join('\n').trim()
}

function resolveGospelRoot(cfg) {
  const candidates = [
    cfg?.gospelRoot,
    process.env.WHALE_GOSPEL_ROOT,
    join(DSH_HOME, 'whale-gospel', 'gospel'),
    join(PKG_DIR, 'gospel'),
  ].filter((p) => typeof p === 'string' && p.trim())
  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'core.md'))) return resolve(candidate)
    } catch {
      /* 下一个 */
    }
  }
  return undefined
}

/** 读「内省教义」层（thinking 用中文、入戏）；没有这个文件就退回空串。 */
function readThinkText(root) {
  const candidates = [root && join(root, 'think.md'), join(PKG_DIR, 'gospel', 'think.md')].filter(Boolean)
  for (const target of candidates) {
    try {
      if (existsSync(target)) return stripFrontmatter(readFileSync(target, 'utf8'))
    } catch {
      /* 下一个 */
    }
  }
  return ''
}

function composeGospel(root, { adapter = 'none', strength = 'standard', customText = '', thinkText = '' } = {}) {
  if (!root) return { text: '', chars: 0, adapter, strength, warnings: ['未找到 gospel 资产（core.md）'] }
  let coreRaw
  try {
    coreRaw = readFileSync(join(root, 'core.md'), 'utf8')
  } catch (err) {
    return { text: '', chars: 0, adapter, strength, warnings: ['读取 core.md 失败：' + err.message] }
  }
  const coreVersion = frontmatterValue(coreRaw, 'version') || '1.0.0'
  const coreSha = sha8(coreRaw)
  const coreBody = stripFrontmatter(coreRaw)
  let body
  if (strength === 'light') {
    const lightPath = join(root, 'light.md')
    body = existsSync(lightPath) ? stripFrontmatter(readFileSync(lightPath, 'utf8')) : extractLight(coreBody)
  } else {
    body = coreBody
    if (adapter && adapter !== 'none') {
      const adapterPath = join(root, 'adapters', adapter + '.md')
      if (existsSync(adapterPath)) body += '\n\n---\n\n' + stripFrontmatter(readFileSync(adapterPath, 'utf8'))
    }
  }
  const think = typeof thinkText === 'string' ? thinkText.trim() : ''
  if (think) body += '\n\n---\n\n' + think
  const custom = typeof customText === 'string' ? customText.trim() : ''
  if (custom) body += '\n\n## 我的补充规则（用户自定义 · 追加）\n\n' + custom
  const begin = `<!-- whale-gospel:begin v=${VERSION} core=${coreVersion} sha=${coreSha} strength=${strength} adapter=${adapter || 'none'} think=${think ? sha8(think) : '0'} custom=${custom ? sha8(custom) : '0'} -->`
  const text = begin + '\n' + body.trim() + '\n<!-- whale-gospel:end -->'
  return { text, chars: text.length, coreVersion, coreSha, adapter, strength, root, warnings: [] }
}

/* ─────────────────────────── 预设 / 检测 ─────────────────────────── */

function adapterForPreset(preset) {
  const hay = `${preset?.id || ''} ${preset?.name || ''}`
  return /qq/i.test(hay) ? 'qq-group' : 'none'
}

/** 界面上的友好名（注册表里的 name 对内置预设只有小写 id，加上人话更好认）。 */
const FRIENDLY_PRESET_NAMES = {
  standard: '创造模式',
  minimal: '极简模式',
  ptc: 'PTC 模式',
  cordis: 'Cordis 模式',
}

function displayNameOf(preset) {
  return FRIENDLY_PRESET_NAMES[preset?.id] || preset?.name || preset?.id || ''
}

async function listPresets(ctx) {
  const registry = ctx.get('agentPresets')
  if (!registry || typeof registry.list !== 'function') return []
  try {
    const list = await registry.list()
    return (Array.isArray(list) ? list : []).map((p) => ({
      id: String(p.id),
      name: p.name ? String(p.name) : String(p.id),
      description: p.description ? String(p.description) : '',
      isDefault: !!p.isDefault,
      broken: p.broken ? String(p.broken) : undefined,
    }))
  } catch {
    return []
  }
}

function toolNames(ctx) {
  try {
    const tools = ctx.get('tools')
    const schemas = tools && typeof tools.schemas === 'function' ? tools.schemas() : []
    return (Array.isArray(schemas) ? schemas : []).map((s) => String(s?.name || '')).filter(Boolean)
  } catch {
    return []
  }
}

function detectInfra(ctx, presets) {
  const names = toolNames(ctx)
  const qqTools = names.filter((n) => n.startsWith('mcp__snowluma__qq_'))
  const biliTools = names.filter((n) => n.startsWith('bili_'))
  const qqPresets = presets.filter((p) => adapterForPreset(p) === 'qq-group').map((p) => p.id)
  const profileDir = DSH_PROFILE_DIR || join(DSH_HOME, 'profiles', process.env.DSH_PROFILE || 'web')
  const biliPlugin = existsSync(join(profileDir, 'node_modules', 'dsh-bili-scroll'))
  const dutyPath = join(DSH_HOME, 'bili-duty', 'duty.md')
  const dutyExists = existsSync(dutyPath)
  return {
    qq: {
      present: qqTools.length > 0 || qqPresets.length > 0,
      toolCount: qqTools.length,
      presets: qqPresets,
      sampleTools: qqTools.slice(0, 4),
    },
    bili: {
      present: biliTools.length > 0 || biliPlugin || dutyExists,
      toolCount: biliTools.length,
      plugin: biliPlugin,
      dutyExists,
      dutyPath,
    },
    toolTotal: names.length,
  }
}

const resolveStrength = (state, adapter) =>
  state.strength === 'auto' ? (adapter === 'qq-group' ? 'standard' : 'light') : state.strength

/* ─────────────────────────── 刷B站 duty.md 注入 ─────────────────────────── */

function biliDutyPath() {
  return join(DSH_HOME, 'bili-duty', 'duty.md')
}

function stamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
}

function stripManagedBlock(text) {
  return String(text || '').replace(new RegExp(BEGIN_RE.source + '\\r?\\n?', 'g'), '').replace(/^\s*\n+/, '')
}

function applyBiliInjection(enabled, composed) {
  const duty = biliDutyPath()
  if (!existsSync(duty)) {
    return { ok: false, error: `没找到 ${duty}（刷B站插件可能没装，或还没跑过一轮）` }
  }
  const original = readFileSync(duty, 'utf8')
  const had = BEGIN_RE.test(original)
  if (enabled) {
    if (!composed.text) return { ok: false, error: '福音资产没找到，无法注入' }
    const backup = `${duty}.whale-bak-${stamp()}`
    writeFileSync(backup, original, 'utf8')
    writeFileSync(duty, composed.text + '\n\n' + stripManagedBlock(original), 'utf8')
    return { ok: true, path: duty, backup, chars: composed.chars, mode: had ? 'replace' : 'insert' }
  }
  if (!had) return { ok: true, path: duty, mode: 'noop' }
  const backup = `${duty}.whale-bak-${stamp()}`
  writeFileSync(backup, original, 'utf8')
  writeFileSync(duty, stripManagedBlock(original), 'utf8')
  return { ok: true, path: duty, backup, mode: 'remove' }
}

/** duty.md 的备份清单（每次开关都会留一份，久了要能清）。 */
function listBiliBackups() {
  const dir = join(DSH_HOME, 'bili-duty')
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((entry) => entry.startsWith('duty.md.whale-bak-'))
      .map((entry) => {
        const full = join(dir, entry)
        let bytes = 0
        try {
          bytes = statSync(full).size
        } catch {
          /* 读不到大小就 0 */
        }
        return { name: entry, bytes }
      })
      .sort((a, b) => (a.name < b.name ? 1 : -1))
  } catch {
    return []
  }
}

/**
 * 清理备份：只删 bili-duty 目录里、文件名符合自己前缀的备份。
 * 传 names 只删指定文件；否则保留最近 keep 份（默认 5）其余删除。
 */
function pruneBiliBackups({ names, keep = 5 } = {}) {
  const dir = join(DSH_HOME, 'bili-duty')
  const all = listBiliBackups()
  const wanted = Array.isArray(names) && names.length
    ? all.filter((entry) => names.includes(entry.name))
    : all.slice(Math.max(0, Number(keep) || 0))
  const removed = []
  for (const entry of wanted) {
    const full = join(dir, entry.name)
    if (!entry.name.startsWith('duty.md.whale-bak-')) continue
    try {
      unlinkSync(full)
      removed.push(entry.name)
    } catch {
      /* 删不掉就留着 */
    }
  }
  return { removed, kept: listBiliBackups().length }
}

/* ─────────────────────────── HTTP API ─────────────────────────── */

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolvePromise) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolvePromise(raw ? JSON.parse(raw) : {})
      } catch {
        resolvePromise({})
      }
    })
    req.on('error', () => resolvePromise({}))
  })
}

function createApi(ctx, cfg, state) {
  const gospelRoot = () => resolveGospelRoot({ gospelRoot: cfg.gospelRoot })

  const composeFor = (adapter, strength, cache) => {
    const customText = state.custom?.enabled ? readCustomText() : ''
    const thinkText = state.think?.enabled !== false ? readThinkText(gospelRoot()) : ''
    const key = `${adapter}|${strength}|${thinkText ? sha8(thinkText) : '0'}|${customText ? sha8(customText) : '0'}`
    if (cache && cache.has(key)) return cache.get(key)
    const composed = composeGospel(gospelRoot(), { adapter, strength, customText, thinkText })
    if (cache) cache.set(key, composed)
    return composed
  }

  async function buildState() {
    const presets = await listPresets(ctx)
    const cache = new Map()
    const rows = presets.map((preset) => {
      const saved = state.presets[preset.id]
      const adapter = saved?.adapter || adapterForPreset(preset)
      const strength = resolveStrength(state, adapter)
      const composed = composeFor(adapter, strength, cache)
      return {
        ...preset,
        displayName: displayNameOf(preset),
        adapter,
        strength,
        enabled: !!saved?.enabled,
        chars: composed.chars,
        coreVersion: composed.coreVersion,
      }
    })
    const detection = detectInfra(ctx, presets)
    const duty = biliDutyPath()
    const base = composeFor('none', 'light', cache)
    const root = gospelRoot()
    const filePath = (relative) => (root ? join(root, relative) : '')
    const customTextNow = readCustomText()
    const thinkTextNow = readThinkText(root)
    return {
      ok: true,
      plugin: 'dsh-whale-gospel',
      version: VERSION,
      sectionName: SECTION_NAME,
      sectionOrder: cfg.sectionOrder,
      strength: state.strength,
      presets: rows,
      detection,
      custom: {
        enabled: !!state.custom?.enabled,
        path: CUSTOM_PATH,
        chars: customTextNow.length,
      },
      think: {
        enabled: state.think?.enabled !== false,
        path: root ? join(root, 'think.md') : join(PKG_DIR, 'gospel', 'think.md'),
        chars: thinkTextNow.length,
        exists: Boolean(thinkTextNow),
      },
      bili: {
        enabled: !!state.bili?.enabled,
        dutyPath: duty,
        dutyExists: existsSync(duty),
        injected: existsSync(duty) ? BEGIN_RE.test(readFileSync(duty, 'utf8')) : false,
        backups: listBiliBackups().length,
      },
      gospel: {
        root: root || null,
        coreVersion: base.coreVersion || null,
        coreSha: base.coreSha || null,
        adapters: ['qq-group', 'bili-comment', 'none'],
        chars: { light: composeFor('none', 'light', cache).chars, standard: composeFor('none', 'standard', cache).chars },
        files: [
          { key: 'gospel-dir', label: 'gospel 目录', path: root || '', kind: 'dir' },
          { key: 'core', label: '核心宪章 core.md', path: filePath('core.md'), kind: 'file' },
          { key: 'light', label: '轻量版 light.md', path: filePath('light.md'), kind: 'file' },
          { key: 'think', label: '内省教义 think.md（思考用中文）', path: filePath('think.md'), kind: 'file' },
          { key: 'qq', label: 'QQ 群聊适配 qq-group.md', path: filePath('adapters/qq-group.md'), kind: 'file' },
          { key: 'bili', label: '观影适配 bili-comment.md', path: filePath('adapters/bili-comment.md'), kind: 'file' },
          { key: 'custom', label: '我的补充规则 custom.md', path: CUSTOM_PATH, kind: 'file' },
          { key: 'duty', label: '刷B站章程 duty.md', path: duty, kind: 'file' },
        ].map((file) => ({ ...file, exists: Boolean(file.path) && existsSync(file.path) })),
      },
      stats: state.stats,
      lastInjected: state.lastInjected.slice(0, 6),
      updatedAt: state.updatedAt,
    }
  }

  async function setTarget(targetRaw, enabledRaw) {
    const target = String(targetRaw || '')
    const enabled = Boolean(enabledRaw)
    if (target === 'bili') {
      const composed = composeFor('bili-comment', 'standard')
      const result = applyBiliInjection(enabled, composed)
      if (!result.ok) return { ok: false, error: result.error }
      state.bili = { enabled, at: new Date().toISOString() }
      saveState(state)
      return { ok: true, target, enabled, bili: result }
    }
    const presetId = target.startsWith('preset:') ? target.slice('preset:'.length) : target
    const presets = await listPresets(ctx)
    const preset = presets.find((p) => p.id === presetId)
    if (!preset) return { ok: false, error: `没找到预设：${presetId}` }
    const adapter = state.presets[presetId]?.adapter || adapterForPreset(preset)
    if (enabled) {
      state.presets[presetId] = { enabled: true, adapter, at: new Date().toISOString() }
    } else {
      delete state.presets[presetId]
    }
    saveState(state)
    return { ok: true, target: `preset:${presetId}`, enabled, adapter, note: '新建会话生效' }
  }

  function setStrength(strengthRaw) {
    const strength = ['auto', 'light', 'standard'].includes(String(strengthRaw)) ? String(strengthRaw) : 'auto'
    state.strength = strength
    saveState(state)
    return { ok: true, strength }
  }

  function getCustom() {
    return { ok: true, enabled: !!state.custom?.enabled, path: CUSTOM_PATH, text: readCustomText() }
  }

  function setCustom({ text, enabled } = {}) {
    if (typeof text === 'string') writeCustomText(String(text).slice(0, 8000))
    if (enabled !== undefined) state.custom = { enabled: !!enabled }
    saveState(state)
    return getCustom()
  }

  function getThink() {
    const root = gospelRoot()
    const text = readThinkText(root)
    return {
      ok: true,
      enabled: state.think?.enabled !== false,
      path: root ? join(root, 'think.md') : join(PKG_DIR, 'gospel', 'think.md'),
      chars: text.length,
      text,
    }
  }

  function setThink({ enabled } = {}) {
    if (enabled !== undefined) state.think = { enabled: !!enabled }
    saveState(state)
    return getThink()
  }

  function openTarget(targetRaw) {
    const target = String(targetRaw || '')
    const root = gospelRoot()
    const targets = {
      'gospel-dir': root,
      core: root && join(root, 'core.md'),
      light: root && join(root, 'light.md'),
      qq: root && join(root, 'adapters', 'qq-group.md'),
      bili: root && join(root, 'adapters', 'bili-comment.md'),
      custom: CUSTOM_PATH,
      think: root && join(root, 'think.md'),
      duty: biliDutyPath(),
      stateFile: STATE_PATH,
    }
    const targetPath = targets[target]
    if (!targetPath) return { ok: false, error: '未知 target：' + target }
    return openInShell(targetPath)
  }

  async function preview({ target, adapter, strength }) {
    let resolvedAdapter = adapter
    let resolvedStrength = strength
    if (target) {
      const presets = await listPresets(ctx)
      const presetId = String(target).startsWith('preset:') ? String(target).slice(7) : String(target)
      const preset = presets.find((p) => p.id === presetId)
      if (!preset) return { ok: false, error: `没找到预设：${presetId}` }
      resolvedAdapter = state.presets[presetId]?.adapter || adapterForPreset(preset)
      resolvedStrength = resolveStrength(state, resolvedAdapter)
    }
    resolvedAdapter = resolvedAdapter || 'none'
    resolvedStrength = resolvedStrength || 'standard'
    const composed = composeFor(resolvedAdapter, resolvedStrength)
    return {
      ok: true,
      adapter: resolvedAdapter,
      strength: resolvedStrength,
      chars: composed.chars,
      coreVersion: composed.coreVersion,
      text: composed.text,
    }
  }

  function handle(req, res) {
    return (async () => {
      const url = new URL(req.url || '/', 'http://local')
      const path = url.pathname.replace(/^\/api\/whale-gospel/, '') || '/'
      if (req.method === 'GET' && (path === '/' || path === '')) {
        return sendJson(res, 200, { ok: true, plugin: 'dsh-whale-gospel', version: VERSION })
      }
      if (req.method === 'GET' && path === '/art') {
        if (!existsSync(ART_PATH)) return sendJson(res, 404, { ok: false, error: 'art missing' })
        const bytes = readFileSync(ART_PATH)
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' })
        return res.end(bytes)
      }
      if (req.method === 'GET' && path === '/state') return sendJson(res, 200, await buildState())
      if (req.method === 'GET' && path === '/preview') {
        return sendJson(res, 200, await preview({
          target: url.searchParams.get('target') || undefined,
          adapter: url.searchParams.get('adapter') || undefined,
          strength: url.searchParams.get('strength') || undefined,
        }))
      }
      if (req.method === 'POST' && path === '/toggle') {
        const body = await readJsonBody(req)
        const result = await setTarget(body.target, body.enabled)
        if (!result.ok) return sendJson(res, 400, result)
        return sendJson(res, 200, { ...result, state: await buildState() })
      }
      if (req.method === 'POST' && path === '/strength') {
        const body = await readJsonBody(req)
        const result = setStrength(body.strength)
        return sendJson(res, 200, { ...result, state: await buildState() })
      }
      if (req.method === 'POST' && path === '/cleanup') {
        const body = await readJsonBody(req)
        const result = pruneBiliBackups({ names: body.names, keep: body.keep })
        return sendJson(res, 200, { ok: true, ...result, state: await buildState() })
      }
      if (req.method === 'POST' && path === '/reset') {
        state.stats = { injected: 0 }
        state.lastInjected = []
        saveState(state)
        return sendJson(res, 200, { ok: true, state: await buildState() })
      }
      if (req.method === 'GET' && path === '/custom') {
        return sendJson(res, 200, { ok: true, enabled: !!state.custom?.enabled, path: CUSTOM_PATH, text: readCustomText() })
      }
      if (req.method === 'POST' && path === '/custom') {
        const body = await readJsonBody(req)
        if (typeof body.text === 'string') writeCustomText(String(body.text).slice(0, 8000))
        if (body.enabled !== undefined) state.custom = { enabled: !!body.enabled }
        saveState(state)
        return sendJson(res, 200, {
          ok: true,
          enabled: !!state.custom?.enabled,
          path: CUSTOM_PATH,
          text: readCustomText(),
          state: await buildState(),
        })
      }
      if (req.method === 'GET' && path === '/think') {
        return sendJson(res, 200, getThink())
      }
      if (req.method === 'POST' && path === '/think') {
        const body = await readJsonBody(req)
        const result = setThink({ enabled: body.enabled })
        return sendJson(res, 200, { ...result, state: await buildState() })
      }
      if (req.method === 'POST' && path === '/open') {
        const body = await readJsonBody(req)
        return sendJson(res, 200, openTarget(String(body.target || '').trim()))
      }
      return sendJson(res, 404, { ok: false, error: 'not found: ' + path })
    })().catch((err) => {
      try {
        sendJson(res, 500, { ok: false, error: String(err?.message || err) })
      } catch {
        /* 响应已结束 */
      }
    })
  }

  return { handle, buildState, setTarget, setStrength, preview, getCustom, setCustom, getThink, setThink, openTarget }
}

/* ─────────────────────────── Agent 注入 ─────────────────────────── */

function installAgentInjection(ctx, cfg, state) {
  const registry = () => ctx.get('agentPresets')

  const injectFor = (agent, presetId) => {
    const saved = state.presets[presetId]
    if (!saved?.enabled) return false
    const adapter = saved.adapter || 'qq-group'
    const strength = resolveStrength(state, adapter)
    const composed = composeGospel(resolveGospelRoot({ gospelRoot: cfg.gospelRoot }), {
      adapter,
      strength,
      customText: state.custom?.enabled ? readCustomText() : '',
      thinkText: state.think?.enabled !== false ? readThinkText(resolveGospelRoot({ gospelRoot: cfg.gospelRoot })) : '',
    })
    if (!composed.text) return false
    const prompt = agent?.ctx?.systemPrompt
    if (!prompt || typeof prompt.section !== 'function') return false
    const dispose = prompt.section({ name: SECTION_NAME, order: cfg.sectionOrder, text: composed.text })
    if (agent.ctx.effect) agent.ctx.effect(() => dispose, 'whale-gospel: injected prompt section')
    state.stats.injected = (state.stats.injected || 0) + 1
    state.lastInjected.unshift({
      sessionId: String(agent.id || ''),
      preset: presetId,
      adapter,
      strength,
      chars: composed.chars,
      at: new Date().toISOString(),
    })
    state.lastInjected = state.lastInjected.slice(0, 20)
    saveState(state)
    return true
  }

  const onCreated = (payload) => {
    try {
      const agent = payload?.agent
      if (!agent?.ctx) return
      const presetId = registry()?.composedPreset?.(agent.ctx)
      if (!presetId) return
      injectFor(agent, String(presetId))
    } catch (err) {
      ctx.logger?.warn?.(`[whale-gospel] 注入失败：${err?.message || err}`)
    }
  }

  if (typeof ctx.on === 'function') ctx.on('agent/created', onCreated)
}

/* ─────────────────────────── Tool（一个操作两种调用者） ─────────────────────────── */

function registerTool(ctx, api) {
  const tools = ctx.get('tools')
  if (!tools || typeof tools.register !== 'function') return
  const textOutput = {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [
      { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
    ],
  }
  const dispose = tools.register({
    name: 'whale_gospel',
    description:
      '鲸鱼柔顺剂（去 AI 味人格层）。status=查看当前开关/检测结果；list=列出可注入的 Agent 预设；'
      + 'preview=预览注入块（target=preset:<id> 可选）；toggle=开/关注入（target=preset:<id> 或 "bili"，enabled=true/false）；'
      + 'custom=读/写「我的补充规则」（text=正文，最多 8000 字；enabled=是否启用，正文存在 $DSH_HOME/whale-gospel/custom.md，追加在官方福音之后）；'
      + 'think=读/写「内省教义」开关（thinking 用中文、入戏；enable 默认开）；'
      + 'open=用系统编辑器打开福音文件（target=gospel-dir|core|light|think|qq|bili|custom|duty）。'
      + '注入在「新建会话」时生效，不修改角色卡、不改 preset 文件。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['status', 'list', 'preview', 'toggle', 'custom', 'think', 'open'], description: '要执行的动作' },
        target: { type: 'string', description: 'preset:<预设id> / bili / open 的文件 key' },
        enabled: { type: 'boolean', description: 'toggle 或 custom 时用' },
        text: { type: 'string', description: 'custom 时：补充规则正文（≤8000字）' },
        adapter: { type: 'string', enum: ['qq-group', 'bili-comment', 'none'], description: 'preview 时指定场景层' },
      },
      required: ['action'],
    },
    output: textOutput,
    async execute(args) {
      const action = String(args?.action || 'status')
      if (action === 'status') {
        const s = await api.buildState()
        return {
          ok: true,
          version: s.version,
          strength: s.strength,
          detection: s.detection,
          custom: s.custom,
          bili: s.bili,
          presets: s.presets.map((p) => ({ id: p.id, name: p.displayName || p.name, adapter: p.adapter, enabled: p.enabled, chars: p.chars })),
          stats: s.stats,
          lastInjected: s.lastInjected,
        }
      }
      if (action === 'list') {
        const s = await api.buildState()
        return { ok: true, presets: s.presets.map((p) => ({ id: p.id, name: p.displayName || p.name, enabled: p.enabled, adapter: p.adapter, chars: p.chars })) }
      }
      if (action === 'preview') {
        const r = await api.preview({ target: args?.target, adapter: args?.adapter })
        return r.ok ? { ok: true, adapter: r.adapter, strength: r.strength, chars: r.chars, head: r.text.slice(0, 400) } : r
      }
      if (action === 'toggle') {
        if (args?.enabled === undefined) return { ok: false, error: 'toggle 需要 enabled=true/false' }
        return await api.setTarget(args?.target, args?.enabled)
      }
      if (action === 'custom') {
        const hasText = typeof args?.text === 'string'
        const hasEnabled = args?.enabled !== undefined
        if (!hasText && !hasEnabled) return api.getCustom()
        return api.setCustom({ text: hasText ? args.text : undefined, enabled: hasEnabled ? args.enabled : undefined })
      }
      if (action === 'think') {
        if (args?.enabled === undefined) return api.getThink()
        return api.setThink({ enabled: args.enabled })
      }
      if (action === 'open') return api.openTarget(args?.target)
      return { ok: false, error: '未知 action：' + action }
    },
  })
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'whale-gospel: tool')
}

/* ─────────────────────────── 入口 ─────────────────────────── */

export function apply(ctx, config) {
  const cfg = normalizeConfig(config)
  const state = loadState()
  const api = createApi(ctx, cfg, state)

  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: '/api/whale-gospel',
      handler: (req, res) => api.handle(req, res),
    })
    ctx.effect(() => dispose, 'whale-gospel: api route')
  }

  registerTool(ctx, api)
  installAgentInjection(ctx, cfg, state)

  const root = resolveGospelRoot({ gospelRoot: cfg.gospelRoot })
  ctx.logger?.info?.(
    `[whale-gospel] v${VERSION} 就绪 · gospel=${root || '(未找到)'} · sectionOrder=${cfg.sectionOrder} · 已开启 ${Object.keys(state.presets).filter((k) => state.presets[k]?.enabled).length} 个预设${state.bili?.enabled ? ' + 刷B站' : ''}`,
  )
}

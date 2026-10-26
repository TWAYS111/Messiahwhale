/**
 * lib/index.js — whale-gospel 宿主插件（零第三方依赖，免编译 ESM）。
 *
 * 职责边界（刻意很小）：
 *   ① 读 gospel 资产 → 生成带版本/指纹的注入块（gospel_compose / gospel_status）
 *   ② 内嵌 AI 味 lint 引擎，回答「这句话像人吗」（gospel_lint / gospel_rewrite）
 *   ③ 受管段落写入（gospel_apply，默认 dryRun；用于角色卡/AGENTS.md，不用于 preset）
 *   ④ 刷B站报告体检（gospel_report）
 *
 * 不负责：
 *   - 改 preset 人格正文（那是 preset 插件 preset/index.mjs 的 scoped section 干的）
 *   - 发送前拦截（host 侧 ctx.tools.guard 是全局的；按 agent 收窄需要 preset scope，
 *     见 preset/index.mjs。host 也可以做全局兜底，但会误伤非 QQ 会话，默认不做）
 *
 * 依赖 DSH 真实 API：
 *   ctx.tools.register(ToolDefinition)      —— @deepseek-ai/dsh-tools 的 ToolRuntime.register
 *   ctx.get('systemPrompt').section({...})  —— 可选；injectMode=section 时注册全局提示词段
 * ToolDefinition.parameters / output.schema 必须是 raw JSON Schema 子集（见 dsh-tools 的
 * assertSupportedJsonSchema）；本文件只用 type/properties/required/additionalProperties/items/enum。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  composeGospel,
  renderInjectionBlock,
  resolveGospelRoot,
  dshHome,
  pluginDirOf,
  upsertManagedSection,
  removeManagedSection
} from './gospel.mjs'
import { lintBatch, lintText, ruleCatalog, gateCheck, rewriteSuggestions, topHits, gradeOf } from './lint.mjs'

export const name = 'whale-gospel'
export const inject = ['tools']
export const PLUGIN_VERSION = '0.1.0-skeleton'

const DEFAULTS = {
  enabled: true,
  gospelRoot: '',
  strength: 'standard',
  adapter: 'qq-group',
  injectMode: 'off', // off | section
  sectionOrder: 10250,
  lintThreshold: 36,
  allowWrite: false,
  roleCard: {},
  bili: {}
}

function normalize(config) {
  const out = { ...DEFAULTS }
  const src = config && typeof config === 'object' ? config : {}
  for (const key of Object.keys(DEFAULTS)) {
    const value = src[key]
    if (value === undefined || value === null) continue
    if (key === 'roleCard' || key === 'bili') {
      if (typeof value === 'object' && !Array.isArray(value)) out[key] = { ...value }
    } else if (typeof DEFAULTS[key] === 'number') {
      const n = Number(value)
      if (Number.isFinite(n)) out[key] = n
    } else if (typeof DEFAULTS[key] === 'boolean') {
      if (typeof value === 'boolean') out[key] = value
    } else {
      out[key] = String(value)
    }
  }
  out.roleCard = {
    enabled: false,
    targetPath: '',
    position: 'tail',
    ...(out.roleCard || {})
  }
  out.bili = {
    reportDir: join(dshHome(), 'bili-duty', 'out'),
    ...(out.bili || {})
  }
  return out
}

/** raw JSON Schema 便捷构造：只允许本文件用到的子集。 */
const schema = (properties = {}, required = []) => ({
  type: 'object',
  additionalProperties: false,
  ...(Object.keys(properties).length ? { properties } : {}),
  ...(required.length ? { required } : {})
})
const outputText = {
  schema: schema({ text: { type: 'string' } }, ['text']),
  render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }]
}
const tool = (name, description, parameters, execute) => ({ name, description, parameters, output: outputText, execute })

const str = (description) => ({ type: 'string', description })

export function apply(ctx, config) {
  const cfg = normalize(config)
  if (!cfg.enabled) return
  const pluginDir = pluginDirOf(import.meta.url)
  const stateDir = join(dshHome(), 'whale-gospel')
  try {
    mkdirSync(stateDir, { recursive: true })
  } catch {
    /* 状态目录建不了也不致命 */
  }

  const composeFor = (overrides = {}) =>
    composeGospel({ ...cfg, ...overrides, gospelRoot: overrides.gospelRoot ?? cfg.gospelRoot }, pluginDir)

  const logger = ctx.logger
  const log = (msg) => {
    try {
      logger?.info?.(`[whale-gospel] ${msg}`)
    } catch {
      /* ignore */
    }
  }
  const record = (row) => {
    try {
      appendFileSync(join(stateDir, 'activity.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n', 'utf8')
    } catch {
      /* ignore */
    }
  }

  // ── 可选：把 gospel 段挂成宿主全局提示词段（只建议在 headless profile 用，
  //    web profile 会作用于所有会话，所以默认 injectMode=off）──────────────────
  const sysPrompt = ctx.get?.('systemPrompt') ?? ctx.systemPrompt
  if (cfg.injectMode === 'section' && sysPrompt?.section) {
    const composed = composeFor()
    if (composed.text) {
      const blockText = renderInjectionBlock(composed)
      ctx.effect(
        () =>
          sysPrompt.section({
            name: 'whale-gospel:core',
            order: cfg.sectionOrder,
            text: blockText
          }),
        'whale-gospel: host system prompt section'
      )
      log(`host section on：${composed.meta.strength}/${composed.meta.adapter} chars=${composed.meta.chars}`)
    } else {
      log(`host section 跳过：${(composed.warnings || []).join(' | ')}`)
    }
  }

  const tools = [
    // ① 状态：这一版注入的是什么、阈值多少、闸门拦了几次
    tool(
      'gospel_status',
      '查看 whale-gospel 当前状态：gospel 资产来源/版本/指纹、注入强度、lint 规则数、最近闸门统计。只读。',
      schema(),
      async () => {
        const composed = composeFor()
        let gateStats = { total: 0, deny: 0, warn: 0, last: null }
        try {
          const file = join(stateDir, 'gate-stats.jsonl')
          if (existsSync(file)) {
            const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).slice(-200)
            const rows = lines.map((line) => {
              try {
                return JSON.parse(line)
              } catch {
                return null
              }
            }).filter(Boolean)
            gateStats = {
              total: rows.length,
              deny: rows.filter((r) => r.action === 'deny').length,
              warn: rows.filter((r) => r.action === 'warn').length,
              last: rows[rows.length - 1] ?? null
            }
          }
        } catch {
          /* ignore */
        }
        return {
          text: JSON.stringify(
            {
              pluginVersion: PLUGIN_VERSION,
              strength: composed.meta.strength,
              adapter: composed.meta.adapter,
              gospel: {
                root: composed.meta.root || null,
                source: composed.meta.source,
                coreVersion: composed.meta.coreVersion,
                coreSha: composed.meta.coreSha,
                chars: composed.meta.chars,
                warnings: composed.warnings
              },
              injectMode: cfg.injectMode,
              sectionOrder: cfg.sectionOrder,
              lint: { threshold: cfg.lintThreshold, rules: ruleCatalog().length, catalog: ruleCatalog() },
              writeEnabled: cfg.allowWrite,
              gate: gateStats
            },
            null,
            2
          )
        }
      }
    ),

    // ② 生成注入块：这是「读 gospel.md → 注入块」的成品出口，接任何宿主/桥接都能用
    tool(
      'gospel_compose',
      '读取 gospel 资产并生成可注入的「人格补丁块」（带版本/指纹标记）。可临时覆盖 strength（light/standard/full）与 adapter（qq-group/bili-comment/none）。',
      schema({
        strength: str('light | standard | full，缺省用配置'),
        adapter: str('qq-group | bili-comment | none，缺省用配置')
      }),
      async (args = {}) => {
        const composed = composeFor({
          ...(args.strength ? { strength: String(args.strength) } : {}),
          ...(args.adapter ? { adapter: String(args.adapter) } : {})
        })
        const block = renderInjectionBlock(composed)
        record({ action: 'compose', strength: composed.meta.strength, adapter: composed.meta.adapter, chars: composed.meta.chars })
        return {
          text: JSON.stringify(
            {
              meta: composed.meta,
              warnings: composed.warnings,
              blockChars: block.length,
              block,
              usage: {
                presetSection: "把 block 作为 preset 插件 scoped section 的 text（preset/index.mjs 已实现）",
                roleCard: '或把 block 受管写入角色卡/AGENTS.md（gospel_apply；注意 QQ 角色卡有 maxInjectChars 截断）'
              }
            },
            null,
            2
          )
        }
      }
    ),

    // ③ 体检：单条或批量
    tool(
      'gospel_lint',
      'AI 味体检：对一条或多条将要说出口的话打分（0~100 人机味指数）并列出命中病灶与改写建议。纯规则、无网络、零成本。',
      schema({
        text: str('单条文本'),
        texts: { type: 'array', items: { type: 'string' }, description: '批量文本' },
        maxChars: { type: 'number', description: '单条长度阈值，缺省 60' }
      }),
      async (args = {}) => {
        const opts = { maxChars: Number(args.maxChars) || 60 }
        if (typeof args.text === 'string' && args.text.trim()) {
          const r = lintText(args.text, opts)
          return {
            text: JSON.stringify(
              { score: r.score, grade: r.grade, threshold: cfg.lintThreshold, hits: topHits(r, 5), suggestions: rewriteSuggestions(r) },
              null,
              2
            )
          }
        }
        const batch = lintBatch(Array.isArray(args.texts) ? args.texts : [], opts)
        record({ action: 'lint', score: batch.score, count: batch.count })
        return {
          text: JSON.stringify(
            {
              score: batch.score,
              grade: batch.grade,
              threshold: cfg.lintThreshold,
              count: batch.count,
              items: batch.items.map((item) => ({
                score: item.score,
                grade: item.grade,
                text: item.text.slice(0, 80),
                hits: topHits(item, 3)
              }))
            },
            null,
            2
          )
        }
      }
    ),

    // ④ 改写建议：规则法只给建议，不做自动改写（自动改写必须走桥接层）
    tool(
      'gospel_rewrite',
      '按「八种铁锈」给出这条消息的改写建议（规则法）。它不改写原文；真正的自动改写要在桥接发送前做（见 docs/DSH-PLUGIN.md §5 方案 B2）。',
      schema({ text: str('要改写的原文') }, ['text']),
      async (args = {}) => {
        const r = lintText(String(args.text ?? ''), { maxChars: 60 })
        return {
          text: JSON.stringify(
            {
              score: r.score,
              grade: r.grade,
              hits: topHits(r, 5),
              suggestions: rewriteSuggestions(r),
              gate: gateCheck([String(args.text ?? '')], { threshold: cfg.lintThreshold })
            },
            null,
            2
          )
        }
      }
    ),

    // ⑤ 受管写入：默认 dryRun；allowWrite=false 时强制 dryRun（安全默认）
    tool(
      'gospel_apply',
      '把当前 gospel 注入块以「受管段落」写进目标文件（先备份、幂等替换、回读校验）。默认 dryRun；配置 allowWrite=true 才会真写。remove=true 则移除受管段落（回滚）。',
      schema({
        targetPath: str('目标文件；缺省用 roleCard.targetPath'),
        position: str('tail | head，缺省 tail'),
        dryRun: { type: 'boolean', description: '缺省 true' },
        remove: { type: 'boolean', description: '移除受管段落' }
      }),
      async (args = {}) => {
        const targetPath = String(args.targetPath ?? cfg.roleCard.targetPath ?? '')
        if (!targetPath) throw new Error('gospel_apply：没有 targetPath（传入 targetPath 或配置 roleCard.targetPath）')
        const dryRun = cfg.allowWrite ? args.dryRun !== false : true
        if (args.remove === true) {
          return { text: JSON.stringify(removeManagedSection({ filePath: targetPath, dryRun }), null, 2) }
        }
        const composed = composeFor()
        const block = renderInjectionBlock(composed)
        if (!block) throw new Error('gospel_apply：gospel 资产为空，无法生成注入块')
        const result = upsertManagedSection({
          filePath: targetPath,
          block,
          position: args.position === 'head' ? 'head' : 'tail',
          dryRun
        })
        record({ action: 'apply', targetPath, dryRun, ok: result.ok })
        return {
          text: JSON.stringify(
            { ...result, meta: composed.meta, hint: dryRun && cfg.allowWrite ? 'dryRun 预览；确认后传 dryRun:false' : undefined },
            null,
            2
          )
        }
      }
    ),

    // ⑥ 刷 B 站报告体检：报告格式是宿主 duty.md 约定的（### BV 分块），这里按块体检
    tool(
      'gospel_report',
      '读今天的 B 站日报（默认 $DSH_HOME/bili-duty/out/<YYYY-MM-DD>.md），按 ### BV 分块逐条打分，输出「整份日报的 AI 味指数 + 最像摘要机器的段落」。',
      schema({
        reportPath: str('报告路径；缺省用今天那份'),
        text: str('也可以直接传一段报告正文做体检')
      }),
      async (args = {}) => {
        const today = new Date()
        const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const reportPath = String(args.reportPath ?? join(cfg.bili.reportDir, `${day}.md`))
        const text = typeof args.text === 'string' && args.text.trim() ? args.text : existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : ''
        if (!text.trim()) throw new Error(`gospel_report：报告为空或不存在：${reportPath}`)
        const blocks = text.split(/\n(?=###\s*BV)/).map((b) => b.trim()).filter(Boolean)
        const batch = lintBatch(blocks.length ? blocks : [text], { maxChars: 400 })
        record({ action: 'report', reportPath, score: batch.score, count: batch.count })
        return {
          text: JSON.stringify(
            {
              reportPath: existsSync(reportPath) ? reportPath : null,
              blocks: batch.count,
              overall: { score: batch.score, grade: batch.grade },
              worst: batch.items
                .map((item, i) => ({ index: i + 1, score: item.score, grade: item.grade, head: item.text.split('\n', 1)[0].slice(0, 40), hits: topHits(item, 3) }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
            },
            null,
            2
          )
        }
      }
    )
  ]

  if (!ctx.tools?.register) {
    log('ctx.tools 不可用，工具未注册（插件应在 tools 服务之后装载）')
    return
  }
  let registered = 0
  for (const definition of tools) {
    try {
      ctx.tools.register(definition)
      registered += 1
    } catch (error) {
      log(`注册工具失败 ${definition.name}：${error?.message ?? error}`)
    }
  }
  log(`已注册 ${registered}/${tools.length} 个工具；gospel 根：${resolveGospelRoot(cfg, pluginDir).root ?? '(未找到)'}`)
}

/** 供测试直接引用（不经 DSH 运行时）。 */
export const _internals = { normalize, composeGospel, lintText, lintBatch }

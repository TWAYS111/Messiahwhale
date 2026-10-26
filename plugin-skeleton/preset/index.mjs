/**
 * preset/index.mjs — 「人格补丁层」插件（挂在 QQ preset 的 plugins 列表里）。
 *
 * 这是本方案的核心：**不覆盖 preset 的 persona.prefix**，而是作为一条同级 entry 追加
 * 一个 scoped 系统提示词 section（排在 DEPLOYMENT_PERSONA_SUFFIX=10200 之后），
 * 并在同一 scope 注册发送前 `ctx.tools.guard`（QQ 的「出门前质检闸门」）。
 *
 * preset 里只加一行（示例）：
 *   - id: gospel-section
 *     name: '@dsh-external/dsh-whale-gospel/preset'
 *     config:
 *       strength: standard
 *       adapter: qq-group
 *       gateMode: block
 *
 * 零第三方依赖：不导出 Config（避免把 schemastery 依赖塞进最小骨架），
 * 配置在 apply 里做防御式归一（字段见 config.example.json）。
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { composeGospel, renderInjectionBlock, dshHome, pluginDirOf } from '../lib/gospel.mjs'
import { gateCheck } from '../lib/lint.mjs'

export const name = 'whale-gospel-preset'
export const inject = ['systemPrompt', 'tools']

const DEFAULTS = {
  enabled: true,
  gospelRoot: '',
  strength: 'standard',
  adapter: 'qq-group',
  sectionOrder: 10250,
  gateMode: 'block', // off | warn | block
  gateThreshold: 36,
  gateMaxDenyPerMinute: 3,
  gateTools: [
    'mcp__snowluma__qq_send_message',
    'mcp__snowluma__qq_send_burst',
    'mcp__snowluma__qq_reply',
    'mcp__snowluma__qq_send_group_message',
    'mcp__snowluma__qq_send_private_message'
  ],
  statsFile: ''
}

function normalize(config) {
  const out = { ...DEFAULTS }
  const src = config && typeof config === 'object' ? config : {}
  for (const key of Object.keys(DEFAULTS)) {
    const value = src[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(DEFAULTS[key])) {
      if (Array.isArray(value)) out[key] = value.filter((v) => typeof v === 'string')
    } else if (typeof DEFAULTS[key] === 'number') {
      const n = Number(value)
      if (Number.isFinite(n)) out[key] = n
    } else if (typeof DEFAULTS[key] === 'boolean') {
      if (typeof value === 'boolean') out[key] = value
    } else {
      out[key] = String(value)
    }
  }
  return out
}

/** 从工具参数里抽出「将要发给群里的文字」；不认识的结构返回 []。 */
export function extractOutboundText(args) {
  const out = []
  const visit = (value, depth = 0) => {
    if (depth > 4 || value === null || value === undefined) return
    if (typeof value === 'string') {
      out.push(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (typeof value === 'object') {
      for (const key of ['messages', 'message', 'text', 'content']) {
        if (key in value) visit(value[key], depth + 1)
      }
      // 消息数组元素常见形态 {text} / {content}
    }
  }
  visit(args)
  return out.map((s) => s.trim()).filter(Boolean)
}

export function apply(ctx, config) {
  const cfg = normalize(config)
  if (!cfg.enabled) return
  const pluginDir = pluginDirOf(import.meta.url)
  const statsFile = cfg.statsFile || join(dshHome(), 'whale-gospel', 'gate-stats.jsonl')

  const composed = composeGospel({ ...cfg, gospelRoot: cfg.gospelRoot }, pluginDir)
  if (!composed.text) {
    ctx.logger?.warn?.(
      `[whale-gospel] gospel 资产未找到，提示词补丁层不注入；尝试过：${(composed.warnings || []).join(' | ')}`
    )
  } else if (ctx.systemPrompt?.section) {
    const blockText = renderInjectionBlock(composed)
    ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: 'whale-gospel:core',
          order: cfg.sectionOrder,
          text: blockText
        }),
      'whale-gospel: preset system prompt section'
    )
    ctx.logger?.info?.(
      `[whale-gospel] 注入 ${cfg.strength}/${composed.meta.adapter} core=${composed.meta.coreVersion} sha=${composed.meta.coreSha} chars=${composed.meta.chars}`
    )
  }

  const stats = (record) => {
    try {
      mkdirSync(dirname(statsFile), { recursive: true })
      appendFileSync(statsFile, JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n', 'utf8')
    } catch {
      /* 统计写不进去不影响发送 */
    }
  }

  if (cfg.gateMode !== 'off' && ctx.tools?.guard) {
    const denyWindow = []
    const sendTools = new Set(cfg.gateTools)
    ctx.tools.guard((exec) => {
      const toolName = exec?.name
      if (typeof toolName !== 'string' || !sendTools.has(toolName)) return undefined
      const messages = extractOutboundText(exec?.arguments)
      if (!messages.length) return undefined
      const check = gateCheck(messages, { threshold: cfg.gateThreshold })
      if (check.go) return undefined
      // 安全阀：同一分钟拦截次数超过上限就放行（避免模型陷进改写死循环，把一轮 token 烧光）。
      const now = Date.now()
      while (denyWindow.length && now - denyWindow[0] > 60_000) denyWindow.shift()
      if (denyWindow.length >= cfg.gateMaxDenyPerMinute) {
        stats({ tool: toolName, action: 'allow-over-limit', score: check.score, grade: check.grade, messages })
        return undefined
      }
      if (cfg.gateMode === 'warn') {
        stats({ tool: toolName, action: 'warn', score: check.score, grade: check.grade, messages })
        return undefined
      }
      denyWindow.push(now)
      stats({ tool: toolName, action: 'deny', score: check.score, grade: check.grade, messages, reason: check.reason })
      return check.reason
    })
    ctx.logger?.info?.(`[whale-gospel] 发送闸门已开：mode=${cfg.gateMode} threshold=${cfg.gateThreshold}`)
  }
}

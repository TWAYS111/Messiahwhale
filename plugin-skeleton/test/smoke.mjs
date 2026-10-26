/**
 * test/smoke.mjs — 零依赖自测（node test/smoke.mjs）。
 * 验证骨架里「读 gospel → 注入块」「lint 打分」「发送闸门」「受管写入」四件事真的能跑。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { composeGospel, renderInjectionBlock, extractManagedSection, upsertManagedSection, removeManagedSection } from '../lib/gospel.mjs'
import { lintText, lintBatch, gateCheck, gradeOf, topHits, rewriteSuggestions, ruleCatalog } from '../lib/lint.mjs'
import { extractOutboundText } from '../preset/index.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', 'fixtures', 'gospel')
const results = []
const check = (label, fn) => {
  try {
    fn()
    results.push(`PASS  ${label}`)
  } catch (error) {
    results.push(`FAIL  ${label}  →  ${error?.message ?? error}`)
    process.exitCode = 1
  }
}

// ── 1. 资产组装 ────────────────────────────────────────────────────────────
const composed = composeGospel({ gospelRoot: root, strength: 'standard', adapter: 'qq-group' })
check('compose: 找到 gospel 资产', () => assert.equal(composed.meta.root, root))
check('compose: version 从 frontmatter 取到', () => assert.equal(composed.meta.coreVersion, '0.9.0-sample'))
check('compose: standard 含 core + adapter', () => {
  assert.ok(composed.text.includes('八条禁忌'))
  assert.ok(composed.text.includes('分条协议'))
})
check('compose: 指纹非空', () => assert.match(composed.meta.coreSha, /^[0-9a-f]{8}$/))
const block = renderInjectionBlock(composed)
check('compose: 注入块带 begin/end 标记', () => {
  assert.ok(block.startsWith('<!-- whale-gospel:begin'))
  assert.ok(block.endsWith('<!-- whale-gospel:end -->'))
})
const light = composeGospel({ gospelRoot: root, strength: 'light', adapter: 'qq-group' })
check('compose: light 档更短且不含 adapter', () => {
  assert.ok(light.meta.chars < composed.meta.chars)
  assert.equal(light.meta.adapter, 'none')
})
check('gospel 目录不存在时给出 warnings 而不是抛错', () => {
  const missing = composeGospel({ gospelRoot: join(root, 'nope') })
  assert.equal(missing.text, '')
  assert.ok(missing.warnings.length > 0)
})

// ── 2. lint 打分 ──────────────────────────────────────────────────────────
const bad = [
  '行，那我来说说。这不是炫耀，而是分享。希望这能帮到你~大家觉得呢？',
  '好的，我明白你的意思了。首先我们要冷静，其次要理性，最后才能解决问题。',
  '图中这只猫抱着枕头睡得挺香，我以后也会注意少用这种句式。',
  '早点睡吧别熬夜，多喝热水，要好好照顾自己。绝对超好用，强烈推荐！'
]
const good = ['草', '骂他', '？', '今天周五，先吃点好的', '这猫替我加了一天班是吧...', '我不到啊，你自己搜']
const badScores = bad.map((t) => lintText(t).score)
const goodScores = good.map((t) => lintText(t).score)
const badAvg = Math.round(badScores.reduce((a, b) => a + b, 0) / badScores.length)
const goodAvg = Math.round(goodScores.reduce((a, b) => a + b, 0) / goodScores.length)
check('lint: 坏样本平均分 > 好样本平均分 + 20', () => assert.ok(badAvg > goodAvg + 20, `badAvg=${badAvg} goodAvg=${goodAvg}`))
check('lint: 好样本平均分 ≤ 15', () => assert.ok(goodAvg <= 15, `goodAvg=${goodAvg}`))
check('lint: 分档函数边界', () => {
  assert.equal(gradeOf(0), '像人')
  assert.equal(gradeOf(15), '像人')
  assert.equal(gradeOf(36), '明显')
  assert.equal(gradeOf(61), '人机味浓')
})
check('lint: topHits 能排出病灶', () => {
  const top = topHits(lintText(bad[0]), 3)
  assert.ok(top.length > 0)
  assert.ok(top[0].count >= 1)
})
check('lint: 规则目录非空', () => assert.ok(ruleCatalog().length >= 10))

// ── 3. 发送闸门 ───────────────────────────────────────────────────────────
check('gate: 坏消息被拦', () => {
  const gate = gateCheck([bad[0]], { threshold: 36 })
  assert.equal(gate.go, false)
  assert.ok(gate.reason.includes('拦截'))
})
check('gate: 好消息放行', () => {
  const gate = gateCheck(['骂他', '？'], { threshold: 36 })
  assert.equal(gate.go, true)
})
check('gate: 从 qq_send_message 参数里抽出待发文字', () => {
  const texts = extractOutboundText({ key: 'group:1', token: 'x', messages: ['在的', '叫我干嘛'], replyToMessageId: null })
  assert.deepEqual(texts, ['在的', '叫我干嘛'])
})

// ── 4. 受管写入 / 回滚 ────────────────────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'whale-gospel-'))
const card = join(tmp, 'role.md')
writeFileSync(card, '# 角色卡\n\n原本的人设正文。\n', 'utf8')
check('apply dryRun: 不落盘', () => {
  const r = upsertManagedSection({ filePath: card, block, dryRun: true })
  assert.equal(r.ok, true)
  assert.equal(r.changed, true)
  assert.equal(readFileSync(card, 'utf8'), '# 角色卡\n\n原本的人设正文。\n')
})
check('apply: 真写后能抽出受管段落，且原文保留', () => {
  const r = upsertManagedSection({ filePath: card, block, dryRun: false })
  assert.equal(r.ok, true)
  assert.ok(r.backup)
  const after = readFileSync(card, 'utf8')
  assert.ok(after.includes('原本的人设正文'))
  assert.ok(extractManagedSection(after).includes('八条禁忌'))
})
check('apply: 幂等（第二次写入不追加重复段落）', () => {
  upsertManagedSection({ filePath: card, block, dryRun: false })
  const after = readFileSync(card, 'utf8')
  assert.equal((after.match(/whale-gospel:begin/g) ?? []).length, 1)
})
check('remove: 回滚后受管段落消失', () => {
  const r = removeManagedSection({ filePath: card, dryRun: false })
  assert.equal(r.ok, true)
  assert.equal(extractManagedSection(readFileSync(card, 'utf8')), '')
})
rmSync(tmp, { recursive: true, force: true })

// ── 汇总 ──────────────────────────────────────────────────────────────────
const batch = lintBatch(bad)
console.log(results.join('\n'))
console.log('')
console.log('—— 实测分数 ——')
console.log(`bad   平均 ${badAvg} 分 / ${badAvg > 60 ? '人机味浓' : gradeOf(badAvg)}  逐条：${badScores.join(', ')}`)
console.log(`good  平均 ${goodAvg} 分 / ${gradeOf(goodAvg)}  逐条：${goodScores.join(', ')}`)
console.log(`差距  ${badAvg - goodAvg} 分（验收线 ≥ 20）`)
console.log(`bad 批量 [${bad.length} 条] → ${batch.score} 分 / ${batch.grade}`)
console.log(`坏样本 top 病灶：${topHits(lintText(bad[0]), 3).map((h) => `${h.name}×${h.count}`).join('、')}`)
console.log(`改写建议示例：${rewriteSuggestions(lintText(bad[0])).slice(0, 3).join(' / ')}`)
console.log('')
console.log(results.some((r) => r.startsWith('FAIL')) ? '❌ 有失败项' : '✅ 全部通过')

# 鲸鱼柔顺剂 · dsh-whale-gospel v0.2.0

> 在「设置」里多一页：**检测你装了什么，勾选哪些 Agent 预设要注入「去 AI 味」人格提示词。**
> 不改你的角色卡、不改 preset 文件；只给勾选的预设新建的会话挂一个系统提示词 section。

## 它解决什么

- 有的机器只有 QQ 机器人 → 只勾 QQ 预设；
- 有的机器只有刷B站 → 只开观影教义；
- 有的机器两个都没有，只想给「创造模式」这类自用预设加一点人味 → 直接勾预设即可；
- 自己魔改的 preset 也会出现在列表里（来自 `agentPresets.list()`，不写死）。

## 设置页长什么样

「设置 → 鲸鱼柔顺剂」：

- 头像 + 标题 `鲸鱼柔顺剂 v0.1` + 已开启数量
- 检测徽章：`QQ 机器人 已检测 / 未检测`、`刷B站 已检测 / 未检测`
- 强度档位：`自动 / 轻量 / 标准`（自动 = QQ 群用标准，其它预设用轻量）
- 预设列表第一行「**思考也入戏**」：让 thinking 用中文、第一人称，像心里话而不是分析报告（正文在 `gospel/think.md`，默认开）
- 预设列表：每个预设一行，右侧开关；标注「QQ群语气包 / 通用人格层」与注入字符数
- 刷B站一行（检测到才出现）：把观影教义写进 `$DSH_HOME/bili-duty/duty.md`（写前备份）
- **自定义补充规则**：一个文本框（存在 `$DSH_HOME/whale-gospel/custom.md`），写你自己的称呼/口头禅/禁区；保存后**追加**在官方福音之后，不替代原文。开关关掉或正文留空就不生效
- **福音源文件**：core / light / think / QQ 适配 / B站适配 / custom.md / duty.md 逐行列出路径，点「打开」用系统编辑器直接改（不用去翻插件目录）
- 「注入块预览」：不落盘、不生效，只确认语气（包含你的自定义规则）
- 页脚：福音版本 / sha / 已注入会话数 / 最近注入记录

## 原理（为什么不会弄坏你的 preset）

1. 监听 `agent/created`，用 `agentPresets.composedPreset(agent.ctx)` 读出这个 Agent 用的预设 id；
2. 该预设被勾选时，在 **这个 agent 自己的 scope** 里注册
   `systemPrompt.section({ name: 'whale-gospel:core', order: 10250, text })`；
3. `10250 > DEPLOYMENT_PERSONA_SUFFIX(10200)` ⇒ 排在 persona 之后，且只作用于这个 Agent；
4. 角色卡、`persona.prefix`、preset 文件全部不动；取消勾选后新会话恢复原样。

刷B站：写 `duty.md` 时用 `<!-- whale-gospel:begin ... -->` / `<!-- whale-gospel:end -->` 包住自己那段，
每次写前备份 `duty.md.whale-bak-<时间戳>`；关闭只删自己那段。headless 每轮重新读章程 ⇒ 下一轮生效。

**思考通道（v0.2.0）**：注入块顺序是 `core → adapter → think.md → 自定义规则`，scoped section 默认顺序提高到 `20000`，位于官方 `DEPLOYMENT_PERSONA_SUFFIX(10200)` 之后。think 层采用明确的内省协议：先认当前身份和关系，再理解来意，比较快速/细致/折中三种方向，默认选折中方案，最后以人设复核。reasoning 必须以中文为主，英文只保留工具名、代码和必要专名；拟声词自然使用，不机械复读。指纹里带 `think=<sha>` 可追溯。
插件不使用 `complete` 覆盖整套系统提示词，仍保留更高层安全、事实、工具与团队约束。旧版 A/B 实测同一句「讲个治愈童话」：基线中文占比 **19%**，v0.1.2 think 层后 **69%~74%**；强化版需以新会话重新测试。

## Host API

- `GET  /api/whale-gospel/state` — 检测结果 / 预设列表 / 开关状态 / 福音信息 / 源文件清单
- `GET  /api/whale-gospel/preview?target=preset:<id>` — 预览注入块（含自定义规则）
- `GET  /api/whale-gospel/art` — 设置页头像
- `GET  /api/whale-gospel/custom` · `POST /api/whale-gospel/custom` `{ text?, enabled? }` — 读/写自定义补充规则（≤8000 字）
- `GET  /api/whale-gospel/think` · `POST /api/whale-gospel/think` `{ enabled? }` — 读/开关「内省教义」（正文只读，在 gospel/think.md）
- `POST /api/whale-gospel/open` `{ target: 'gospel-dir'|'core'|'light'|'think'|'qq'|'bili'|'custom'|'duty' }` — 用系统编辑器打开对应 md
- `POST /api/whale-gospel/toggle` `{ target: 'preset:<id>' | 'bili', enabled: boolean }`
- `POST /api/whale-gospel/strength` `{ strength: 'auto' | 'light' | 'standard' }`
- `POST /api/whale-gospel/cleanup` `{ names?: string[], keep?: number }` — 清理 duty.md 备份（默认留最近 5 份）
- `POST /api/whale-gospel/reset` — 清空注入记录与统计（开关不动）

Agent 工具 `whale_gospel`：`status / list / preview / toggle / custom / think / open`（与 UI 走同一套方法；`custom` 可以直接让 Agent 读写补充规则）。

## 目录

```
dsh-whale-gospel/
├─ package.json        # dsh.bundle.patch + dsh.client
├─ cordis.patch.yml    # host 行：id=whale-gospel
├─ lib/index.js        # host：路由 / 工具 / agent/created 注入器 / duty.md 写入
├─ lib/client.js       # 设置页（React，仅用 --dsw-alias-* token）
├─ gospel/             # ⚠️ 福音资产快照（core + adapters + light + think），可换自己的
├─ assets/whale.jpg    # 设置页头像
├─ locale/{zh,en}.json # 插件列表里的标题/描述
└─ icon.svg
```

## 状态文件

- `$DSH_HOME/whale-gospel/v0.1-state.json`：开关、强度、注入记录、统计。删掉即恢复默认（全关）。
- `$DSH_HOME/whale-gospel/custom.md`：你的「自定义补充规则」正文（设置页文本框读写的就是它，也可以直接用任何编辑器改）。

想长期改官方原文：把 `gospel/` 整个复制到 `$DSH_HOME/whale-gospel/gospel/`，插件会优先读那里（高于插件内置副本）。

## 已知边界（v0.1）

- 只对**新建会话**生效（已有会话不热插拔，避免中途改系统提示词）。
- 刷B站开关只改家目录 `duty.md`；如果 headless 链路本身跑不通（例如 `NO_ADAPTER`），注入不会让它变通。
- 未提供独立 UI 面板页（只有设置页这一页）。
- 设置页的「视觉」在本机无法截图验证（沙箱里起不了浏览器）；已核对的替代证据见下。

## 验证记录（2026-10-26 本机实测）

| 项 | 结果 |
|---|---|
| 注入 host ✓ / client ✓ | `dev_inject_plugin` 返回双 ✓；`dev_reload_package` 热重载前后均 `[active]` |
| 设置页注册 | `Slots.listSubTree(settings.section)` occupants 含 `id=whale-gospel, order=31, active=true` |
| 端到端注入 | 勾选 4 个预设后新建一个真实 Agent（preset=`cordis`）→ `stats.injected=1`，`lastInjected` 记录 `cordis/light/3258 字符` |
| 检测 | QQ：35 个 `mcp__snowluma__qq_*` 工具 + 2 个 QQ 预设；刷B站：11 个 `bili_*` 工具 + `duty.md` 存在 |
| 刷B站写入/回滚 | `duty.md` 16599 B → 39084 B（含 begin/end 标记），关闭后 **SHA256 完全还原**（743574E1…），测试备份已清理 |
| 预热工具 | `whale_gospel` 工具在注入后立刻出现在 Agent 工具面（schema 已刷新） |
| 自定义补充规则 | 保存测试文本后 `/state.custom.enabled=true`；`/preview` 里出现「我的补充规则」与测试标记；指纹 `custom=` 随之变化；恢复代码后关闭，`custom.md` 保留模板 |
| 打开源文件 | `POST /open {target:'custom'}` 实测返回 `openedWith: notepad.exe`（真的弹了编辑器） |
| 内省教义注入 | `/preview` 出现「内省教义」「绝对禁止」；指纹带 `think=99e67cf7`；think 层 974→~1100 字符 |
| thinking 语言（A/B） | 基线（只有 core）：用户实盘会话 reasoning 5091 字符，中文占比 **0.19**；加 think 层后 3 次独立验证 **0.685 / 0.723 / 0.739**，且出现「唔，那就写一个软软的小故事吧」这种入戏开头 |
| 残留 | reasoning 第一句仍可能复述「用户要…」；工具名/专有名词仍英文。reasoning 通道对指令的服从度低于正文，属模型侧限制 |
| 未验证 | 设置页的真实渲染外观（无浏览器截图能力）；QQ/刷B站真实链路的行为改变（需真跑一轮） |

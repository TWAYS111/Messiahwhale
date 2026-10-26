# plugin-skeleton · whale-gospel DSH 插件最小骨架

> 这是 [`docs/DSH-PLUGIN.md`](../docs/DSH-PLUGIN.md) 的可运行最小实现：**零第三方依赖、免编译的 ESM 插件**。
> 它证明的核心只有一件事：**读 gospel 资产 → 生成带版本/指纹的注入块 → 一个 scoped 系统提示词段 + 一个发送前闸门**，
> 而且完全不碰用户 preset 的 `persona.prefix`。

## 目录

```
plugin-skeleton/
├── package.json            # 包名 @dsh-external/dsh-whale-gospel；dsh.bundle.patch → cordis.patch.yml
├── cordis.patch.yml        # 宿主插件挂载示例（injectMode: off，安全默认）
├── config.example.json     # 全部配置字段（host 与 preset 共用键名）
├── lib/
│   ├── gospel.mjs          # 读 core.md + adapter → 组装注入块；受管写入/回滚
│   ├── lint.mjs            # 内嵌 AI 味体检（11 条规则 + 打分 + 闸门判定）
│   └── index.js            # 宿主插件：gospel_status/compose/lint/rewrite/apply/report
├── preset/index.mjs        # ★ QQ「人格补丁层」：scoped systemPrompt.section + ctx.tools.guard
├── fixtures/gospel/        # 自测用的 gospel 样例（standing in for 仓库 gospel/ 真资产）
└── test/smoke.mjs          # 零依赖自测：组装 / 打分 / 闸门 / 受管写入
```

## 跑一下

```bash
cd plugin-skeleton
node test/smoke.mjs
```

实测（2026-10-26）：19 项断言全部 PASS；`bad 平均 45 分（明显） vs good 平均 6 分（像人），差距 39 分`。

## 两种接法

### 1) QQ 人设补丁层（推荐，不覆盖 preset）

在 QQ preset 的 `plugins:` 数组里**加一行**（preset 的 `persona.prefix` 一个字不改）：

```yaml
- id: gospel-section
  name: '@dsh-external/dsh-whale-gospel/preset'
  config:
    strength: standard
    adapter: qq-group
    gateMode: block          # off | warn | block
    gateThreshold: 36
```

生效原理（已在真实 DSH 上按 schema 核对，见 docs/DSH-PLUGIN.md §3）：
- `@deepseek-ai/dsh-persona` 用的是 `dsh-system-prompt` 的 `DEPLOYMENT_PERSONA_PREFIX(0)` / `DEPLOYMENT_PERSONA_SUFFIX(10200)`；
- 本插件注册 `order: 10250` 的 scoped section ⇒ 排在 persona 之后，只在挂了这一行的 agent scope 内生效；
- preset 升级（persona 正文更新）不会删掉这条同胞 entry，福音不丢。

### 2) 刷 B 站（headless）注入

headless 是**另一个进程**（`dsh --profile headless`），所以在 `~/.dsh/profiles/headless/cordis.patch.yml` 挂本插件：

```yaml
- insert:
    - id: whale-gospel
      name: '@dsh-external/dsh-whale-gospel'
      config:
        injectMode: section      # 只在 headless profile 用；web profile 别开
        strength: standard
        adapter: bili-comment
        gospelRoot: 'D:/鲸鱼/whale-gospel/gospel'
```

宿主插件在此进程注册全局 section ⇒ 只影响这一轮 B 站会话（详见 docs/DSH-PLUGIN.md §4.3）。

## 验证状态（诚实记录）

| 项 | 状态 |
|---|---|
| `node --check` 4 个入口文件 | ✅ 已跑（无输出即通过） |
| `node test/smoke.mjs` 全部断言 | ✅ 已跑：19 项 PASS，bad 45 / good 6（差 39） |
| `dev_build_plugin` 编译 | ❌ 未验证。原因：本机 **没有 bash**（`bash` 不在 PATH），且 DSH 是 npm 安装（非源码 checkout，无 `packages/` 与 tsc）。骨架因此**刻意设计成免编译纯 ESM**：没有 `src/`、没有 `tsc`、没有打包步骤；一落地就是可被 loader 直接 `import()` 的 `lib/*.js`。 |
| 运行时 `ctx.tools.register` 实际装配 | ⚠️ 未在运行中验证。API 形状抄自官方实现 `dsh-tool-todo`（tools.register + raw JSON Schema）；装进 profile 后需看 `dev_plugin_status` 与一次真实会话确认。 |
| 运行时 `ctx.systemPrompt.section` | ⚠️ 未在运行中验证。形状抄自官方 `dsh-persona`（`ctx.effect(() => ctx.systemPrompt.section({name, order, text}))`）。 |
| 运行时 `ctx.tools.guard` 拦截效果 | ⚠️ 逻辑已单测（gateCheck），运行时未验证。guard 用法与在用的 `qq-tool-restrict.mjs` 一致。 |

## 与完整实现的距离（哪些是二期）

- **MVP（一周内）**：`gospel_compose` + `gospel_lint` + preset section + `gospel_apply(dryRun)` —— 本骨架已包含。
- **二期**：自动改写闸门（改 `qq-bridge/src/mcp-snowluma-safe.js` + `bridge.js` 的 `/api/socialV2/send-message`，见文档 §5 B2）、UI 面板、gospel 版本热更新。

## 配置字段

见 `config.example.json`。最小字段：`gospelRoot` / `strength` / `adapter` / `injectMode` / `gateMode` / `gateThreshold` / `allowWrite`。

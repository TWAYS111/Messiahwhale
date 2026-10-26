# whale-gospel × DSH 插件接入方案（考证 + 设计 + 骨架）

> 目标读者：接手实现的工程师。读完应当能直接动手，不需要再问「改哪个文件」。
> 考证时间：2026-10-26。所有路径/行号都在这台机器上**实际打开核对过**；无法验证的地方会明说「未验证」。
> 配套骨架：`plugin-skeleton/`（零依赖免编译 ESM，`node test/smoke.mjs` 已跑通 19 项断言）。

---

## 0. 结论先行（TL;DR）

**一句话：QQ 的人格注入点不在你原来以为的 `~/.dsh/.agent-presets/qq-chat-v2/agent.cordis.yml`（那份已经被 DSH 废弃、没人读了），真正生效的是三处——① `qq-agent-presets` bundle 补丁里的 preset 声明（行为层）、② 桥接每轮投递的 `roles/<角色>.md`（人设层，reserved2 下经 `qq_get_prompt` 工具返回）、③ 发送只经过桥接 HTTP 收口（唯一能改写的地方）。**

| 链路 | 最靠谱的注入点（结论） | 真实文件 / 行号 | 稳定性 |
|---|---|---|---|
| **QQ · 人格层** | **preset 声明里加一条 scoped 插件 entry**，它在 `dsh-system-prompt` 的 `DEPLOYMENT_PERSONA_SUFFIX(10200)` **之后**注册一个 section（`order: 10250`）。preset 的 `persona.prefix` 一个字不改。 | 声明文件：`C:\Users\Lenovo\.dsh\plugins\qq-agent-presets\presets\qq-chat-v2.patch.yml`（`- insert:` 行 6；`- id: preset-qq-chat-v2` 行 7；`plugins:` 行 14；`persona` 的 `prefix: |-` 行 18、正文行 19）。DSH 侧顺序常量：`...\node_modules\@deepseek-ai\dsh-system-prompt\lib\index.js:10-43`；persona 行注册方式：`...\dsh-persona\lib\index.js:35-48`。 | ★★★ 最稳（与 persona 正文解耦，preset 升级不丢） |
| **QQ · 人设细节（角色卡）** | **不改角色卡文件**：reserved2 下人设经 `qq_get_prompt` 工具结果返回，桥接在 `/api/socialV2/prompt` 的 `role.hint` 里塞 `currentRoleHintV2()`；且角色卡**有 20000 字符截断**（`config.json` 的 `role.maxInjectChars: 20000`，当前 `roles/弥赛鲸.md` = 30985 bytes ⇒ 尾部必被切）。 | 路由 `D:\鲸鱼\qq-bridge\src\bridge.js:4691-4786`；`role.hint` 行 **4751**；`currentRoleHintV2()` 定义 9601-9629；`roleHintForMode` 截断 9505-9509；`roleRawContent` 9473-9502。 | ★★☆ 热更新，但**被截断**；要装福音必须改桥接或在系统提示词层 |
| **QQ · 发送前闸门** | **DSH 原生没有「发送前改写 + 放行」的 hook**。`tools/pre-execute` 只能 allow/deny/cancel/ask（`PreToolDecision` 无 args 改写字段）；`tools/execute` 明文规定只能改 `exec.signal`，`arguments` 不可变；`tools/post-execute` 是**发完之后**才跑。**最接近的是 `ctx.tools.guard`（只能 deny + 理由）**；真正的「自动改写」必须落在桥接 HTTP 收口：MCP 工具 `qq_send_message` → `POST /api/socialV2/send-message` 的 handler。 | deny-only：`preset` 插件 `ctx.tools.guard`（对照组 `qq-tool-restrict.mjs:62-68`）；改写点：`D:\鲸鱼\qq-bridge\src\mcp-snowluma-safe.js:743-773`（MCP handler）+ `bridge.js:5243-5327`（校验循环 5318-5327 之后、真正发 QQ 之前）。 | ★★☆ deny 稳、成本低；改写要改桥接 |
| **刷 B 站 · 提示词/报告层** | **`C:\Users\Lenovo\.dsh\bili-duty\duty.md`（家目录那份）才是真在用的章程**，插件里的 `prompts/duty.md` 只是出厂副本；`ensureCharter()` 用 `charter.sha256` 记账：家目录那份被用户改过 ⇒ 以后升级**永不覆盖**它。报告格式由 **duty.md 的「一轮要做的事 4」+ 宿主硬约束**共同决定，宿主还按 `### BV号` / `**档位**` 解析回 UI，不能乱改。 | 章程加载：`...\dsh-bili-scroll\lib\state.mjs:111-115`（`charterPath`）、`:128-160`（`ensureCharter` 记账）；喂入方式：`index.js:955-1084`（`promptFor`，961-963 读章程并替换 `<家目录>`；1031-1037 硬编码报告路径/`### BV号`；1076-1082 评论规则）；报告解析 `index.js:190-214`；家目录报告路径 `$DSH_HOME/bili-duty/out/<YYYY-MM-DD>.md`。 | ★★★ 改家目录 duty.md 即可生效，且升级不丢 |
| **刷 B 站 · 人设层** | 插件配置字段 **`personaPrompt`**（> `workspace` > AGENTS.md），宿主拼进每轮 headless prompt；⚠️ **硬截断 6000 字符**（`index.js:997`），整包 `whale-qq.md/whale-bili.md`（~9.3k 字符）塞不进 ⇒ 要么给 ≤6000 字的 gospel-lite，要么走 headless profile 的插件 section。 | 配置 schema：`index.js:84-85`；拼接：`index.js:979-999`；headless 拉起：`index.js:1434-1436`（`dsh --profile headless --patch <overlay> <prompt>`）；headless profile 组成：`C:\Users\Lenovo\.dsh\profiles\headless\package.json`（bundles = dsh-base + dsh-headless，默认 preset=standard）。 | ★★☆ 零改动，但字数受限 |

**推荐方案：A + B 混合，但 B 只做「deny + 改写建议」，不做悄悄替换。**
- **A（MVP，必做）**：preset 插件 scoped section 注入 gospel（系统提示词层）+ 宿主插件提供 `gospel_lint/compose/apply` 工具；B 站改家目录 `duty.md` + `personaPrompt`。
- **B（MVP 后期，可选）**：DSH 侧 `ctx.tools.guard` 做「出门前质检闸门」——命中铁锈就 deny 并把改写建议回给模型（模型自己重发）。**不做自动改写**：DSH 没有这个能力，硬做只能改桥接（二期，见 §5.3 B2）。
- **为什么必须 A+B**：模型对短消息的「行，」「可以，」是强先验，纯提示词压不住；但闸门只能 deny，模型不改就没法发 —— 靠 A 提高首次通过率、靠 B 兜底，两者缺一不可。

**MVP 范围内一周能做完的**：preset 插件 section + `gospel_lint` + `gospel_apply(dryRun)` + 闸门 `warn` 模式（先只记录、不拦）。**二期**：自动改写桥接、UI 面板、版本热更新。

---

## 1. 考证方法与「先说清楚哪些是错的」

用到的验证手段：
1. `cordis_inspect_list / cordis_inspect_query`（host `Service` / `Event` / `Config`）—— 查真实 Service 方法、事件签名与决策类型，**不是猜的**。
2. `read` / `grep` 直接读源码与配置文件，行号即本文件引用。
3. `dev_plugin_status` —— 看 loader 当前真正装配了哪些 entry（判断 preset 是否 active）。
4. 实跑：`node --check`、`node test/smoke.mjs`、`dev_build_plugin`（记录失败原因）。

### 1.1 重要纠偏：`~/.dsh/.agent-presets/` 已被 DSH 废弃

- 任务书里说的 `C:\Users\Lenovo\.dsh\.agent-presets\qq-chat-v2\agent.cordis.yml`（41KB，persona 在 `- id: persona` 行 8、`prefix` 从行 14 起）**确实存在，但 DSH 不再读取它**。
- DSH 自带文档明文写着：*"Before declaration rows, a user preset was a directory `$DSH_HOME/.agent-presets/<id>/` … **Nothing reads that directory any more.**"* —— 见
  `C:\Users\Lenovo\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-agent-preset\skills\editing-cordis-compositions\SKILL.md:70`。
- `dev_plugin_status` 显示当前 active 的 preset 是 **`preset-qq-chat-v2`（`@deepseek-ai/dsh-agent-preset`）**，它来自 profile bundle `qq-agent-presets` 的 patch，而不是那个目录。
- ⇒ **结论：要改 QQ 预设层，改的是 `qq-agent-presets` 的 patch 源，不是 `~/.dsh/.agent-presets`。** 谁去改后者都会白改。

### 1.2 今天这台机器上 QQ 链路的真实装配

```
profile  C:\Users\Lenovo\.dsh\profiles\web\package.json
  └─ dependencies: "qq-agent-presets": "link:C:/Users/Lenovo/.dsh/plugins/qq-agent-presets"
  └─ dsh.profile.bundles: [..., "qq-agent-presets", "dsh-bili-scroll"]
        └─ qq-agent-presets/package.json  (dsh.bundle.patch 列出 3 个 patch)
              └─ presets/qq-chat-v2.patch.yml
                    - insert:
                        - id: preset-qq-chat-v2
                          name: '@deepseek-ai/dsh-agent-preset'
                          config: { id: qq-chat-v2, name, description, order: 11, plugins: [...] }
```

- 声明处的关键字段：`C:\Users\Lenovo\.dsh\plugins\qq-agent-presets\presets\qq-chat-v2.patch.yml`
  - `- insert:` 行 6；`- id: preset-qq-chat-v2` 行 7；`config:` 行 9；`plugins:` 行 **14**；
  - `persona` 的 `prefix: |-` 行 **18**，正文从**行 19**开始（首句「你是弥赛鲸——DeepSeek 的鲸鱼…」）；
  - ⚠️ 该文件头两行写着「由 `scripts/build-agent-preset-patches.mjs` 生成，请勿手工编辑」⇒ **要持久化修改，改源** `D:\鲸鱼\qq-bridge\dsh\agent-presets\qq-chat-v2\agent.cordis.yml`（`- id: persona` 行 8）→ 重新生成 patch → 重装 bundle。手改 live patch 只适合临时验证，下次生成会被覆盖。
- 该 persona 段落**只管行为/工具协议**，人设正文明确交给桥接：行 19 写着「人设的完整设定由桥接注入的角色卡给出，遵循角色卡」。
- 该 preset 的 plugins 列表（同一 patch 文件后段）包含：`persona`、`tool-web`（search/fetch 关闭）、`tool-ask-user`、`tool-todo`、`qq-tool-restrict`（`name: qq-agent-presets/qq-tool-restrict.mjs`）、`compaction` 组。
- **我们要加的 gospel 层 = 这个列表里的新一条 entry**（详见 §3.1），与 `persona` 平级。

### 1.3 QQ 人设（角色卡）到底怎么到模型眼前

运行模式：`D:\鲸鱼\qq-bridge\state\mode.json:2` → `"mode": "reserved2"`；当前角色：`state\current-role.json:2` → `{"role": "弥赛鲸"}`。

**reserved2（当前）路径**：
1. 桥接不把角色卡塞进每条用户消息（那是老 `reserved` 社交模式的做法）。
2. 角色卡由工具按需取回：`mcp-snowluma-safe.js:570-577` 的 `qq_get_prompt` → `GET /api/socialV2/prompt`。
3. 该路由在 `bridge.js:4691-4786` 组装响应，`role` 字段 `bridge.js:4751`：
   `role: { name: roleState.role, hint: currentRoleHintV2() }`
4. `currentRoleHintV2()`（9601-9629）→ `roleHintForMode('v2')`（9505-9509）→ `roleRawContent()` 读 `roles/弥赛鲸.md`，**先按模式筛小节、再按 `role.maxInjectChars` 截断**。
5. `role.maxInjectChars` 现值：`qq-bridge\config.json` 的 `role.maxInjectChars = 20000`；`roles\弥赛鲸.md` = 30985 bytes ⇒ **约 1/3 内容（尾部）被截掉**。
   `reserved`（老）模式则把角色卡直接拼进用户 prompt：`bridge.js:11047-11052、11088、11116-11122`。

**这意味着**：
- 把 gospel 追加到 `roles/弥赛鲸.md` 末尾 ⇒ **一定被截断**，不可行（除非同时把 `role.maxInjectChars` 调大，但会挤爆上下文）。
- 把 gospel 插到角色卡开头 ⇒ 保住 gospel，但把原人设尾部挤掉，且每当角色卡更新都要手工合并，容易漂移。
- ⇒ 角色卡不是合适的 gospel 载体。**系统提示词 section 才是**（不受这段截断影响）。

### 1.4 QQ 发送链路（唯一能「发送前」动手的地方）

reserved2 下模型发言 = 调 MCP 工具，链路是：

```
DSH agent
  └─ mcp__snowluma__qq_send_message            (MCP, DSH 外部)
       └─ src/mcp-snowluma-safe.js:743-773     工具 handler（messages 归一化）
            └─ POST /api/socialV2/send-message（带 x-agent-token）
                 └─ qq-bridge/src/bridge.js:5243 路由
                      ├─ 5265-5267  messages 归一化
                      ├─ 5277-5327  校验：条数/长度/敏感词(SENSITIVE_RE)/频率…
                      └─ 之后才 sendToQQ → OneBot
qq_send_burst → bridge.js:5120 路由（同构）
老模式还有 /api/send/group、/api/send/reply、/api/send/private（mcp-snowluma-safe.js:506/532/556）
```

**DSH 原生 hook 的事实**（`cordis_inspect_query` 返回的签名，不是推测）：

| Hook | 模式 | 能做什么 | 不能做什么 |
|---|---|---|---|
| `tools/pre-execute` | waterfall | allow / deny(reason) / cancel / ask | `PreToolDecision` **没有改写 arguments 的字段** |
| `tools/execute` | waterfall | 包一层超时/重试/指标；可换 `exec.signal` | 官方注释：*"wrappers may change only `exec.signal`, while call identity remains immutable"* ⇒ **arguments 不可变** |
| `tools/post-execute` | waterfall | accept / replace 结果 / block+feedback | 在工具**执行完之后**才跑；QQ 消息此时已经发出去了 |
| `ctx.tools.guard` | 同步校验 | 返回 string = **拒绝**（这就是 `qq-tool-restrict.mjs:62-68` 在用的） | 只能 deny，不能改参数 |

⇒ **明确答案：没有「发送前 lint → 自动改写 → 放行」的 DSH 原生 hook。**
最接近的是 `ctx.tools.guard`（能拦、能带理由让模型重发）；要实现真正的自动改写，必须改
`D:\鲸鱼\qq-bridge\src\mcp-snowluma-safe.js` 的发送工具 handler，或 `bridge.js:5243` 的 `/api/socialV2/send-message` 处理器（在 5277-5327 校验之后、`sendToQQ` 之前插入 lint/改写）。

### 1.5 刷 B 站链路的真实数据流

插件：profile `dsh-bili-scroll@2.0.4`（`C:\Users\Lenovo\.dsh\profiles\web\node_modules\dsh-bili-scroll\`），家目录 `C:\Users\Lenovo\.dsh\bili-duty\`（`lib/state.mjs:36-50`）。

```
bili-scroll 宿主（web 进程）
  └─ 谷时窗口/手动 → runOne()
       ├─ promptFor()                         index.js:955-1084
       │    ├─ 读章程：charterPath() 家目录优先  state.mjs:111-115
       │    │    └─ ensureCharter() 用 charter.sha256 记账  state.mjs:128-160
       │    ├─ 替换 <家目录> → 绝对路径          index.js:961-963
       │    ├─ personaPrompt（≤6000字）          index.js:979-999
       │    └─ 宿主硬约束（报告路径/### BV号/配额/评论/@/私信/判重表/归档） index.js:1021-1083
       ├─ ensureOverlay() 写 headless-overlay.yml  index.js:1114-1170
       │    └─ 挂 bili-duty MCP（白名单 env，工具面收窄）  index.js:1101-1111
       └─ spawn: dsh --profile headless --patch <overlay> <prompt>   index.js:1434-1436
            └─ headless profile：dsh-base + dsh-headless，默认 preset=standard
                 （所以 QQ preset 完全不参与 B 站这一轮）
```

**改哪份 duty.md 才生效？**
- `state.mjs:111-115` `charterPath()`：家目录 `$DSH_HOME/bili-duty/duty.md` 优先，没有才用插件 `prompts/duty.md`。
- 当前两份**逐字节相同**（SHA256 `743574E1…8D4749`，`charter.sha256` 也记录同一值）⇒ **用户还没改过章程**。
- `ensureCharter()` 的规则：
  - 家目录 == 出厂版 ⇒ 插件升级时**覆盖**（正常升级）；
  - 家目录 ≠ 账本值 ⇒ 视为**用户改过** ⇒ 永不覆盖，新版另存 `duty.md.new`。
- ⇒ **改家目录那份 `C:\Users\Lenovo\.dsh\bili-duty\duty.md`**：改完账本对不上，从此插件升级不会吃掉你的改动 —— 这正是我们要的「可维护的本地化」。
- 改插件 `prompts/duty.md` 也生效（下次 `ensureCharter` 会覆盖家目录），但插件包一重装/升级就没了，不推荐。

**报告格式谁决定？** 三处叠加，缺一不可：
1. `duty.md:91-101`（「一轮要做的事」第 4 条）：每条第一行 `### BV号`；下一行标题/UP/链接/播放量/`**档位**：值得看|可以看|不值当`/为什么值得/一句话。
2. 宿主 `index.js:1035-1037`：写死报告路径、要求追加不覆盖、`### BV号` 行数=挑中条数（宿主拿它数配额）。
3. 宿主 `index.js:190-214`（`reportMeta()`）回读：用 `^###\s*(BV…)` 切块、正则抓 `**档位**`、`**为什么值得**`，给 UI「它刷过的视频」列表。
⇒ **格式不能推翻，只能「换语气、换内容结构」**：`###`/档位/追加/配额这几条是宿主契约，必须保留；「标题+链接+为什么值得」的**内容**可以改成观影教义式的「先夸具体闪光点 → 带共鸣 → 再安利回群」。

**当前 B 站链路是跑不通的（与注入点无关的阻塞项，需告知 Lead/用户）**：
`C:\Users\Lenovo\.dsh\bili-duty\duty.log` 最近一次实跑（2026-10-24T05:39:23）：
```
dsh: NO_ADAPTER: no adapter registered for provider "qy"
2026-10-24T05:39:23.508Z 刷B站结束（manual，code=1） 这一轮没写报告
```
原因是 headless overlay 里写入了 `agent-default-model = qy/gemini-3.8-flash`（`index.js:1138-1152` 跟随用户当前模型），但 headless profile 没有挂 `@deepseek-ai/dsh-llm-pi-ai`（`qy` 的 adapter）⇒ 每轮 spawn 后立刻死。
另外当前配置 `autoComment=false`、`dmUid=0`、`dmMode=only` ⇒ `commentOn=false`、私信被降级成 off（`index.js:1016-1020`）⇒ **现在这一轮只会写报告，不评论不私信**。
（修法见 §6.3 风险 R7：给 headless overlay 补 pi-ai provider，或把 `agent-default-model` 固定到 headless 可用的 deepseek-official/account 路由。）

---

## 2. 「人格补丁」资产模型（与仓库 gospel/ 对齐）

仓库已有的事实标准（`gospel/composition.md`）：四段式 `① 用户角色卡 → ② gospel/core.md → ③ adapters/<场景>.md → ④ 输出协议`；强度 `light / standard / full`；冲突优先级：安全 > 像人 > 场景 > 角色卡。
本插件**不自创模型**，就按这个来：

- 注入块 = `core.md`（带 frontmatter `version`）+ `adapters/<adapter>.md`，light 档改读 `prompts/whale-light.md`（没有则从 core 抽「禁忌/短句」小节）。
- 每次注入都带可识别指纹：
  `<!-- whale-gospel:begin version=… core=<version> sha=<8位> strength=… adapter=… -->` … `<!-- whale-gospel:end -->`
  ⇒ UI、日志、报告都能回答「这一轮注入的是哪一版福音」；出问题一键定位。
- gospel 资产位置（按优先级解析，见 `lib/gospel.mjs` 的 `resolveGospelRoot`）：
  1. 配置 `gospelRoot`（推荐指到仓库：`D:/鲸鱼/whale-gospel/gospel`）
  2. 环境变量 `WHALE_GOSPEL_ROOT`
  3. `$DSH_HOME/whale-gospel/gospel`（插件家目录，发布版用快照）
  4. `<plugin>/../../gospel`（仓库内开发态，链接安装时自动命中）
  5. `<plugin>/gospel`（打包内置快照）
- 版本化：`core.md` frontmatter 的 `version` 是唯一版本源；插件只读、不改资产；升级 = 用户拉仓库或换快照目录，注入块指纹自动变化。
- **不覆盖用户 preset 的保证**：gospel 不走 `persona.prefix`，而是**并列 entry**（§3.1）；preset 升级替换 `persona` 字段时，这条 entry 仍在 plugins 列表里。

---

## 3. QQ 方案对比与推荐

### 3.1 方案 A（提示词层）：preset 插件 scoped section

**做法**：在 `qq-agent-presets` 的 qq-chat-v2 声明里，`plugins:` 列表**追加一条**（不动 persona）：

```yaml
# 持久化改法：在源 D:\鲸鱼\qq-bridge\dsh\agent-presets\qq-chat-v2\agent.cordis.yml 的 plugins 列表末尾追加，
# 然后 node scripts/build-agent-preset-patches.mjs 重新生成 → 重装 qq-agent-presets bundle。
# （直接改 live patch C:\Users\Lenovo\.dsh\plugins\qq-agent-presets\presets\qq-chat-v2.patch.yml 只适合临时验证）
        plugins:
          - id: persona                 # ← 原样保留
            ...
          - id: gospel-section          # ← 新增：人格补丁层
            name: dsh-whale-gospel/preset   # profile node_modules 里的包（或 link:）
            config:
              strength: standard
              adapter: qq-group
              gateMode: warn                # 先观察一周
              gateThreshold: 36
```

**为什么这样最稳（已验证的 DSH 机制）**：
- 官方 `dsh-persona` 是「scope-only」行：它注册 `deployment:persona-prefix` / `deployment:persona-suffix` 两个 section，order 取 `getSectionOrder("DEPLOYMENT_PERSONA_PREFIX"|"DEPLOYMENT_PERSONA_SUFFIX")`（`dsh-persona/lib/index.js:35-48`）。
- `SECTION_ORDERS` 常量（`dsh-system-prompt/lib/index.js:10-43`）：prefix=0，suffix=**10200** 是最后一个。
- 我们的插件作为**同一 preset scope 的另一条 entry**，注册 `name: 'whale-gospel:core'`、`order: 10250` 的 section ⇒ 排在 persona 之后、对**该 agent scope 内**生效，天然不会污染其他会话（`systemPrompt.section()` 是 scope-shadow 语义，见 `dsh-system-prompt/lib/index.js:255` 与官方 skill "Choose plugin placement"）。
- `persona.prefix` 一行不动 ⇒ preset 升级（桥接重新生成/覆盖 patch）时，只要我们改的是源 `agent.cordis.yml` 并重新生成 patch，这条 entry 还在；即便只改 live patch，也只需重打一次，不会与 persona 文本冲突。

**改动面**：1 个 YAML 文件加 6 行；插件包 1 个 link 依赖（profile package.json）。
**成本**：section 文本每轮都在系统提示词里（standard ≈ 4.5k token / light ≈1.2k；可用 strength 档位控）。
**风险**：① preset 被上游重新生成时漏掉这 6 行 ⇒ 福音悄悄消失（缓解：指纹进 `gospel_status` + 每次启动日志一行；CI 校验 patch 含 `gospel-section`）。② token 成本上升（缓解：默认 standard，上下文紧张切 light）。③ 若模型不遵守系统提示词（小概率），需要 B 兜底。

### 3.2 方案 B（发送前闸门）：guard deny + 改写建议（B1）/ 桥接自动改写（B2）

**B1（DSH 原生，推荐 MVP 采用）**：preset 插件里注册 `ctx.tools.guard`：
- 只对发送类工具生效（`mcp__snowluma__qq_send_message / send_burst / reply / send_group_message / send_private_message`，白名单可配）；
- 从 `exec.arguments` 抽 `messages/message/text`，跑内嵌 lint（11 条规则，见 `lib/lint.mjs`）；
- 超阈值 → `return "AI 味闸门拦截：… 按下面改完再发：- 确认式起手：删掉…"`（string = deny）；
- 安全阀：同一分钟 deny 次数 > `maxDenyPerMinute`（默认 3）就放行并记账，防止模型陷进改写死循环烧 token；
- `warn` 模式只记账不拦（先跑一周校准阈值/误杀率）；全局热开关文件 `$DSH_HOME/whale-gospel/gate.off`（存在即放行，不用重载 preset）。
- 性能：11 条正则 × ≤8 条消息，实测 <1ms；只有命中才多一轮模型重发（token 成本 = 一次短重发，通常 <1k）。

**B2（桥接自动改写，二期）**：在发送收口做「lint → 规则改写/小模型改写 → 替换 messages」：
- 改 `qq-bridge/src/mcp-snowluma-safe.js:743-773`（MCP handler 内改 `finalMessages` 后再 POST）**或** `bridge.js:5243` 的 handler，在 5277-5327 校验之后、`sendToQQ` 之前插入；`qq_send_burst`（bridge.js:5120）同样处理。
- 优点：模型无感、100% 生效；缺点：改写质量风险（可能把人话改成另一种 AI 味）、要维护桥接、调试面变大。
- **建议二期只做「机械改写」**：删确认式起手、删客服尾巴、把「不是A而是B」压成一句、超长拆条 —— 全可用确定性规则完成；语义级改写仍交回模型。

### 3.3 对比表与推荐

| 维度 | A 纯提示词 | B1 guard deny+建议 | B2 桥接自动改写 | 推荐 |
|---|---|---|---|---|
| 能否压住「行，/可以，」 | 部分（强先验，长尾仍在） | ✅ 硬拦 | ✅ 硬改 | **A+B1** |
| 改动面 | 1 个 YAML 6 行 + 插件包 | 插件包内（无桥接改动） | qq-bridge 2 个文件 | A+B1 先行 |
| 生效延迟 | 新会话/preset 重载 | 同上 | 立即（桥接重启） | — |
| 性能 | 每轮固定 token +4.5k（standard） | 每次发送 <1ms | 每次发送 +规则耗时 | light 档可省 |
| 误拦截 | 无 | 有（阈值/规则误杀），可 warn→block、rate-cap、gate.off | 有（改坏原文） | B1 先 warn 一周 |
| 回滚 | 删 6 行 / preset 重装 | 配置改 `off` 或 touch `gate.off` | 回滚桥接文件 | 均有一键路径 |
| 对 preset 升级的鲁棒性 | 高（并列 entry） | 高 | 最高（不碰 preset） | — |

**最终推荐：A + B1 混合，分三步上线**（§8 实施计划）：① A 先上（warn 模式观察）→ ② B1 开 block（阈值 36，rate-cap 3/min）→ ③ 视效果再决定是否做 B2。

---

## 4. 插件架构（hybrid：host + preset + 可选 UI）

### 4.1 组件

```
whale-gospel 插件包
├── lib/index.js          宿主插件（profile 级，host 半）
│     ├─ gospel_status / gospel_compose / gospel_lint / gospel_rewrite / gospel_apply / gospel_report
│     └─ injectMode=section 时注册全局 prompt section（只建议 headless profile 用）
├── preset/index.mjs      ★ QQ 人格补丁层（preset 里挂一行；scoped）
│     ├─ systemPrompt.section(order 10250)  ← gospel 注入块
│     └─ ctx.tools.guard                    ← 发送闸门（off/warn/block）
├── lib/gospel.mjs        gospel 资产解析 / 组装 / 指纹 / 受管写入回滚
├── lib/lint.mjs          AI 味规则引擎（11 规则 + 打分 + gateCheck）
├── gospel/（可选快照）    发布版内嵌 gospel 资产
└── client.js（二期 UI）
```

### 4.2 注入目标一览

| 目标 | 挂法 | 注入内容 | 生效范围 |
|---|---|---|---|
| QQ 系统提示词（A 层） | preset 的 plugins 加一行 `dsh-whale-gospel/preset` | `core + qq-group adapter`（order 10250） | 仅该 QQ preset 的 agent |
| QQ 发送闸门（B1 层） | 同上插件内 `ctx.tools.guard` | 拦截 + 改写建议 | 同上 |
| B 站 headless（可选） | `~/.dsh/profiles/headless/cordis.patch.yml` 挂 host 插件，`injectMode: section` | `core + bili-comment adapter` | 仅 headless 进程（独立进程，安全） |
| B 站 duty/人设（MVP） | 改家目录 `duty.md` + 设置 `personaPrompt` | 观影教义式判断/报告规则 | 该机器所有 B 站轮次 |
| 角色卡/AGENTS.md | `gospel_apply` 受管写入（默认 dryRun） | 注入块 | 通用兜底；QQ 角色卡有截断，不推荐 |

### 4.3 配置 schema

`config.example.json` 是完整例子；字段语义：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | bool | true | 总开关 |
| `gospelRoot` | string | '' | gospel 资产根（含 `core.md`/`adapters/`）；空 = 按 §2 顺序自动找 |
| `strength` | `light\|standard\|full` | `standard` | token/效果档位 |
| `adapter` | `qq-group\|bili-comment\|none` | `qq-group` | 一次只装一个场景 |
| `injectMode` | `off\|section` | `off` | host 插件是否注册全局 section（web profile 别开！） |
| `sectionOrder` | number | 10250 | > `DEPLOYMENT_PERSONA_SUFFIX(10200)` |
| `lintThreshold` | number | 36 | 0~100，>36 = 「明显」档 |
| `allowWrite` | bool | false | `gospel_apply` 是否允许真写；false 时强制 dryRun |
| `roleCard.targetPath` | string | '' | `gospel_apply` 缺省目标 |
| `roleCard.position` | `tail\|head` | tail | 写角色卡的位置（QQ 有截断风险） |
| `gate.mode` | `off\|warn\|block` | `block` | 闸门策略 |
| `gate.tools` | string[] | 5 个发送工具 | 哪些工具算「发送」 |
| `gate.threshold` | number | 36 | 命中阈值 |
| `gate.maxDenyPerMinute` | number | 3 | 安全阀（超了放行防死循环） |
| `gate.statsFile` | string | `$DSH_HOME/whale-gospel/gate-stats.jsonl` | 闸门流水（UI 的数据源） |
| `bili.reportDir` | string | `$DSH_HOME/bili-duty/out` | 报告目录（`gospel_report`） |

### 4.4 工具清单（MVP 与二期）

| 工具 | 输入 | 输出 | 阶段 | 备注 |
|---|---|---|---|---|
| `gospel_status` | — | 资产来源/版本/指纹、strength、规则数、闸门统计 | **MVP** | UI 和排障入口；纯只读 |
| `gospel_compose` | `strength?` `adapter?` | 注入块全文 + meta + warnings | **MVP** | 「读 gospel.md → 注入块」的成品出口 |
| `gospel_lint` | `text?` / `texts?` / `maxChars?` | `{score, grade, hits(top), suggestions}` | **MVP** | 直接调内嵌 lint 引擎；零成本 |
| `gospel_rewrite` | `text` | 规则级改写建议 + 闸门预判 | **MVP** | 不做自动改写（见 B2） |
| `gospel_apply` | `targetPath?` `position?` `dryRun?` `remove?` | 写入结果/备份路径/预览 | **MVP** | 默认 dryRun；`allowWrite=false` 时强制 dryRun |
| `gospel_report` | `reportPath?` / `text` | 报告整体分 + 最差 top3 段落 | **MVP** | 按 `### BV` 分块，天然贴合 B 站报告契约 |
| （二期）`gospel_watch` | — | 资产变更事件流 | 二期 | 热更新注入块 |
| （二期）`gospel_gate_stats`/UI | — | 今日拦截/放行计数、误杀标记 | 二期 | 见 §4.5 |

**一周 MVP 最小路径**：`lib/gospel.mjs`（已给）+ `lib/lint.mjs`（已给）+ `preset/index.mjs` 的 section 与 guard（已给）+ `gospel_lint/gospel_compose/gospel_apply` 三只工具（已给）。骨架已含全部这四块，剩下的是**装进 profile/preset 并做真机验证**（§8 M1 的验收项）。

### 4.5 UI 面板（两个视图就够，别过度设计）

面板定位：不是数据大屏，是「今天福音在不在岗、有没有拦对」的一页纸。

**视图 1 · 注入状态（回答「接得进吗」）**
- 三个灯：`gospel 资产`（路径/版本/指纹/字符数）、`注入层`（A section 是否注册、order、strength/adapter）、`闸门`（off/warn/block、阈值）。
- 一行「本次会话实际注入块」的折叠预览（头 200 字 + begin 标记）。
- 一键：dryRun 重新生成 / 复制注入块 / 打开 gospel 文件。

**视图 2 · 今日战报（回答「有用吗」）**
- 今日：发送次数 / 拦截次数 / 放行（超安全阀）/ 平均 AI 味分；最近 20 条「命中病灶 top3」。
- 每条可点开看：原文、分数、命中规则、改写建议、最终是否重发（二期）。
- 页脚：`warn` 模式下加一行「疑似误杀？点这里标记」——为调阈值提供人工反馈（二期，MVP 可先只展示）。

数据源：`gate-stats.jsonl` + activity.jsonl（插件写）、`gospel_status`。UI 用 `client.js` 走 settings 面板或 `conversation.view` slot（二期；骨架未实现，标注未验证）。

---

## 5. 刷 B 站：从「摘要提取机」到「观影教义式输出」

### 5.1 改哪里（按生效强度排序）

| 要改的 | 改哪个文件 | 改什么 | 是否会被升级覆盖 |
|---|---|---|---|
| 判断标准/报告内容写法 | `C:\Users\Lenovo\.dsh\bili-duty\duty.md`（**家目录那份**） | `## 判据`（150-154）、`## 一轮要做的事 4`（91-101）的内容措辞、`## 关于你自己`（174-178） | ❌ 不会（改造后 `ensureCharter` 认作「用户改过」，永不覆盖） |
| 人设/语气 | bili-scroll 设置 `personaPrompt`（或直接写 `$DSH_HOME/bili-duty/config.json` 的 `personaPrompt`） | 塞 ≤6000 字 gospel-bili-lite（`index.js:997` 硬截断） | ✅ 设置值不被插件覆盖，但 6000 字要守 |
| 完整 gospel（core+bili adapter ≈9.3k 字） | `~/.dsh/profiles/headless/cordis.patch.yml` 挂 whale-gospel host 插件，`injectMode: section` | 全量注入，不受 6000 字限制 | ✅ 但需维护 headless profile patch |
| 报告格式契约 | **不要动**：`### BV号`、`**档位**`、追加不覆盖、配额行 | 宿主 `index.js:1035-1037` + `reportMeta()` 190-214 依赖 | — |

### 5.2 「观影教义式输出」要动的地方（具体到段落）

在 `~/.dsh/bili-duty/duty.md` 里：

1. **`## 一轮要做的事` 第 4 条（91-101）**：保留「`### BV号` 首行 + 档位行」，把「为什么值得（两三句）/你自己的一句话」升级成三段式：
   - ① **先夸具体闪光点**（这个 UP 在这一条里做对了什么，必须引用字幕原文里的一处细节，禁止泛夸）；
   - ② **带共鸣**（说它为什么戳到人/和群友/使用者的生活有关，一句话）；
   - ③ **再安利回群**（一句可以在群里直接转述的话，口语、不总结、不升华）。
   - 这三段正好可以映射到宿主已经解析的 `**为什么值得**` 字段（`reportMeta()` 抓 `**为什么值得**：…`），**不破坏 UI**。
2. **`## 判据`（150-154）**：把「值得 = 新东西/有实操细节」补上「值得 = 有具体的人味瞬间/可转述的梗」，并把「不值得」加上「只有信息罗列、没有观看体验的」。
3. **`## 关于你自己`（174-178）**：补一句「你不是摘要机：先说你看到了什么、哪里被戳到，再说值不值得」。
4. **`## 私信投递`（109-140）**：私信本来就要求「人话」，把「标题+链接+一句话理由」升级为「一句安利 + 链接」（保留 500 字/≤5 条上限，`index.js:1062-1074` 会硬性再讲一遍，不冲突）。

> ⚠️ 不要在 duty.md 里替换掉宿主会在 prompt 里重复的硬约束（报告路径、`### BV号` 计数、判分表路径、追加规则）。宿主的 `promptFor` 每轮都会再强调一遍，两边冲突时以宿主为准，白改。

### 5.3 B 站侧的插件工具（MVP 就两只）

- `gospel_report`：读 `$DSH_HOME/bili-duty/out/<今天>.md` → 按 `### BV` 分块 → 给整份报告打分 + 找出「最像摘要机器」的 top3 段落。给用户一条命令就能看「今天的报告 AI 味有多重」。
- `gospel_apply`（角色卡/AGENTS.md 通用）+ `gospel_compose(adapter='bili-comment')`：生成 ≤6000 字的 bili 人设块，用户复制进 `personaPrompt` 设置框（一期手动，二期可加 `gospel_bili_setup` 自动写入配置）。
- 二期（可选）：`gospel_bili_apply` —— 直接改家目录 `duty.md` 的受管段落（带备份 + 回滚），把「观影教义式三段」做成可一键装/卸的模块。**建议先人工改一次**，确认口吻后再工具化，避免插件把用户 duty.md 改坏（`ensureCharter` 会认作「用户改过」，改坏后没有自动恢复）。

---

## 6. 风险清单与回滚

| # | 风险 | 触发条件 | 影响 | 缓解 / 回滚 |
|---|---|---|---|---|
| R1 | preset 重新生成时漏掉 `gospel-section` entry | 桥接 `scripts/build-agent-preset-patches.mjs` 从源 `agent.cordis.yml` 重新生成 patch（源里没这行） | 福音静默消失，且没人发现 | ① 把 entry 写进**源** `D:\鲸鱼\qq-bridge\dsh\agent-presets\qq-chat-v2\agent.cordis.yml` 再生成；② `gospel_status` 显示注入层未注册 + 启动日志一行；③ 桥接侧加一个「preset 含 gospel-section」的自检（`npm run verify:persona` 旁） |
| R2 | preset 升级把 `persona.prefix` 更新后与 gospel 冲突 | 上游改行为协议 | 风格规则被压过 | gospel section 在 persona 之后（order 10250），冲突时以最近/更具体为准；文本层面让 gospel 不写安全/工具协议（只写说话方式），从源头避免冲突 |
| R3 | 插件升级 / gospel 资产变更后旧注入块残留 | 资产换版但会话复用 | 旧版福音继续生效 | 注入块带 `core=<version> sha=` 指纹；新会话/重载后自动换；`gospel_status` 可核对 |
| R4 | `gate` 误拦截 | 阈值/规则误杀（例如正常短句被判两瓣） | 发言被拒、模型反复重发、烧 token | ① 先 `warn` 跑一周再开 `block`；② 安全阀 `maxDenyPerMinute=3`；③ 热开关文件 `$DSH_HOME/whale-gospel/gate.off`；④ 配置 `gate.mode=off` 重载 preset；⑤ 报表人工标记误杀反哺阈值 |
| R5 | 多会话/多群并发 | 同一 preset 被多个群会话使用 | guard 状态串会话 | guard 是 preset scope 内（每个 agent 一份），计数器按进程共享但只影响「每分钟放行」；阈值/窗口无跨会话写文件，避免竞争；stats 追加写（appendFileSync 单行 ≤4KB） |
| R6 | 注入 token 成本上升 | standard 档 ~4.5k token/轮 | 每轮固定变贵 | `strength: light`（~1.2k）；QQ 群聊上下文本就压得紧时默认 light；`gospel_status` 报字符数供估算 |
| R7 | **B 站链路目前跑不通**（与福音无关的既有阻塞） | `NO_ADAPTER: no adapter registered for provider "qy"` | 每轮 headless 秒退、无报告 | 在 headless overlay 补 pi-ai provider（`index.js:1114-1170` 增加 insert），或把 `agent-default-model` 固定到 headless 可用路由；**建议先修这个再验收 B 站福音** |
| R8 | 角色卡受管写入被截断（若有人用 gospel_apply 写 QQ 角色卡） | `maxInjectChars=20000` < 角色卡 30985 | gospel 尾部被切 | 不推荐写角色卡；要用就 `position: head` 或同时调大 `role.maxInjectChars`（不推荐）；文档红字标注 |
| R9 | gospel 资产与仓库漂移 | 插件内快照 vs 仓库 `gospel/` 各改各的 | 两套规则打架 | 只认一个源：发布版由 `scripts/bundle.mjs` 生成快照并记录 sha；开发态直接指 `gospelRoot` 到仓库 |

**回滚矩阵（一键动作）**：
- 注入消失：preset 里删 `gospel-section` 6 行 → 重新装 bundle / 新会话。
- 闸门失效：`gate.mode: off` 或 `touch $DSH_HOME/whale-gospel/gate.off`（热）。
- 受管写入回滚：`gospel_apply(remove:true)` 或从 `.wg-bak-*` 备份恢复（`lib/gospel.mjs` 每次写入前自动备份）。
- B 站 duty.md 回滚：从 `$DSH_HOME/bili-duty/duty.md.new`/备份恢复；注意 `ensureCharter` 认作「用户改过」后不会自动回退，必须手动。

---

## 7. 分阶段实施计划

### M0（0.5 天）：把事实钉死 + 阻塞项
- [ ] 按 §1.2 确认 `preset-qq-chat-v2` active、`qq-agent-presets` 是唯一源。
- [ ] 修复 B 站 headless `NO_ADAPTER: qy`（R7），否则 B 站侧无法验收。
- [ ] 定 gospel 资产源：`gospelRoot = D:/鲸鱼/whale-gospel/gospel`。

### M1（2~3 天）：A 层 + lint 工具（不拦）
- [ ] 把 `plugin-skeleton/` 装进 profile：`plugin_manager install_bundle`（或 dev_inject_plugin 临时验证）。
- [ ] 在 qq-chat-v2 preset 的 plugins 里加 `gospel-section` entry（`gateMode: warn`）。
- [ ] 新开 QQ 会话，跑 `qq_get_prompt` 前后各一次 `gospel_status`，确认：section 已注册、字符数、指纹。
- [ ] 真实性检查：让鲸鱼在群里说 20 句，拉 `gate-stats.jsonl`，人工标 5 条「误杀/漏杀」。
- [ ] B 站：改家目录 `duty.md`（观影教义三段 + 判据），设置 `personaPrompt`（≤6000 字 lite），跑一轮看报告。
- **验收**：`gospel_status` 显示注入成功；warn 统计有数据；报告里能看到「具体闪光点 + 共鸣 + 安利」三段。

### M2（3~5 天）：B1 闸门 + 报告体检 + UI 视图 1
- [ ] `gateMode: block`，阈值调到 warn 数据的最佳点（目标误杀 <5%）。
- [ ] `gospel_report` 接进 B 站日常：每轮报告后自动打分（宿主侧加一行，或手动跑）。
- [ ] UI 视图 1（注入状态）+ 视图 2 只读版（今日战报）。
- **验收**：群里连续 3 天「行，/可以，」起手 = 0；误杀率 <5%；报告 AI 味均分下降 ≥15。

### M3（可选，1~2 周）：B2 桥接自动改写 + UI 交互
- [ ] 在 `mcp-snowluma-safe.js:743-773` / `bridge.js:5243` 加机械改写（删起手/尾巴、压对仗、拆长条），带 `dry-run` 开关。
- [ ] UI 误杀标记 → 反哺规则权重。
- **验收**：模型无需重发，出站消息直接过闸；误改率 <1%。

---

## 8. 附录

### 8.1 本次已跑 / 未跑（诚实记录）

| 项 | 结果 |
|---|---|
| 读源码/配置核对行号 | ✅ 全部按 §1 引用 |
| `cordis_inspect_query` 查 Service / Event 真实签名 | ✅ `systemPrompt`、`tools/pre-execute`、`tools/execute`、`tools/post-execute`、`agent/request`、`agent/pre-step` 均已查（结论见 §1.4） |
| `dev_plugin_status` 确认 preset active | ✅ 输出含 `preset-qq-chat-v2 (@deepseek-ai/dsh-agent-preset)` |
| 骨架 `node --check` 4 个入口 | ✅ 通过 |
| 骨架 `node test/smoke.mjs` | ✅ 19 项 PASS；实测 bad 平均 45 分 / good 平均 6 分（差 39，验收线 ≥20） |
| `dev_build_plugin` 编译 | ❌ 失败：`ERROR: 未找到 DSH checkout（设置 DSH_CHECKOUT 环境变量）`；且本机无 `bash`（`bash` 不在 PATH）。骨架因此**刻意免编译**（纯 ESM，无 src/tsc/打包步骤） |
| 运行时装配（ctx.tools.register / ctx.systemPrompt.section / ctx.tools.guard） | ⚠️ 未在运行中验证；API 形状抄自官方 `dsh-tool-todo` / `dsh-persona` / `qq-tool-restrict`，需装进 profile 后按 M1 验收项确认 |
| QQ 桥接发送链路 | ✅ 读码确认（§1.4）；未做端到端注入测试 |
| B 站链路实跑 | ❌ 当前 `NO_ADAPTER: qy` 跑不起来（R7），仅读码 + 读日志确认 |

### 8.2 关键文件行号索引

| 路径 | 行号 | 内容 |
|---|---|---|
| `...\dsh-system-prompt\lib\index.js` | 10-43 | `SECTION_ORDERS`（prefix 0 / suffix 10200） |
| `...\dsh-persona\lib\index.js` | 35-48 | persona 行注册 section 的官方写法 |
| `...\dsh-agent-preset\skills\editing-cordis-compositions\SKILL.md` | 70 | 「`~/.dsh/.agent-presets` 已无人读取」 |
| `C:\Users\Lenovo\.dsh\plugins\qq-agent-presets\presets\qq-chat-v2.patch.yml` | 6 / 7 / 14 / 18 / 19 | insert / preset 行 id / plugins 列表 / `prefix: \|-` / persona 首句 |
| `D:\鲸鱼\qq-bridge\dsh\agent-presets\qq-chat-v2\agent.cordis.yml` | 8 | 源 preset 的 `- id: persona`（生成 patch 的源） |
| `D:\鲸鱼\qq-bridge\src\bridge.js` | 4691-4786 / 4751 | `/api/socialV2/prompt` / `role.hint` |
| 同上 | 9505-9509 / 9601-9629 | 角色卡截断 / v2 角色卡过滤 |
| 同上 | 5243-5327 / 5120 | v2 发送收口 / burst 收口 |
| 同上 | 7267-7287 | `sendToQQ`（真正发 OneBot） |
| `D:\鲸鱼\qq-bridge\src\mcp-snowluma-safe.js` | 570-577 / 743-773 | `qq_get_prompt` / `qq_send_message` handler |
| `D:\鲸鱼\qq-bridge\roles\弥赛鲸.md` | 全文件 30985B | 当前角色卡（> 20000 截断线） |
| `D:\鲸鱼\qq-bridge\config.json` | `role.maxInjectChars` | 20000 |
| `...\dsh-bili-scroll\lib\state.mjs` | 111-115 / 128-160 | 章程路径 / 章程改造账本 |
| `...\dsh-bili-scroll\index.js` | 955-1084 | `promptFor()` 组装 headless 提示词 |
| 同上 | 84-85 / 190-214 / 1031-1037 / 1114-1170 / 1434-1436 | personaPrompt / reportMeta / 报告硬约束 / overlay / spawn |
| `C:\Users\Lenovo\.dsh\bili-duty\duty.md` | 61-65 / 67-101 / 103-108 / 109-140 / 142-148 / 150-154 / 156-172 / 174-178 | 各节（改哪节见 §5.2） |
| `C:\Users\Lenovo\.dsh\bili-duty\duty.log` | 2026-10-24T05:39:23 | `NO_ADAPTER: qy` 实跑失败证据 |

### 8.3 术语

- **A 层 / B 层**：A=提示词注入层；B=发送前闸门层。
- **scoped section**：只在某个 agent preset scope 内生效的系统提示词段（Cordis scope 语义）。
- **受管段落**：`<!-- whale-gospel:begin … -->` … `<!-- whale-gospel:end -->` 之间由插件维护的文本，可幂等替换/一键移除。
- **charter 账本**：`$DSH_HOME/bili-duty/charter.sha256`，决定家目录 duty.md 升级时是否被覆盖。

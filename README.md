# 🐋 whale-gospel · 去 AI 味工具链

> **ESLint for AI personas** —— 让 AI 先像人，再演人设。
>
> 一份开源的去 AI 味宪章（人格内核）× 一台人机味体检台（可量化）× 一个视频即代码剧场（可传播）× 一个 DeepSeek Harness 插件（可接入）

<p>
  <img alt="license-code" src="https://img.shields.io/badge/code-MIT-blue">
  <img alt="license-text" src="https://img.shields.io/badge/gospel-CC--BY--4.0-green">
  <img alt="deps" src="https://img.shields.io/badge/dependencies-zero-brightgreen">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-black">
</p>

**它解决一个很具体的问题**：你养的 AI 人设，一开口就露馅。
「行，那我说说」「不是 A 而是 B」「希望这能帮到你~」——八种机械铁锈，把人味冲得干干净净。

这个仓库不只是一份提示词，它把「AI 味」变成了**可以测量、可以拦截、可以回归测试**的工程问题。

---

## 30 秒，先给你的 AI 做个体检

```bash
git clone https://github.com/TWAYS111/Messiahwhale && cd Messiahwhale
node lint/bin/ai-flavor-lint.mjs --file 你的聊天记录.jsonl
```

真实输出（仓库自带坏样本，51 条）：

```
🐋 whale-gospel · AI 味体检台  v0.1.0
输入 lint/samples/bad.jsonl · 51 条消息 · 1078 字 · 阈值 ≤35

  人机味指数  80 / 100   [人机味浓] 🦾
  ████████████████████████░░░░░░
  八种机械铁锈全齐了，这只鲸鱼需要一场弥撒。

  命中 149 处 · 涉及 51 条消息 · 11/11 类病灶

  病灶分布
    客服尾巴与清单   20 处  ██████████████████
    逗号两瓣句     19 处  ██████████░░░░░░░░
    老妈子说教腔    13 处  ██████████░░░░░░░░
    确认式起手     10 处  ███████████░░░░░░░
    ...
```

同一套规则跑仓库里的三份语料（`node lint/test/bench.mjs` 可复现）：

| 语料 | 条数 | 人机味指数 | 分档 |
|---|---:|---:|---|
| `samples/bad.jsonl`（病历卡级 AI 腔） | 51 | **80** | 人机味浓 |
| `samples/good.jsonl`（福音示范句） | 23 | **6** | 像人 |
| `samples/human.jsonl`（真实群聊口语） | 20 | **2** | 像人 |

> 体检报告可直接截图分享：`lint/demo/report.html`（自包含、离线可开）。
> 局限也写在明面上：规则法只抓形式不抓语义，语义层需要 LLM judge 补位（v0.2）。

---

## 仓库里有什么

```
whale-gospel/
├─ gospel/                  人格内核（灵魂层，不绑定任何人设）
│  ├─ core.md               ★ 去 AI 味宪章 v1.0（八种铁锈 + 短句呼吸 + 情绪光谱 + 观影教义）
│  ├─ think.md              ★ 内省教义：thinking 用中文、第一人称、别做分析报告（实测中文占比 19%→74%）
│  ├─ adapters/             QQ 群聊 / B 站观影 两套场景适配层
│  └─ composition.md        五段式拼接顺序、强度档位、冲突裁决、反模式
├─ prompts/                 开箱即用整包（由 scripts/bundle.mjs 生成）
├─ lint/                    ★ 人机味体检台（零依赖，11 条规则 + 评分 + HTML 报告 + CI 退出码）
├─ theater/                 ★ 视频即代码：录制就绪的「弥赛鲸福音剧场」（OBS 直接录）
├─ plugin/                   ★ 真实可装的 DeepSeek Harness 插件（v0.2.0：设置页 + 预设开关 + 内省教义）
├─ plugin-skeleton/          DeepSeek Harness 插件骨架（设计/考证稿：人格补丁层 + 发送前闸门）
├─ docs/                    产品定义 / 插件接入考证 / B站发布手册
└─ examples/                真实 before/after
```

## 快速开始

```bash
# 1) 体检任意文本
node lint/bin/ai-flavor-lint.mjs --file chat.txt          # txt / jsonl 都行
node lint/bin/ai-flavor-lint.mjs --file chat.jsonl --html report.html --fix

# 2) 拼一份给自己的提示词整包
node scripts/bundle.mjs        # → prompts/whale-qq.md / whale-bili.md / whale-light.md

# 3) 自测（仓库自己的回归测试）
node lint/test/run.mjs         # 37 项断言
node plugin-skeleton/test/smoke.mjs   # 19 项断言（注入块/评分/闸门/受管写入）
```

## 怎么把它装进你的 AI

**① QQ 群 / 任意对话模型（提示词层，5 分钟）**
把 `gospel/core.md` + `gospel/adapters/qq-group.md` 拼在你的人设卡之后（整包见 `prompts/whale-qq.md`）。
⚠️ 只贴提示词治不好 AI 味——模型对「行，」是强先验；发送前闸门（`ctx.tools.guard`）在插件 v0.2 落地，设计见 [docs/DSH-PLUGIN.md](docs/DSH-PLUGIN.md)。

**② DeepSeek Harness 插件（真实版在 [`plugin/`](plugin/)，v0.2.0）**
纯 JS、免构建，clone 下来就能装（`plugin_manager` 的 `install_bundle`，或运行时注入同一个目录）：
- 「设置 → 鲸鱼柔顺剂」一页：自动检测 QQ 机器人 / 刷B站，勾选哪些 Agent 预设要注入（内置的「创造模式」、QQ 预设、你自己魔改的预设都在列表里）；
- 人格补丁层：只在该 Agent 的 scope 注册 `systemPrompt.section(order 20000)`，排在官方 persona 之后，**不改 preset 文件、不覆盖角色卡**；
- 思考通道：注入 `gospel/think.md` 内省教义，thinking 以中文为主、先认身份再比较三种方案；开关在设置页，指纹带 `think=<sha>`；
- 刷B站开关：把观影教义写进 `$DSH_HOME/bili-duty/duty.md`（写前备份，关闭只删自己那段，SHA 可完全还原）；
- 12 个 HTTP 接口 + Agent 工具 `whale_gospel`（status/list/preview/toggle/custom/think/open）。

`plugin-skeleton/` 保留为设计/考证稿（最小链路示例），装真插件用 `plugin/`。

**③ 刷 B 站视频的 AI（观影层）**
改 `$DSH_HOME/bili-duty/duty.md`（家目录那份才是真在用的）+ 设置 `personaPrompt`（≤6000 字），
把「摘要提取机」换成三段式：**先夸具体闪光点 → 带共鸣 → 再安利回群**。详见 [docs/DSH-PLUGIN.md](docs/DSH-PLUGIN.md) §5。

## 视频即代码

`theater/web/index.html` 打开即播（`?record=1` 隐藏全部 UI，锁 1920×1080），按 `A` 自动连播、`C` 纯净模式，OBS 直接录。
本期宣传视频的剧本、画面、字幕都在这个文件里——**没有剪辑软件**。
操作手册见 [theater/README.md](theater/README.md)；B 站投稿包装见 [docs/LAUNCH-BILI.md](docs/LAUNCH-BILI.md)。

## 设计原则（为什么长这样）

1. **可测量 > 可感受**：「AI 味」必须能写出分数，否则永远无法改进。
2. **闸门 > 提示词**：提示词决定倾向，闸门决定下限。两者缺一不可。
3. **场景分离**：群聊要碎片、影评要细节，一套协议不能通吃（所以 adapter 一次只装一个）。
4. **不覆盖用户的资产**：福音是「补丁层」，不是「替换层」；角色卡与 preset 归用户。
5. **诚实**：评测局限、误报样本、跑不通的链路（比如 B 站 headless 当前的 `NO_ADAPTER`），全部写在文档里。

## 路线图

- **v0.2（当前）**：内省教义强化（中文 reasoning 协议）+ 真实插件入仓（`plugin/`，设置页 / 预设开关 / 注入 order 20000）
- **v0.3**：LLM judge 语义评分、`gospel_apply` 真机注入、B 站报告自动体检、UI 面板（注入状态 / 今日战报）
- **v0.4**：桥接层机械改写（删起手/尾巴、压对仗、拆长条）、规则市场、CI Action

## 贡献

最欢迎的 PR：**新规则**（附坏例子）、**新语料**（真实聊天记录，脱敏）、**新 adapter**（微信 / Discord / Claude Projects…）。
规则必须能在 `lint/samples/` 里证明它能区分 bad/good，否则不合并。

## License

- 代码（`lint/` `theater/` `plugin/` `plugin-skeleton/`）：MIT
- 文本资产（`gospel/` `prompts/` `samples/`）：CC BY 4.0（商用可，署名保留）

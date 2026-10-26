# prompts/ · 开箱即用的整包（生成物，勿手改）

这里的三个文件是 `scripts/bundle.mjs` 从 `gospel/` 拼出来的成品，直接复制粘贴即可：

| 文件 | 组成 | 适用 | 体量 |
|---|---|---|---|
| `whale-qq.md` | `gospel/core.md` + `adapters/qq-group.md` | QQ 群 AI 人设 | ~9.1k 字符（≈3.5k token） |
| `whale-bili.md` | `gospel/core.md` + `adapters/bili-comment.md` | 刷 B 站、写影评/评论的 AI | ~9.3k 字符 |
| `whale-light.md` | 从 core 抽出的「八条禁忌 + 短句规则」 | 上下文紧张时先止血 | ~3.1k 字符（≈1.2k token） |

## 用法（一句话）

把你自己的角色卡放最前面，然后整段贴 `whale-qq.md`（或 `whale-bili.md`）。
**不要两个 adapter 同时贴**——输出协议会打架。换场景就换整包。

## 重新生成

```bash
node scripts/bundle.mjs
```

改规则请改 `gospel/core.md` / `gospel/adapters/*.md`，不要改这里（每次生成会覆盖）。

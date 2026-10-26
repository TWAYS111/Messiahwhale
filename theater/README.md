# theater/ · 弥赛鲸福音剧场（可直接录制的版本）

> 这个目录是给**你自己开 OBS 录屏**准备的：立绘已补齐、录制模式已内置、UI 元素可一键隐藏。
> 自动化渲染/出片（ffmpeg 合成、字幕烧录）留了接口，但**在 DSH 沙箱里起不了 Chrome**，所以本次不做成片。

## 一、怎么打开

双击 `web/index.html` 即可（纯静态，无需服务器 / 无需联网）。

推荐直接用 Chrome，并且：
- 窗口设成 **1920×1080**（或 F11 全屏后在 OBS 里裁成 1920×1080）
- 浏览器缩放 100%（`Ctrl+0`）

## 二、录制模式

在地址后面加 `?record=1`：

```
file:///D:/鲸鱼/whale-gospel/theater/web/index.html?record=1
```

效果：顶栏/提示文字/弹窗全部隐藏，画布锁定 1920×1080，鼠标指针隐藏。

可选参数：
- `&stable=1`：关掉光柱摇摆、粒子随机抖动等动画，画面更"稳"，适合逐帧/高清录制（但会损失一点灵气）
- 不加 `stable`：保留全部动效（推荐，布道感更强）

## 三、录屏操作面板（非录制模式下）

| 操作 | 作用 |
|---|---|
| 点击对话框 / 空格 | 下一句 |
| `A` | 自动连播（推荐！手不碰键盘，画面最干净） |
| `C` | 纯净录屏模式（等价于 `?record=1` 的 UI 隐藏） |
| `B` | 弹出福音小册子（可单独录一段"成品展示"） |
| `←` | 上一句（录错了方便回退） |
| 右上「语速」滑杆 | 打字机速度，建议 32~40（太快显得急） |
| 顶部章节 pill | 一~五幕跳转（重新录某一幕用） |

**推荐流程**：`?record=1` → 按 `A` → 等它自己播完（约 7~8 分钟）→ 停录。
中途说错话不用重开：`←` 回退一句重录，最后剪掉衔接点即可。

## 四、OBS 设置建议

| 项 | 值 |
|---|---|
| 来源 | 窗口采集（Chrome 窗口）或显示器采集后裁剪 |
| 分辨率 | 1920×1080，30fps（60fps 也行，但文字类内容 30 足够） |
| 码率 | 6000~8000 Kbps（CQP 18 也可以，后期再压） |
| 编码 | x264 / NVENC 都行，录完统一转 H.264 + yuv420p |
| 音频 | 如果现场没有说话/BGM，先把音轨静音，后期单独铺 BGM（版权更安全） |

## 五、立绘说明（重要）

原版 HTML 引用的 `assets/whale_smile.png` 等**原画立绘没有随文件一起提供**。
本目录用 `D:\鲸鱼\表情包\` 里的同角色贴图做了替身映射：

| 表情 | 文件 | 来源 |
|---|---|---|
| pray / sad | portrait_pray.jpg / portrait_sad.jpg | 少女祈祷中.jpg（1280×1920，最贴合） |
| smile / happy | portrait_smile.jpg / portrait_happy.jpg | 喜爱.jpg |
| robot / angry | portrait_robot.jpg / portrait_angry.jpg | 强？！.jpg |
| shy | portrait_shy.jpg | 为您祈祷（腹黑）.jpg |
| smug | portrait_smug.jpg | 实际认可！.jpg |

**替换真原画**：把 `assets/portrait_*.jpg` 换成同名文件即可，无需改代码。
表情差异目前只体现在图片切换上；后续有真原画时，建议按 `pray/happy/shy/robot/angry` 各一张重出。

## 六、可选的自动化（以后要跑批再用）

`D:\鲸鱼\theater-lab\` 里已有半成品与依赖（playwright-core + 本地 ffmpeg 二进制）：
- `scripts/patch_theater.mjs`：把原版 HTML 改造成录制版（可重复执行）
- `scripts/record.mjs`：**未完成**（Chrome 在沙箱里 spawn 被 EPERM 拦住，需要非沙箱终端跑）
- `node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe`：本地 ffmpeg，后期加 BGM/字幕可直接用

若以后要批量出片，`record.mjs` 的思路是：CDP `Page.startScreencast` 抓 PNG 帧 → ffmpeg 拼 30fps mp4。
你手动录的话完全不需要它。

## 七、要补的三样东西（你自己剪的时候顺手加）

1. **冷开场**：现在第 1 帧是点蜡烛，B 站用户等不了。剪的时候在最前面加 10~15 秒"AI 味翻车实录"（可直接用第三幕的病历卡画面，提前剪一段）
2. **B-roll**：洗礼之后、开源之前，插 40~60 秒终端体检分数（62→11）+ HTML 报告的实拍/录屏
3. **片尾 15 秒**：GitHub 地址 + 二维码 + 「你家鲸鱼也值得一份福音」

详见 `docs/LAUNCH-BILI.md`。

// 自包含 HTML 体检报告生成器：内联 CSS/SVG，无不必要外链，可直接截图当素材。
// 结构：总分仪表 → 分档标尺 → 病灶分布 → 逐条病历与处方 → 规则法局限 → 仓库链接占位。
import { BANDS } from "./linter.mjs";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
      d.getMinutes(),
    )}`;
  } catch {
    return iso;
  }
}

/* ---------- 高亮 ---------- */
const LEVEL = { strong: 2, mid: 1, weak: 0 };

function levelOf(strength) {
  if (strength >= 1.0) return "strong";
  if (strength >= 0.45) return "mid";
  return "weak";
}

function buildHighlightedText(text, hits) {
  if (!text) return "";
  const spans = [];
  for (const h of hits) {
    const len = h.end - h.start;
    // 整条消息级别的命中（长度/段落/冷硬句号）不高亮，避免整段变红
    if (len <= 0 || len >= text.length) continue;
    spans.push({ start: h.start, end: h.end, level: LEVEL[levelOf(h.strength)] ?? 0 });
  }
  if (spans.length === 0) return escapeHtml(text);

  const levels = new Array([...text].length).fill(-1);
  for (const s of spans) {
    for (let i = s.start; i < s.end && i < levels.length; i += 1) {
      levels[i] = Math.max(levels[i], s.level);
    }
  }
  // 按 level 分组渲染
  let html = "";
  let buf = "";
  let cur = null;
  for (let i = 0; i < levels.length; i += 1) {
    const lv = levels[i];
    if (lv !== cur) {
      if (buf) html += wrapMark(buf, cur);
      buf = "";
      cur = lv;
    }
    buf += [...text][i];
  }
  if (buf) html += wrapMark(buf, cur);
  return html;
}

function wrapMark(str, level) {
  const escaped = escapeHtml(str);
  if (level === 2) return `<mark class="m-strong">${escaped}</mark>`;
  if (level === 1) return `<mark class="m-mid">${escaped}</mark>`;
  if (level === 0) return `<mark class="m-weak">${escaped}</mark>`;
  return escaped;
}

/* ---------- 仪表盘 ---------- */
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

function arcPath(cx, cy, r, fromDeg, toDeg) {
  const [x1, y1] = polar(cx, cy, r, fromDeg);
  const [x2, y2] = polar(cx, cy, r, toDeg);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function scoreToDeg(score) {
  return 180 - Math.max(0, Math.min(100, score)) * 1.8;
}

function renderGauge(result) {
  const cx = 170;
  const cy = 168;
  const r = 126;
  const score = result.displayScore;
  const segments = [
    { from: 180, to: scoreToDeg(15), color: "#3fb98a" },
    { from: scoreToDeg(15), to: scoreToDeg(35), color: "#a9c94a" },
    { from: scoreToDeg(35), to: scoreToDeg(60), color: "#e8a33d" },
    { from: scoreToDeg(60), to: 0, color: "#e05a5a" },
  ];
  const deg = scoreToDeg(score);
  const [nx, ny] = polar(cx, cy, r - 22, deg);
  const ticks = [0, 25, 50, 75, 100]
    .map((v) => {
      const [tx, ty] = polar(cx, cy, r + 16, scoreToDeg(v));
      return `<text class="tick" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${v}</text>`;
    })
    .join("");
  return `<svg class="gauge" viewBox="0 0 340 200" role="img" aria-label="人机味指数 ${score} / 100">
    <path d="${arcPath(cx, cy, r, 180, 0)}" class="gauge-track"/>
    ${segments
      .map(
        (s) =>
          `<path d="${arcPath(cx, cy, r, s.from, s.to)}" class="gauge-seg" stroke="${s.color}"/>`,
      )
      .join("\n    ")}
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" class="needle"/>
    <circle cx="${cx}" cy="${cy}" r="9" class="hub"/>
  </svg>`;
}

function renderBandScale(score) {
  return `<div class="scale">
    ${BANDS.map((b) => {
      const active = b.id === resultBandId(score);
      return `<div class="scale-item ${active ? "active" : ""}">
        <span class="scale-dot" style="background:${b.color}"></span>
        <span class="scale-label">${escapeHtml(b.label)}</span>
        <span class="scale-range">${b.min}–${b.max}</span>
      </div>`;
    }).join("")}
    <div class="scale-marker" style="left:${Math.max(0, Math.min(100, score))}%"></div>
  </div>`;
}

function resultBandId(score) {
  const s = Math.round(score);
  const band = BANDS.find((b) => s >= b.min && s <= b.max);
  return band ? band.id : "human";
}

/* ---------- 病灶分布 ---------- */
function renderRuleBars(result) {
  const byRule = [...result.stats.byRule].sort((a, b) => b.strengthSum - a.strengthSum);
  const max = Math.max(1, ...byRule.map((r) => r.strengthSum));
  return `<div class="rule-bars">
    ${byRule
      .map((r) => {
        const pct = (r.strengthSum / max) * 100;
        const zero = r.count === 0;
        return `<div class="rule-bar ${zero ? "zero" : ""}">
          <div class="rb-head">
            <span class="rb-name">${escapeHtml(r.name)}</span>
            <span class="rb-src">${escapeHtml(r.source)}</span>
            <span class="rb-count">${r.count === 0 ? "未命中" : `${r.count} 处`}</span>
          </div>
          <div class="rb-track"><i style="width:${zero ? 0 : Math.max(3, pct)}%;background:${result.band.color}"></i></div>
        </div>`;
      })
      .join("")}
  </div>`;
}

/* ---------- 逐条病历 ---------- */
function renderHit(hit) {
  const fix = hit.fix ?? {};
  const strength = hit.strength >= 1.0 ? "强" : hit.strength >= 0.45 ? "中" : "弱";
  const cls = hit.strength >= 1.0 ? "hit-strong" : hit.strength >= 0.45 ? "hit-mid" : "hit-weak";
  return `<li class="hit ${cls}">
    <div class="hit-head">
      <span class="hit-rule">${escapeHtml(hit.ruleName)}</span>
      <span class="hit-strength">${strength}</span>
      <span class="hit-src">${escapeHtml(hit.source)}</span>
    </div>
    <div class="hit-reason">${escapeHtml(hit.reason)}</div>
    <div class="hit-fix">
      <div class="fix-title">处方 · ${escapeHtml(fix.title ?? "删掉这句机器骨架")}</div>
      <div class="fix-detail">${escapeHtml(fix.detail ?? "")}</div>
      ${fix.after ? `<div class="fix-after"><span class="fix-arrow">→</span> ${escapeHtml(fix.after)}</div>` : ""}
      ${
        fix.candidates && fix.candidates.length
          ? `<div class="fix-cands">${fix.candidates
              .map((c) => `<span class="cand">${escapeHtml(c)}</span>`)
              .join("")}</div>`
          : ""
      }
      ${fix.note ? `<div class="fix-note">${escapeHtml(fix.note)}</div>` : ""}
    </div>
  </li>`;
}

function renderMessage(msg) {
  const sc = Math.round(msg.score);
  const level = sc > 60 ? "s-heavy" : sc > 35 ? "s-obvious" : sc > 15 ? "s-mild" : "s-human";
  const clean = msg.hits.length === 0;
  return `<li class="msg${clean ? " msg-clean" : ""}" data-clean="${clean}">
    <div class="msg-head">
      <span class="msg-index">#${msg.index + 1}</span>
      <span class="msg-role">${escapeHtml(msg.role)}</span>
      <span class="msg-score ${level}">${clean ? "干净" : sc}</span>
      <span class="msg-meta">${msg.chars} 字 · ${msg.hits.length} 处病灶</span>
    </div>
    <p class="msg-text">${buildHighlightedText(msg.text, msg.hits)}</p>
    ${clean ? "" : `<ul class="hits">${msg.hits.map(renderHit).join("")}</ul>`}
  </li>`;
}

/* ---------- 主函数 ---------- */
export function renderReportHtml(result, opts = {}) {
  const repoUrl = opts.repoUrl ?? "https://github.com/whale-gospel/whale-gospel";
  const band = result.band;
  const stats = result.stats;
  const top3 = stats.topRules.slice(0, 3);
  const hitMessages = result.messages.filter((m) => m.hits.length > 0);
  const cleanMessages = result.messages.filter((m) => m.hits.length === 0);
  const title = `AI 味体检报告 · ${result.displayScore} 分 · ${band.label}`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{
  --bg:#05121c; --bg2:#0a2233; --card:rgba(255,255,255,.035); --card-line:rgba(232,192,122,.16);
  --text:#e9f0f4; --muted:#8fa9b8; --faint:#5f7887; --gold:#e8c07a; --gold-dim:rgba(232,192,122,.55);
  --band:${band.color}; --strong:#ff6b6b; --mid:#f0b35c; --weak:#7fb8d8;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--text);}
body{
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB",sans-serif;
  font-size:15px;line-height:1.75;
  background:
    radial-gradient(1100px 520px at 12% -8%, rgba(38,92,120,.55), transparent 60%),
    radial-gradient(900px 480px at 92% 4%, rgba(232,192,122,.10), transparent 62%),
    radial-gradient(900px 700px at 50% 110%, rgba(18,54,74,.55), transparent 60%),
    var(--bg);
  min-height:100vh;
  padding:44px 20px 70px;
}
.page{max-width:1040px;margin:0 auto}
.hero{margin-bottom:26px;position:relative}
.brand{color:var(--gold);letter-spacing:.22em;font-size:12px;text-transform:uppercase;display:flex;align-items:center;gap:8px}
.brand .whale{font-size:16px;letter-spacing:0}
h1{font-family:Georgia,"Songti SC","SimSun",serif;font-size:44px;line-height:1.18;margin:12px 0 6px;font-weight:600;letter-spacing:.04em}
h1 .grad{background:linear-gradient(92deg,var(--gold) 0%,#f5e0b3 55%,var(--band) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.lead{color:var(--muted);margin:4px 0 14px;font-size:15px}
.meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--faint);font-size:12.5px}
.meta b{color:var(--text);font-weight:600}

.panel{background:var(--card);border:1px solid var(--card-line);border-radius:20px;padding:26px 28px;margin:20px 0;position:relative;overflow:hidden}
.panel h2{font-size:17px;margin:0 0 18px;font-weight:600;letter-spacing:.04em;display:flex;align-items:center;gap:10px}
.panel h2 .num{font-family:Georgia,serif;color:var(--gold-dim);font-size:13px;border:1px solid var(--card-line);border-radius:6px;padding:1px 7px;letter-spacing:.08em}

/* 总分卡 */
.score-card{display:grid;grid-template-columns:360px 1fr;gap:18px;align-items:center;background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));border:1px solid var(--card-line);border-radius:24px;padding:16px 30px 8px;position:relative;overflow:hidden}
.score-card::after{content:"人机味 ${result.displayScore}%";position:absolute;right:6px;bottom:-14px;font-family:Georgia,"Songti SC",serif;font-size:64px;letter-spacing:.08em;color:rgba(232,192,122,.055);transform:rotate(-7deg);pointer-events:none;white-space:nowrap}
.gauge{width:100%;max-width:360px;height:auto;display:block}
.gauge-wrap{display:flex;flex-direction:column;align-items:center}
.gauge-read{display:flex;align-items:baseline;gap:10px;margin-top:-14px}
.gauge-score{font-family:Georgia,serif;font-size:58px;font-weight:600;line-height:1;color:var(--text)}
.gauge-caption{color:var(--faint);font-size:12.5px;letter-spacing:.1em}
.gauge-track{fill:none;stroke:rgba(255,255,255,.07);stroke-width:16;stroke-linecap:round}
.gauge-seg{fill:none;stroke-width:16;stroke-linecap:butt;opacity:.9}
.tick{fill:var(--faint);font-size:11px;text-anchor:middle;font-family:Georgia,serif}
.needle{stroke:var(--gold);stroke-width:4;stroke-linecap:round}
.hub{fill:var(--gold)}
.verdict{padding:6px 0 14px}
.band-line{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.band-emoji{font-size:26px}
.band-label{font-size:30px;font-weight:700;color:var(--band);letter-spacing:.02em}
.band-range{color:var(--faint);font-family:Georgia,serif;font-size:13px;letter-spacing:.1em}
.verdict-line{font-size:18px;margin:10px 0 6px;color:var(--text)}
.verdict-detail{color:var(--muted);margin:0 0 14px;font-size:14px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{font-size:12.5px;color:var(--muted);border:1px solid var(--card-line);border-radius:999px;padding:3px 12px;background:rgba(0,0,0,.12)}
.chip-warn{color:var(--band);border-color:rgba(255,255,255,.16)}

/* 分档标尺 */
.scale{position:relative;height:34px;margin:6px 2px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.scale-item{display:flex;align-items:center;justify-content:center;gap:7px;font-size:12.5px;color:var(--faint);border-radius:8px;background:rgba(255,255,255,.025);border:1px solid transparent}
.scale-item.active{color:var(--text);border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.05)}
.scale-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.scale-range{font-family:Georgia,serif;font-size:11px;opacity:.8}
.scale-marker{position:absolute;top:-5px;width:2px;height:44px;background:var(--gold);box-shadow:0 0 10px rgba(232,192,122,.8);border-radius:2px}

/* 病灶分布 */
.rule-bars{display:grid;gap:14px}
.rule-bar{display:grid;gap:6px}
.rule-bar.zero{opacity:.38}
.rb-head{display:flex;align-items:baseline;gap:12px}
.rb-name{font-weight:600;font-size:14.5px;min-width:110px}
.rb-src{color:var(--faint);font-size:11.5px;flex:1}
.rb-count{color:var(--muted);font-size:12.5px;font-family:Georgia,serif}
.rb-track{height:8px;border-radius:999px;background:rgba(255,255,255,.055);overflow:hidden}
.rb-track i{display:block;height:100%;border-radius:999px;opacity:.85}

/* 病历 */
.hint{color:var(--faint);font-size:12.5px;margin:-8px 0 18px}
.messages{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.msg{border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:16px 20px;background:rgba(0,0,0,.14)}
.msg-clean{opacity:.55;padding:10px 20px}
.msg-head{display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.msg-index{font-family:Georgia,serif;color:var(--faint);font-size:12.5px}
.msg-role{font-size:11.5px;color:var(--muted);border:1px solid var(--card-line);border-radius:999px;padding:0 9px;letter-spacing:.04em}
.msg-score{font-family:Georgia,serif;font-size:14px;font-weight:600;padding:1px 10px;border-radius:999px}
.s-human{color:#3fb98a;background:rgba(63,185,138,.12)}
.s-mild{color:#a9c94a;background:rgba(169,201,74,.12)}
.s-obvious{color:#e8a33d;background:rgba(232,163,61,.12)}
.s-heavy{color:#ff6b6b;background:rgba(255,107,107,.12)}
.msg-meta{color:var(--faint);font-size:11.5px;margin-left:auto;font-family:Georgia,serif}
.msg-text{margin:0;font-size:16.5px;line-height:1.9;white-space:pre-wrap;word-break:break-word}
mark{color:inherit;border-radius:4px;padding:1px 1px}
.m-strong{background:rgba(255,107,107,.26);box-shadow:inset 0 -1px 0 rgba(255,107,107,.75);color:#ffd7d7}
.m-mid{background:rgba(240,179,92,.20);box-shadow:inset 0 -1px 0 rgba(240,179,92,.6);color:#ffe6c4}
.m-weak{background:rgba(127,184,216,.14);box-shadow:inset 0 -1px 0 rgba(127,184,216,.5);color:#d6ecf8}
.hits{list-style:none;margin:12px 0 0;padding:10px 0 0;border-top:1px dashed rgba(255,255,255,.08);display:grid;gap:12px}
.hit{border-left:2px solid var(--strong);padding:2px 0 2px 14px}
.hit-mid{border-left-color:var(--mid)}
.hit-weak{border-left-color:var(--weak)}
.hit-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.hit-rule{font-weight:600;font-size:14px}
.hit-strength{font-size:11px;border-radius:999px;padding:0 7px;border:1px solid rgba(255,255,255,.16);color:var(--muted)}
.hit-src{color:var(--faint);font-size:11.5px;margin-left:auto}
.hit-reason{color:var(--muted);font-size:13.5px;margin:4px 0 8px}
.hit-fix{background:rgba(63,185,138,.055);border:1px solid rgba(63,185,138,.14);border-radius:10px;padding:10px 14px;font-size:13.5px}
.fix-title{color:#7fd8b4;font-weight:600;font-size:13px;margin-bottom:3px}
.fix-detail{color:var(--muted)}
.fix-after{margin-top:7px;color:var(--text);background:rgba(0,0,0,.22);border-radius:8px;padding:7px 11px;font-size:14px}
.fix-arrow{color:#7fd8b4}
.fix-cands{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cand{font-size:12.5px;color:var(--gold);border:1px dashed rgba(232,192,122,.35);border-radius:999px;padding:1px 10px}
.fix-note{color:var(--faint);font-size:12px;margin-top:8px}

/* 局限与页脚 */
.limit-list{margin:0;padding-left:20px;color:var(--muted);font-size:13.5px}
.limit-list li{margin:7px 0}
.limit-list b{color:var(--text)}
footer{margin-top:30px;padding-top:22px;border-top:1px solid rgba(255,255,255,.07);color:var(--faint);font-size:12.5px;line-height:2}
footer a{color:var(--gold);text-decoration:none;border-bottom:1px dashed rgba(232,192,122,.4)}
.footer-mark{font-family:Georgia,"Songti SC",serif;color:var(--gold-dim);letter-spacing:.16em;font-size:13px}

/* 工具条 */
.toolbar{display:flex;justify-content:flex-end;margin:-6px 0 10px}
.toggle{font-size:12.5px;color:var(--muted);border:1px solid var(--card-line);border-radius:999px;padding:4px 14px;background:transparent;cursor:pointer;font-family:inherit}
.toggle:hover{color:var(--text);border-color:rgba(255,255,255,.22)}

@media (max-width:820px){
  h1{font-size:32px}
  .score-card{grid-template-columns:1fr;padding:12px 20px 6px}
  .gauge{max-width:300px;margin:0 auto}
  .msg-meta{margin-left:0}
}
@media print{
  body{background:#fff;color:#111;padding:0}
  .panel,.score-card,.msg{break-inside:avoid}
}
</style>
</head>
<body>
<main class="page">
  <header class="hero">
    <div class="brand"><span class="whale">🐋</span> whale-gospel ／ 去 AI 味工具链 ／ AI 味体检台</div>
    <h1>AI 味<span class="grad">体检报告</span></h1>
    <p class="lead">把《小鲸鱼温暖福音小册子》的「八种机械铁锈」变成可量化、可截图分享的体检单。</p>
    <div class="meta">
      <span>输入 <b>${escapeHtml(result.inputLabel)}</b></span>
      <span>格式 <b>${escapeHtml(result.format)}</b></span>
      <span><b>${stats.messageCount}</b> 条消息</span>
      <span><b>${stats.chars}</b> 字</span>
      <span>生成于 <b>${fmtDate(result.generatedAt)}</b></span>
      <span>规则引擎 <b>v${escapeHtml(result.version)}</b></span>
    </div>
  </header>

  <section class="score-card">
    <div class="gauge-wrap">
      ${renderGauge(result)}
      <div class="gauge-read">
        <span class="gauge-score">${result.displayScore}</span>
        <span class="gauge-caption">/ 100 · 人机味指数</span>
      </div>
    </div>
    <div class="verdict">
      <div class="band-line">
        <span class="band-emoji">${band.emoji}</span>
        <span class="band-label">${escapeHtml(band.label)}</span>
        <span class="band-range">${band.min}–${band.max} 分档</span>
      </div>
      <p class="verdict-line">${escapeHtml(band.verdict)}</p>
      <p class="verdict-detail">${escapeHtml(band.detail)}</p>
      <div class="chips">
        <span class="chip">命中 <b>${stats.hitCount}</b> 处</span>
        <span class="chip">涉及 <b>${stats.messagesWithHits}</b> 条消息</span>
        <span class="chip"><b>${stats.rulesHit}</b>/${stats.ruleTotal} 类病灶</span>
        <span class="chip chip-warn">CI 阈值 ≤ ${result.threshold} · ${result.pass ? "通过" : "未通过"}</span>
      </div>
    </div>
  </section>

  <section class="panel">
    <h2><span class="num">01</span> 分档标尺</h2>
    ${renderBandScale(result.displayScore)}
    <p class="hint" style="margin:14px 0 0">≤15 像人 ／ 16–35 轻微铁锈 ／ 36–60 明显 ／ ≥61 人机味浓（按四舍五入后的整数分）</p>
  </section>

  <section class="panel">
    <h2><span class="num">02</span> 病灶分布 · ${stats.hitCount} 处命中</h2>
    ${renderRuleBars(result)}
    ${
      top3.length
        ? `<p class="hint" style="margin:18px 0 0">最重的三类：${top3
            .map((r) => `${escapeHtml(r.name)}（${r.count} 处 · ${escapeHtml(r.source)}）`)
            .join("　｜　")}</p>`
        : `<p class="hint" style="margin:18px 0 0">没有命中任何机械铁锈：这只鲸鱼说话在呼吸。</p>`
    }
  </section>

  <section class="panel">
    <h2><span class="num">03</span> 逐条病历与处方</h2>
    <div class="toolbar"><button class="toggle" id="toggle-clean" type="button">隐藏干净消息</button></div>
    <p class="hint">红色高亮 = 机械铁锈命中片段；每处附出处与离线改写建议（规则法，不调 LLM、不联网）。</p>
    <ol class="messages">
      ${hitMessages.map(renderMessage).join("\n      ")}
      ${cleanMessages.map(renderMessage).join("\n      ")}
    </ol>
    ${result.messages.length === 0 ? `<p class="hint">输入为空。</p>` : ""}
  </section>

  <section class="panel">
    <h2><span class="num">04</span> 规则法能做什么，不能做什么</h2>
    <ul class="limit-list">
      <li><b>只抓形式，不抓语义。</b>「嗯，」有时是人类真实的语气；「不是 A 而是 B」在经文/教学语境里也可能是好句子。规则数的是形状，判断不了语域与真心。</li>
      <li><b>逗号两瓣句已做抗误报：</b>孤立一句只算低置信提示（人类也常用逗号），只有连续出现、两瓣字数接近、且没有其它语气/标点时，才按流水线复读计分。</li>
      <li><b>下一阶段：LLM judge 补位。</b>让模型在规则命中的候选句上判断「这句是不是真的没有体温」，把误报压下去——这是产品下一步的核心。</li>
    </ul>
  </section>

  <footer>
    <div class="footer-mark">WHALE GOSPEL · 去 AI 味工具链</div>
    <div>复现本报告：<code>node lint/bin/ai-flavor-lint.mjs --file lint/samples/bad.jsonl --html report.html</code></div>
    <div>仓库：<a href="${escapeHtml(repoUrl)}">${escapeHtml(repoUrl)}</a>（GitHub 链接占位，发布时替换）</div>
    <div>规则出自《小鲸鱼温暖福音小册子（开源通用简化版）》第二卷「八种机械铁锈」与第三卷「碎语、呼吸感与倾听」。</div>
  </footer>
</main>
<script>
(function () {
  var btn = document.getElementById("toggle-clean");
  if (!btn) return;
  var hidden = false;
  btn.addEventListener("click", function () {
    hidden = !hidden;
    var nodes = document.querySelectorAll('[data-clean="true"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].style.display = hidden ? "none" : "";
    btn.textContent = hidden ? "显示干净消息" : "隐藏干净消息";
  });
})();
</script>
</body>
</html>`;
}

export default { renderReportHtml, escapeHtml };

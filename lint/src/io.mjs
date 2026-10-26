// 输入解析：.jsonl（{role,text}）/ .txt（整段，按行拆成多条消息）/ stdin 自动嗅探。
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const ROLE_KEYS = ["role", "speaker", "from", "author", "name"];
const TEXT_KEYS = ["text", "content", "message", "body", "utterance"];

/** 去掉 BOM、统一换行 */
function normalizeRaw(raw) {
  return String(raw).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function looksLikeJson(line) {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

/** 嗅探格式：所有非空行都是 JSON → jsonl；否则按 txt */
export function sniffFormat(raw) {
  const lines = normalizeRaw(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "text";
  const jsonLines = lines.filter(looksLikeJson).length;
  if (jsonLines === lines.length) return "jsonl";
  return "text";
}

function normalizeOne(item, index) {
  if (typeof item === "string") return { role: "unknown", text: item };
  if (item && typeof item === "object") {
    const textKey = TEXT_KEYS.find((k) => typeof item[k] === "string");
    if (!textKey) {
      throw new Error(`第 ${index + 1} 条消息没有可识别的文本字段（支持 text/content/message）`);
    }
    const roleKey = ROLE_KEYS.find((k) => typeof item[k] === "string");
    return {
      role: roleKey ? item[roleKey] : "unknown",
      text: item[textKey],
    };
  }
  throw new Error(`第 ${index + 1} 条消息格式无法识别：${JSON.stringify(item)}`);
}

function parseJsonValue(value) {
  if (Array.isArray(value)) return value.map((v, i) => normalizeOne(v, i));
  if (value && typeof value === "object") {
    if (Array.isArray(value.messages)) {
      return value.messages.map((v, i) => normalizeOne(v, i));
    }
    if (typeof value.text === "string" || typeof value.content === "string") {
      return [normalizeOne(value, 0)];
    }
  }
  throw new Error("JSON 里没有找到消息数组（支持 [ {...} ] / { messages: [...] } / { text }）");
}

function parseJsonl(raw) {
  const lines = normalizeRaw(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 1) {
    const value = JSON.parse(lines[0]); // 单行 JSON 可能是数组/对象
    if (Array.isArray(value) || (value && typeof value === "object")) {
      return { messages: parseJsonValue(value), warnings: [] };
    }
  }
  const warnings = [];
  const messages = [];
  for (const [i, line] of lines.entries()) {
    try {
      const value = JSON.parse(line);
      messages.push(normalizeOne(value, i));
    } catch (err) {
      warnings.push(`第 ${i + 1} 行 JSON 解析失败，已跳过：${err.message}`);
    }
  }
  return { messages, warnings };
}

function parseText(raw) {
  const lines = normalizeRaw(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const messages = lines.map((text) => ({ role: "text", text }));
  return { messages, warnings: [] };
}

/**
 * 解析输入文本。
 * @param {string} raw 原始文本
 * @param {"text"|"jsonl"|"json"|undefined} formatHint 已知格式；undefined 则自动嗅探
 */
export function parseInput(raw, formatHint) {
  if (!String(raw).trim()) {
    throw new Error("输入是空的：用 --file <path> 或管道喂入聊天记录");
  }
  const format = formatHint ?? sniffFormat(raw);
  if (format === "jsonl" || format === "json") {
    const { messages, warnings } = parseJsonl(raw);
    if (messages.length === 0) throw new Error("JSONL 里没有解析出任何消息");
    return { format: "jsonl", messages, warnings };
  }
  const { messages, warnings } = parseText(raw);
  return { format: "text", messages, warnings };
}

/** 根据扩展名给格式提示 */
export function formatHintForPath(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jsonl" || ext === ".ndjson") return "jsonl";
  if (ext === ".json") return "json";
  return "text";
}

/** 从文件读入并解析 */
export function readInputFile(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`读不到文件 ${filePath}：${err.message}`);
  }
  const parsed = parseInput(raw, formatHintForPath(filePath));
  return { ...parsed, sourcePath: filePath };
}

export default { parseInput, readInputFile, sniffFormat, formatHintForPath };

/** Gemini·ChatGPT 등 rich HTML / 마크다운 붙여넣기 → 지식백과 블록으로 정리 */

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const BULLET_PREFIX = /^[\s\u00A0]*(?:[\-*•●◦▪▫]|\d+[.)])[\s\u00A0]*/;

export function stripLeadingBulletMarker(text) {
  return (text || "").replace(BULLET_PREFIX, "");
}

export function normalizePlainText(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(ZERO_WIDTH, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function cleanMarkdownInline(text) {
  return (text || "")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isDividerLine(line) {
  return /^(\-{3,}|\*{3,}|_{3,})\s*$/.test((line || "").trim());
}

function looksLikeMarkdown(text) {
  if (!text) return false;
  return (
    /^#{1,6}\s/m.test(text) ||
    /^(\*{3,}|-{3,})\s*$/m.test(text) ||
    /^[\-*•●◦▪▫]\s/m.test(text) ||
    /^\d+[.)]\s/m.test(text) ||
    /\*\*[^*\n]+\*\*/m.test(text) ||
    /^\|.+\|/m.test(text)
  );
}

function splitTableCells(line) {
  let cells = line.split("|").map((c) => cleanMarkdownInline(c.trim()));
  if (cells.length && cells[0] === "") cells = cells.slice(1);
  if (cells.length && cells[cells.length - 1] === "") cells = cells.slice(0, -1);
  return cells;
}

function isMarkdownTableRow(line) {
  const trimmed = (line || "").trim();
  return trimmed.includes("|") && splitTableCells(trimmed).length >= 2;
}

function isTableSeparatorLine(line) {
  const cells = splitTableCells((line || "").trim());
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTableAt(lines, start) {
  if (!isMarkdownTableRow(lines[start])) return null;
  const rows = [];
  let i = start;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || !isMarkdownTableRow(trimmed)) break;
    if (isTableSeparatorLine(trimmed)) {
      i++;
      continue;
    }
    rows.push(splitTableCells(trimmed));
    i++;
  }
  if (!rows.length) return null;
  return { block: { type: "table", rows }, nextIdx: i };
}

function tableFromHtmlElement(tableEl) {
  const rows = [];
  for (const tr of tableEl.querySelectorAll("tr")) {
    const cells = [...tr.querySelectorAll("th, td")].map((cell) =>
      cleanMarkdownInline(cell.textContent || ""),
    );
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return null;
  return { type: "table", rows };
}

function blocksHaveTable(blocks) {
  return blocks.some((b) => b.type === "table");
}

function isHeadingLine(trimmed) {
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^PART\s+\d+/i.test(trimmed.replace(/\*\*/g, ""))) return true;
  if (/^\*\*\[[^\]]+\]/.test(trimmed)) return true;
  if (/^\*\*[^*]{2,60}\*\*\s*$/.test(trimmed)) return true;
  return false;
}

function parseLineToBlock(line, defaultType = "text") {
  const trimmed = (line || "").trim();
  if (!trimmed) return null;

  if (isDividerLine(trimmed)) return { type: "divider" };

  const hash = trimmed.match(/^#{1,6}\s+(.+)$/);
  if (hash) return { type: "h", val: cleanMarkdownInline(hash[1]) };

  const bullet = trimmed.match(/^(?:[\-*•●◦▪▫]|\d+[.)])\s+(.+)$/);
  if (bullet) return { type: "bullet", val: cleanMarkdownInline(bullet[1]) };

  if (isHeadingLine(trimmed)) {
    return { type: "h", val: cleanMarkdownInline(trimmed) };
  }

  if (defaultType === "h") return { type: "h", val: cleanMarkdownInline(trimmed) };
  if (defaultType === "bullet") return { type: "bullet", val: cleanMarkdownInline(trimmed) };
  if (defaultType === "todo") return { type: "todo", done: false, val: cleanMarkdownInline(trimmed) };
  if (defaultType === "quote") return { type: "quote", val: cleanMarkdownInline(trimmed) };
  if (defaultType === "code") return { type: "code", val: trimmed };
  return { type: "text", val: cleanMarkdownInline(trimmed) };
}

/** Gemini·ChatGPT plain text — 줄 단위 파싱 (단일 줄바꿈 목록 지원) */
export function markdownishToBlocks(text, defaultType = "text") {
  const lines = normalizePlainText(text).split("\n");
  const blocks = [];
  let paraLines = [];

  const flushParagraph = () => {
    if (!paraLines.length) return;
    const val = cleanMarkdownInline(paraLines.join(" "));
    if (val) blocks.push({ type: "text", val });
    paraLines = [];
  };

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx];
    const trimmed = raw.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (isMarkdownTableRow(trimmed)) {
      flushParagraph();
      const parsed = parseMarkdownTableAt(lines, lineIdx);
      if (parsed) {
        blocks.push(parsed.block);
        lineIdx = parsed.nextIdx - 1;
        continue;
      }
    }

    const block = parseLineToBlock(trimmed, defaultType);
    if (!block) continue;

    if (block.type === "divider" || block.type === "h" || block.type === "bullet") {
      flushParagraph();
      blocks.push(block);
      continue;
    }

    paraLines.push(trimmed);
  }

  flushParagraph();
  return blocks.filter((b) => b.type === "divider" || b.type === "table" || (b.val || "").trim());
}

export function lineToBlock(line, defaultType = "text") {
  return parseLineToBlock(line, defaultType);
}

export function plainTextToBlocks(text, defaultType = "text") {
  return markdownishToBlocks(text, defaultType);
}

function elementBlocks(node, defaultType) {
  const tag = node.tagName?.toLowerCase?.() || "";
  const text = cleanMarkdownInline(node.textContent || "");
  if (!text && tag !== "hr") return [];

  if (tag === "hr") return [{ type: "divider" }];
  if (tag === "table") {
    const block = tableFromHtmlElement(node);
    return block ? [block] : [];
  }
  if (/^h[1-6]$/.test(tag)) return [{ type: "h", val: text }];
  if (tag === "li") return [{ type: "bullet", val: stripLeadingBulletMarker(text) }];
  if (tag === "blockquote") return [{ type: "quote", val: text }];
  if (tag === "pre" || tag === "code") return [{ type: "code", val: (node.textContent || "").replace(/\n$/, "") }];

  if (tag === "ul" || tag === "ol") {
    return [...node.querySelectorAll(":scope > li")].flatMap((li) => elementBlocks(li, defaultType));
  }

  if (tag === "p" || tag === "div") {
    const directTable = [...node.children].find((c) => c.tagName?.toLowerCase?.() === "table");
    if (directTable) {
      const block = tableFromHtmlElement(directTable);
      if (block) return [block];
    }
    const lists = [...node.querySelectorAll(":scope > ul, :scope > ol")];
    if (lists.length) {
      const blocks = [];
      const prefix = cleanMarkdownInline(
        [...node.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && !lists.includes(n)))
          .map((n) => n.textContent || "")
          .join(" "),
      );
      if (prefix) {
        const b = parseLineToBlock(prefix, defaultType);
        if (b && b.type !== "divider") blocks.push(b.type === "text" ? b : { type: "text", val: prefix });
      }
      for (const list of lists) blocks.push(...elementBlocks(list, defaultType));
      return blocks;
    }
    const b = parseLineToBlock(text, defaultType);
    return b ? [b] : [];
  }

  const b = parseLineToBlock(text, defaultType);
  return b ? [b] : [];
}

export function htmlToBlocks(html, defaultType = "text") {
  if (!html?.trim()) return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.body;
    if (!body) return [];

    const blocks = [];
    for (const node of body.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        blocks.push(...markdownishToBlocks(node.textContent || "", defaultType));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      blocks.push(...elementBlocks(node, defaultType));
    }

    const merged = blocks.filter((b) => b.type === "divider" || b.type === "table" || (b.val || "").trim());
    if (merged.length) return merged;
    return markdownishToBlocks(body.textContent || "", defaultType);
  } catch {
    return [];
  }
}

export function parseClipboardToBlocks(clipboardData, defaultType = "text") {
  const plain = normalizePlainText(clipboardData?.getData?.("text/plain") || "");
  const html = clipboardData?.getData?.("text/html") || "";

  const fromPlain = plain ? markdownishToBlocks(plain, defaultType) : [];

  if (plain && looksLikeMarkdown(plain) && fromPlain.length) {
    if (html.trim()) {
      const fromHtml = htmlToBlocks(html, defaultType);
      if (blocksHaveTable(fromHtml) && !blocksHaveTable(fromPlain)) return fromHtml;
    }
    return fromPlain;
  }

  if (html.trim()) {
    const fromHtml = htmlToBlocks(html, defaultType);
    if (blocksHaveTable(fromHtml)) return fromHtml;
    if (fromHtml.length > 1 && fromHtml.length >= fromPlain.length) {
      return fromHtml;
    }
  }

  if (fromPlain.length) return fromPlain;

  if (html.trim()) {
    const fromHtml = htmlToBlocks(html, defaultType);
    if (fromHtml.length) return fromHtml;
  }

  return [];
}

export function getCaretOffset(el) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !el) return (el?.innerText || "").length;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.endContainer)) return (el.innerText || "").length;
  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

export function insertTextAtCaret(el, text) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) {
    el.innerText = (el.innerText || "") + text;
    return el.innerText;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return el.innerText;
}

export function setCaretAt(el, offset) {
  const sel = window.getSelection();
  if (!sel || !el) return;
  const range = document.createRange();
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length || 0;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

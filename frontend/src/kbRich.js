/** 지식백과 인라인 서식 — contentEditable 블록의 rich text(HTML) 처리
 *  val 값은 아래 화이트리스트 태그만 허용하는 인라인 HTML 로 저장한다.
 *  (레거시 데이터는 평문 → 태그가 없으면 textContent 로 그대로 렌더) */

// 허용 태그와 정규화 매핑 (strong→b, em→i, strike→s)
const TAG_MAP = { strong: "b", em: "i", strike: "s", b: "b", i: "i", u: "u", s: "s", mark: "mark", code: "code", a: "a" };
const BLOCK_TAGS = new Set(["div", "p", "li", "ul", "ol", "h1", "h2", "h3", "h4", "blockquote", "pre"]);
const DROP_TAGS = new Set(["script", "style", "noscript", "iframe", "object", "embed", "template", "head"]);
const INLINE_TAG_RE = /<(b|strong|i|em|u|s|strike|mark|code|a|br)\b/i;

/** 문자열에 우리가 허용하는 인라인 태그(줄바꿈 포함)가 들어있는지 */
export function hasInlineHtml(val) {
  return typeof val === "string" && INLINE_TAG_RE.test(val);
}

function safeHref(raw) {
  const href = (raw || "").trim();
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  if (/^\/\//.test(href)) return "https:" + href;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(href)) return "mailto:" + href;
  if (/^www\./i.test(href)) return "https://" + href;
  if (/^[a-z][\w.-]*\.[a-z]{2,}(\/|$)/i.test(href)) return "https://" + href;
  return null;
}

function appendBreak(out) {
  if (!out.lastChild) return;
  if (out.lastChild.nodeType === Node.ELEMENT_NODE && out.lastChild.tagName === "BR") return;
  out.appendChild(document.createElement("br"));
}

function sanitizeNode(node, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(document.createTextNode(child.textContent.replace(/\n+/g, " ")));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) continue; // 태그·내용 모두 제거
    if (tag === "br") {
      out.appendChild(document.createElement("br"));
      continue;
    }
    const mapped = TAG_MAP[tag];
    if (!mapped) {
      // 허용 안 된 태그 → 자식만 이어붙임. 블록 태그는 줄바꿈으로 분리.
      if (BLOCK_TAGS.has(tag)) appendBreak(out);
      sanitizeNode(child, out);
      continue;
    }
    if (mapped === "a") {
      const href = safeHref(child.getAttribute("href"));
      if (!href) {
        sanitizeNode(child, out);
        continue;
      }
      const a = document.createElement("a");
      a.setAttribute("href", href);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      sanitizeNode(child, a);
      out.appendChild(a);
      continue;
    }
    const el = document.createElement(mapped);
    sanitizeNode(child, el);
    // 빈 서식 태그는 버림
    if (el.textContent) out.appendChild(el);
    else out.appendChild(document.createTextNode(el.textContent || ""));
  }
}

/** 화이트리스트 밖 태그/속성 제거, 단일 라인 인라인 HTML 로 정규화 */
export function sanitizeInline(html) {
  if (!html) return "";
  const src = document.createElement("div");
  src.innerHTML = String(html).replace(/ /g, " ");
  const out = document.createElement("div");
  sanitizeNode(src, out);
  // 끝에 남은 빈 줄바꿈 제거
  while (out.lastChild && out.lastChild.nodeType === Node.ELEMENT_NODE && out.lastChild.tagName === "BR") {
    out.removeChild(out.lastChild);
  }
  return out.innerHTML.replace(/[ \t]+$/g, "");
}

/** rich val → 검색·요약용 평문 */
export function richToText(val) {
  if (!val) return "";
  if (!hasInlineHtml(val)) return val;
  const el = document.createElement("div");
  el.innerHTML = String(val).replace(/<br\s*\/?>/gi, "\n");
  return el.textContent || "";
}

/** contentEditable 요소에 값 주입 (레거시 평문은 textContent 로 안전하게) */
export function seedEditable(el, val) {
  if (!el) return;
  const v = val || "";
  if (hasInlineHtml(v)) {
    const html = sanitizeInline(v);
    if (el.innerHTML !== html) el.innerHTML = html;
  } else if (el.textContent !== v) {
    el.textContent = v;
  }
}

/** 현재 편집 중 요소의 정규화된 HTML 읽기 (평문이면 태그 없이 반환) */
export function readEditableHtml(el) {
  if (!el) return "";
  const html = sanitizeInline(el.innerHTML);
  // 태그가 전혀 없으면 순수 텍스트로 저장 (레거시 호환·검색 단순화)
  return hasInlineHtml(html) ? html : (el.textContent || "");
}

function selectionInside(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.commonAncestorContainer)) return null;
  return { sel, range };
}

function closestTag(node, tag, root) {
  let n = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName.toLowerCase() === tag) return n;
    n = n.parentNode;
  }
  return null;
}

function unwrap(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function toggleWrap(root, tag, attrs) {
  const ctx = selectionInside(root);
  if (!ctx) return;
  const { sel, range } = ctx;
  if (range.collapsed) return;
  const existing = closestTag(range.commonAncestorContainer, tag, root);
  if (existing) {
    unwrap(existing);
    return;
  }
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  try {
    range.surroundContents(el);
  } catch {
    const frag = range.extractContents();
    el.appendChild(frag);
    range.insertNode(el);
  }
  const nr = document.createRange();
  nr.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(nr);
}

/** 포커스된 editable 요소(root)에 서식 적용. 적용 후 caller 가 innerHTML 을 다시 읽어 저장한다. */
export function applyInlineFormat(root, kind) {
  if (!root) return;
  root.focus();
  try {
    document.execCommand("styleWithCSS", false, false);
  } catch {
    /* ignore */
  }
  switch (kind) {
    case "bold":
      document.execCommand("bold");
      break;
    case "italic":
      document.execCommand("italic");
      break;
    case "underline":
      document.execCommand("underline");
      break;
    case "strike":
      document.execCommand("strikeThrough");
      break;
    case "highlight":
      toggleWrap(root, "mark");
      break;
    case "code":
      toggleWrap(root, "code");
      break;
    case "link": {
      const ctx = selectionInside(root);
      if (!ctx || ctx.range.collapsed) return;
      const existing = closestTag(ctx.range.commonAncestorContainer, "a", root);
      if (existing) {
        unwrap(existing);
        break;
      }
      const url = window.prompt("링크 URL 을 입력하세요", "https://");
      const href = url && safeHref(url);
      if (!href) return;
      toggleWrap(root, "a", { href, target: "_blank", rel: "noopener noreferrer" });
      break;
    }
    case "clear":
      document.execCommand("removeFormat");
      break;
    default:
      break;
  }
}

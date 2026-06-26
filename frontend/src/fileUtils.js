export function fileNameFromKey(key) {
  if (!key) return "첨부파일";
  const name = key.split("/").pop() || "첨부파일";
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function fileKindFromName(name = "", mime = "") {
  const lower = String(name).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|heic|bmp|svg)$/i.test(lower) || mime.startsWith("image/")) return "image";
  if (/\.pdf$/i.test(lower) || mime === "application/pdf") return "pdf";
  if (/\.(xlsx|xls|csv|ods)$/i.test(lower) || mime.includes("spreadsheet") || mime.includes("excel")) return "sheet";
  if (/\.(doc|docx|ppt|pptx|hwp|hwpx)$/i.test(lower)) return "office";
  if (/\.(mp4|mov|webm|m4v)$/i.test(lower) || mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

export function canPreviewInApp(name = "", mime = "") {
  const kind = fileKindFromName(name, mime);
  return kind === "image" || kind === "pdf" || kind === "sheet";
}

export function openFileViewerRequest(detail) {
  window.dispatchEvent(new CustomEvent("storyahub-open-file", { detail }));
}

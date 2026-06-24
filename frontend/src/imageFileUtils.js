const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i;

export function mimeFromImageFilename(name) {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    gif: "image/gif",
    bmp: "image/bmp",
  };
  return map[ext] || null;
}

export function isImageFile(file) {
  if (!file) return false;
  if (file.type?.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name || "");
}

export function normalizeImageFile(file) {
  if (!isImageFile(file)) return null;
  const name = file.name || `photo-${Date.now()}.jpg`;
  const type = file.type?.startsWith("image/") ? file.type : mimeFromImageFilename(name) || "image/jpeg";
  if (file.type === type && file.name) return file;
  return new File([file], name, { type, lastModified: file.lastModified || Date.now() });
}

function loadImageWithTimeout(file, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 시간 초과"));
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 불러올 수 없습니다"));
    };
    img.src = url;
  });
}

/** iOS HEIC·빈 MIME → JPEG 변환 (OCR·업로드 호환) */
export async function prepareImageForOcr(file) {
  const normalized = normalizeImageFile(file);
  if (!normalized) throw new Error("이미지 파일만 선택할 수 있습니다");

  if (normalized.type === "image/jpeg" || normalized.type === "image/png") {
    try {
      await loadImageWithTimeout(normalized, 8000);
      return normalized;
    } catch {
      /* fall through to canvas convert */
    }
  }

  try {
    const img = await loadImageWithTimeout(normalized, 12000);
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("이미지 변환 실패");
    const base = (normalized.name || "photo.jpg").replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    if (normalized.type === "image/jpeg") return normalized;
    throw new Error(e.message || "iPhone 사진 형식을 처리할 수 없습니다. JPEG로 다시 시도해주세요.");
  }
}

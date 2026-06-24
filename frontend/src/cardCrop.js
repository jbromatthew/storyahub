/** 명함 사진에서 배경을 제거하고 카드 영역만 자동 크롭 */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const timer = window.setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 로드 시간 초과"));
    }, 12000);
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

function sampleBackground(data, w, h) {
  const pts = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
    [Math.floor(w / 2), 0],
    [0, Math.floor(h / 2)],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of pts) {
    const i = (y * w + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = pts.length;
  return { r: r / n, g: g / n, b: b / n };
}

function isContentPixel(data, w, x, y, bg, threshold) {
  const i = (y * w + x) * 4;
  const dr = Math.abs(data[i] - bg.r);
  const dg = Math.abs(data[i + 1] - bg.g);
  const db = Math.abs(data[i + 2] - bg.b);
  return dr + dg + db > threshold;
}

/**
 * @param {File|Blob} file
 * @returns {Promise<File>}
 */
export async function autoCropBusinessCard(file) {
  if (!file) return file;
  const mime = file.type || "";
  if (mime && !mime.startsWith("image/")) return file;

  try {
    const img = await loadImage(file);
    const maxDim = 1400;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const bg = sampleBackground(data, w, h);
    const threshold = 28;
    const step = Math.max(1, Math.floor(Math.min(w, h) / 180));

    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let hits = 0;

    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        if (isContentPixel(data, w, x, y, bg, threshold)) {
          hits++;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (hits < 8 || maxX <= minX || maxY <= minY) return file;

    const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.015);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW < w * 0.15 || cropH < h * 0.15) return file;

    const out = document.createElement("canvas");
    out.width = cropW;
    out.height = cropH;
    out.getContext("2d").drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve) => out.toBlob(resolve, mime, 0.92));
    if (!blob) return file;
    const name = file.name || `card-${Date.now()}.jpg`;
    return new File([blob], name, { type: mime });
  } catch {
    return file;
  }
}

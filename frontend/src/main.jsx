import React from "react";
import { createRoot } from "react-dom/client";
import ErpApp from "./erp/ErpApp.jsx";
import App from "./App.jsx";
import SiteUploadPage from "./SiteUploadPage.jsx";
import IotQuotePage from "./IotQuotePage.jsx";
import VendorPortalPage from "./VendorPortalPage.jsx";
import SurveyPage from "./SurveyPage.jsx";
import SettlePage from "./SettlePage.jsx";
import "./index.css";

const ERP_MODE = import.meta.env.VITE_ERP_MODE === "true" || import.meta.env.VITE_ERP_MODE === "1";

/**
 * 배포 중에 열려 있던 탭은 옛 청크를 찾다가 실패한다 (PDF 다운로드 등 지연 로딩).
 * 그때 새 index.html을 받도록 한 번만 새로고침한다. 무한 새로고침을 막으려고
 * 세션당 한 번으로 제한한다.
 */
const RELOADED = "storyahub_chunk_reloaded";
function recoverFromStaleChunk(detail) {
  if (sessionStorage.getItem(RELOADED)) return;
  sessionStorage.setItem(RELOADED, "1");
  console.warn("[chunk] 옛 파일을 찾지 못해 새로고침합니다", detail);
  window.location.reload();
}
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  recoverFromStaleChunk(e.payload?.message);
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = String(e.reason?.message ?? e.reason ?? "");
  if (/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg)) {
    recoverFromStaleChunk(msg);
  }
});
// 새로고침으로 정상 진입했으면 표시를 지운다 — 다음에 또 필요할 수 있다
window.addEventListener("load", () => {
  setTimeout(() => sessionStorage.removeItem(RELOADED), 5000);
});

/**
 * 위 복구는 옛 청크를 실제로 찾아 나설 때만 걸린다. 화면을 하루 종일 열어두면
 * 필요한 파일이 이미 다 로드돼 있어서, 그 사이 배포된 새 기능이 보이지 않는데도
 * 아무 신호가 없다. index.html의 번들 이름이 바뀌었는지 이따금 확인해 알린다.
 */
const bundleName = (html) => (html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/) || [])[1] || "";
const myBundle = bundleName(
  document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute("src") || ""
);
let updateShown = false;
function showUpdateBar() {
  if (updateShown) return;
  updateShown = true;
  const bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.style.cssText =
    "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;" +
    "display:flex;align-items:center;gap:12px;background:#15171B;color:#fff;" +
    "font:600 13px/1.4 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;" +
    "padding:11px 12px 11px 18px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.28)";
  const msg = document.createElement("span");
  msg.textContent = "새 버전이 배포되었습니다";
  const go = document.createElement("button");
  go.textContent = "새로고침";
  go.style.cssText =
    "background:#FA6400;color:#fff;border:0;border-radius:999px;padding:7px 15px;" +
    "font:inherit;font-weight:800;cursor:pointer";
  go.onclick = () => window.location.reload();
  const no = document.createElement("button");
  no.textContent = "나중에";
  no.style.cssText =
    "background:none;color:#A8ADB6;border:0;padding:7px 6px;font:inherit;cursor:pointer";
  no.onclick = () => bar.remove();
  bar.append(msg, go, no);
  document.body.appendChild(bar);
}
async function checkForUpdate() {
  if (updateShown || !myBundle || document.hidden) return;
  try {
    const r = await fetch(`/index.html?_=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const fresh = bundleName(await r.text());
    if (fresh && fresh !== myBundle) showUpdateBar();
  } catch {
    /* 오프라인이면 다음 기회에 */
  }
}
if (myBundle) {
  setInterval(checkForUpdate, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkForUpdate();
  });
}

// 무계정 공개 페이지: /?upload=<token> (현장 사진), /?iot=1 (IoT 견적내기), /?vendor=kreiser (협력사 발주 포털), /?survey=<token> (설치팀 실사 입력)
const params = new URLSearchParams(window.location.search);
const uploadToken = params.get("upload");
const iotMode = params.has("iot");
const vendorId = params.get("vendor");
const surveyToken = params.get("survey");
const settleToken = params.get("settle");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {uploadToken ? <SiteUploadPage token={uploadToken} /> : iotMode ? <IotQuotePage /> : vendorId ? <VendorPortalPage vendorId={vendorId} /> : surveyToken ? <SurveyPage token={surveyToken} /> : settleToken ? <SettlePage token={settleToken} /> : ERP_MODE ? <ErpApp /> : <App />}
  </React.StrictMode>
);

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

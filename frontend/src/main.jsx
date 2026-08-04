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

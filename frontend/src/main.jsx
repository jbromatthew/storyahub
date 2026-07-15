import React from "react";
import { createRoot } from "react-dom/client";
import ErpApp from "./erp/ErpApp.jsx";
import App from "./App.jsx";
import SiteUploadPage from "./SiteUploadPage.jsx";
import "./index.css";

const ERP_MODE = import.meta.env.VITE_ERP_MODE === "true" || import.meta.env.VITE_ERP_MODE === "1";

// 무계정 현장 사진 업로드 공개 페이지: /?upload=<token>
const uploadToken = new URLSearchParams(window.location.search).get("upload");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {uploadToken ? <SiteUploadPage token={uploadToken} /> : ERP_MODE ? <ErpApp /> : <App />}
  </React.StrictMode>
);

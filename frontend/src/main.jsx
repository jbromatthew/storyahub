import React from "react";
import { createRoot } from "react-dom/client";
import ErpApp from "./erp/ErpApp.jsx";
import App from "./App.jsx";
import "./index.css";

const ERP_MODE = import.meta.env.VITE_ERP_MODE === "true" || import.meta.env.VITE_ERP_MODE === "1";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {ERP_MODE ? <ErpApp /> : <App />}
  </React.StrictMode>
);

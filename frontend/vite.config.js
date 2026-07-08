import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA: "홈 화면에 추가"로 설치되는 웹앱.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const erpMode = env.VITE_ERP_MODE === "true" || env.VITE_ERP_MODE === "1";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: erpMode ? "ERP" : "Storyahub",
          short_name: erpMode ? "ERP" : "Storyahub",
          description: erpMode ? "지식경영 · 회의록 · OKR" : "녹음하면 알아서 정리되는 AI 비서",
          theme_color: "#FF5722",
          background_color: "#FFFFFF",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
            { src: "/favicon-16.png", sizes: "16x16", type: "image/png" },
            { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          ]
        }
      })
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/health": "http://localhost:4000",
        "/auth": "http://localhost:4000",
        "/bootstrap": "http://localhost:4000",
        "/contacts": "http://localhost:4000",
        "/meetings": "http://localhost:4000",
        "/todos": "http://localhost:4000",
        "/deals": "http://localhost:4000",
        "/calendar": "http://localhost:4000",
        "/kb": "http://localhost:4000",
        "/uploads": "http://localhost:4000",
        "/places": "http://localhost:4000",
        "/ocr": "http://localhost:4000",
      },
    },
  };
});

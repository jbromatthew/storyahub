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
        // 등록은 main.jsx 에서 직접 한다 — 새 것이 올라오면 스스로 갈아끼우게 하려고.
        // 홈 화면에 담아 쓰는 기기(아이패드 등)는 앱을 완전히 끄는 일이 드물어
        // 그냥 두면 옛 화면을 오래 들고 있는다.
        injectRegister: null,
        // 스마트상점 공개 가이드는 용량이 커서(수백KB) 서비스워커 프리캐시 대상에서 제외
        workbox: {
          // 정적 공개 페이지는 서비스 워커가 가로채면 안 된다 — ERP index.html이 대신 뜬다
          globIgnores: ["**/smartstore/**", "**/founders/**"],
          navigateFallbackDenylist: [/^\/smartstore\//, /^\/founders\//],
        },
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

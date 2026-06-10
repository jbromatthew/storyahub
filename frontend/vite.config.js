import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA: "홈 화면에 추가"로 설치되는 웹앱.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Storyahub",
        short_name: "Storyahub",
        description: "녹음하면 알아서 정리되는 AI 비서",
        theme_color: "#DD5E39",
        background_color: "#F7F4EE",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      }
    })
  ],
  server: { port: 5173 }
});

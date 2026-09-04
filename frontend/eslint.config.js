/**
 * 빌드가 잡아주지 못하는 것만 본다 — 선언 없이 쓰는 변수(no-undef).
 *
 * FoundersView의 `kind`가 다른 컴포넌트에 잘못 선언돼 화면이 통째로 죽은 적이 있다.
 * vite 빌드는 통과했고 브라우저에서야 ReferenceError가 났다. 스타일 규칙은 켜지 않는다.
 */
export default [
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly",
        location: "readonly", localStorage: "readonly", sessionStorage: "readonly",
        fetch: "readonly", Blob: "readonly", File: "readonly", FileReader: "readonly",
        FormData: "readonly", URL: "readonly", URLSearchParams: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        console: "readonly", alert: "readonly", confirm: "readonly", prompt: "readonly",
        Image: "readonly", Audio: "readonly", MediaRecorder: "readonly",
        AbortController: "readonly", CustomEvent: "readonly", Event: "readonly",
        IntersectionObserver: "readonly", ResizeObserver: "readonly",
        MutationObserver: "readonly", matchMedia: "readonly",
        atob: "readonly", btoa: "readonly", structuredClone: "readonly",
        crypto: "readonly", performance: "readonly", history: "readonly",
        HTMLElement: "readonly", Node: "readonly", DOMParser: "readonly",
        NodeFilter: "readonly", XMLHttpRequest: "readonly", WebSocket: "readonly", Notification: "readonly",
        process: "readonly", globalThis: "readonly", TextDecoder: "readonly",
        TextEncoder: "readonly", Intl: "readonly", queueMicrotask: "readonly",
      },
    },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      "no-undef": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-dupe-args": "error",
      "no-cond-assign": "error",
    },
  },
];

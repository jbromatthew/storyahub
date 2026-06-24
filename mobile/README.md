# Storyahub Mobile (React Native WebView)

웹 앱(`record.storyahub.com`)을 WebView로 감싼 iOS/Android 앱입니다.  
브라우저 WebView와 달리 **네이티브 마이크 녹음**을 사용해 화면이 꺼져도 녹음이 이어집니다.

## 구조

- `App.tsx` → `src/WebApp.tsx` (WebView)
- `src/nativeAudio.ts` — iOS/Android 마이크 녹음
- `src/uploadRecording.ts` — 녹음 파일을 API로 직접 업로드
- 웹 ↔ 앱 메시지: `window.ReactNativeWebView.postMessage` / `storyahub-native` 이벤트

기본 URL: `https://record.storyahub.com`  
로컬 웹 테스트: `mobile/src/config.ts`에서 `WEB_APP_URL`을 `http://localhost:5173` 등으로 변경

## 사전 준비 (Mac)

1. **Xcode** (App Store) — Command Line Tools만으로는 빌드 불가
2. Xcode 설치 후 개발자 경로 지정:

   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

3. **CocoaPods**: `brew install cocoapods`
4. **Node.js 22+**
5. Apple ID (무료 개발자 계정으로도 실기기 테스트 가능)

## 설치

```bash
# 저장소 루트에서
npm run mobile:install
npm run mobile:pods
```

## Xcode에서 내 iPhone에 실행

1. Metro 번들러 실행 (터미널 1):

   ```bash
   npm run mobile:start
   ```

2. Xcode에서 프로젝트 열기:

   ```bash
   open mobile/ios/StoryahubMobile.xcworkspace
   ```

   > `.xcodeproj`가 아니라 **`.xcworkspace`** 를 여세요 (CocoaPods).

3. Xcode 설정:
   - 상단 타깃: **StoryahubMobile**
   - 기기: 연결한 **본인 iPhone** (시뮬레이터도 가능)
   - **Signing & Capabilities** → Team: 본인 Apple ID 선택
   - Bundle Identifier가 충돌하면 고유 값으로 변경 (예: `com.yourname.storyahub`)

4. iPhone에서 **개발자 신뢰** (최초 1회):
   - 설정 → 일반 → VPN 및 기기 관리 → 개발자 앱 신뢰

5. Xcode ▶ Run (⌘R)

6. 앱에서 로그인 후 **미팅 녹음** 시작 → 홈 버튼/잠금 화면으로 나가도 녹음 유지 확인

## Android

```bash
npm run mobile:android
```

에뮬레이터 또는 USB 디버깅 연결 기기 필요.

## 웹 변경 사항

`frontend/src/api/nativeBridge.js` — 앱 WebView 감지 시 `AudioRecorder`가 네이티브 녹음·업로드 사용.

프로덕션 웹에 이 변경이 반영되어 있어야 앱에서 녹음이 동작합니다.  
로컬 웹만 쓸 때는 `WEB_APP_URL`로 dev 서버를 가리키면 됩니다.

## 문제 해결

| 증상 | 확인 |
|------|------|
| 빌드 실패 (Pods) | `cd mobile/ios && pod install` 재실행 |
| Metro 연결 안 됨 | `npm run mobile:start` 실행 후 Xcode 재실행 |
| 마이크 권한 | iPhone 설정 → Storyahub → 마이크 허용 |
| 녹음이 웹 방식으로 동작 | `window.__STORYAHUB_NATIVE__` — 앱 WebView인지 확인, 웹 배포 최신인지 확인 |

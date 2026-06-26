import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION, WEB_APP_URL } from './config';
import { NativeAudioRecorder } from './nativeAudio';
import {
  buildInjectScript,
  NativeToWebMessage,
  parseWebMessage,
  WebToNativeMessage,
} from './nativeBridge';
import { uploadRecordingFile } from './uploadRecording';
import { bindRecordingSessionLifecycle } from './recordingSession';
import {
  isImagePickCancelled,
  pickMultipleNativeImagesForWeb,
  pickNativeDocumentForWeb,
  pickNativeImageForWeb,
} from './nativeImagePicker';
import {
  exportNativeDeviceContacts,
  fetchNativeDeviceContacts,
} from './nativeContacts';
import {
  exportNativeDeviceEvents,
  fetchNativeDeviceEvents,
} from './nativeCalendar';

const INJECT_BEFORE = `
  window.__STORYAHUB_NATIVE__ = true;
  window.__STORYAHUB_PLATFORM__ = '${Platform.OS}';
  true;
`;

export function WebApp() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const audioRef = useRef(new NativeAudioRecorder());

  useEffect(() => {
    return bindRecordingSessionLifecycle(() => audioRef.current.isRecording());
  }, []);

  const sendToWeb = useCallback((message: NativeToWebMessage) => {
    webRef.current?.injectJavaScript(buildInjectScript(message));
  }, []);

  const onLoadEnd = useCallback(() => {
    sendToWeb({
      type: 'READY',
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      version: APP_VERSION,
    });
  }, [sendToWeb]);

  const handleMessage = useCallback(
    async (msg: WebToNativeMessage) => {
      const audio = audioRef.current;

      switch (msg.type) {
        case 'PING':
          sendToWeb({ type: 'PONG' });
          return;
        case 'RECORD_START':
          await audio.start();
          sendToWeb({ type: 'RECORD_STARTED' });
          return;
        case 'RECORD_STOP': {
          const file = await audio.stop();
          const mediaKey = await uploadRecordingFile({
            apiBase: msg.apiBase,
            token: msg.token,
            filePath: file.path,
            filename: msg.filename || `recording-${Date.now()}.m4a`,
            contentType: file.mime,
          });
          sendToWeb({
            type: 'RECORD_STOPPED',
            mediaKey,
            mime: file.mime,
            durationSec: file.durationSec,
          });
          return;
        }
        case 'RECORD_CANCEL':
          await audio.cancel();
          return;
        case 'PICK_IMAGE': {
          try {
            const picked = await pickNativeImageForWeb(msg.source);
            sendToWeb({
              type: 'IMAGE_PICKED',
              requestId: msg.requestId,
              base64: picked.base64,
              mime: picked.mime,
              filename: picked.filename,
            });
          } catch (err) {
            if (isImagePickCancelled(err)) {
              sendToWeb({ type: 'IMAGE_PICK_CANCELLED', requestId: msg.requestId });
              return;
            }
            const message =
              err instanceof Error ? err.message : '사진 선택 실패';
            sendToWeb({
              type: 'IMAGE_PICK_ERROR',
              requestId: msg.requestId,
              message,
            });
          }
          return;
        }
        case 'PICK_IMAGES': {
          try {
            const images = await pickMultipleNativeImagesForWeb(msg.maxCount);
            sendToWeb({
              type: 'IMAGES_PICKED',
              requestId: msg.requestId,
              images,
            });
          } catch (err) {
            if (isImagePickCancelled(err)) {
              sendToWeb({ type: 'IMAGE_PICK_CANCELLED', requestId: msg.requestId });
              return;
            }
            const message =
              err instanceof Error ? err.message : '사진 선택 실패';
            sendToWeb({
              type: 'IMAGE_PICK_ERROR',
              requestId: msg.requestId,
              message,
            });
          }
          return;
        }
        case 'PICK_DOCUMENT': {
          try {
            const picked = await pickNativeDocumentForWeb();
            sendToWeb({
              type: 'DOCUMENT_PICKED',
              requestId: msg.requestId,
              base64: picked.base64,
              mime: picked.mime,
              filename: picked.filename,
            });
          } catch (err) {
            if (isImagePickCancelled(err)) {
              sendToWeb({ type: 'IMAGE_PICK_CANCELLED', requestId: msg.requestId });
              return;
            }
            const message =
              err instanceof Error ? err.message : '파일 선택 실패';
            sendToWeb({
              type: 'IMAGE_PICK_ERROR',
              requestId: msg.requestId,
              message,
            });
          }
          return;
        }
        case 'FETCH_DEVICE_CONTACTS': {
          try {
            const contacts = await fetchNativeDeviceContacts();
            sendToWeb({
              type: 'DEVICE_CONTACTS_FETCHED',
              requestId: msg.requestId,
              contacts,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : '연락처를 불러오지 못했습니다';
            sendToWeb({
              type: 'CONTACTS_ERROR',
              requestId: msg.requestId,
              message,
            });
          }
          return;
        }
        case 'EXPORT_DEVICE_CONTACTS': {
          try {
            const result = await exportNativeDeviceContacts(msg.contacts || []);
            sendToWeb({
              type: 'DEVICE_CONTACTS_EXPORTED',
              requestId: msg.requestId,
              added: result.added,
              updated: result.updated,
              skipped: result.skipped,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : '연락처 저장 실패';
            sendToWeb({
              type: 'CONTACTS_ERROR',
              requestId: msg.requestId,
              message,
            });
          }
          return;
        }
        case 'FETCH_DEVICE_EVENTS': {
          try {
            const events = await fetchNativeDeviceEvents(msg.from, msg.to);
            sendToWeb({
              type: 'DEVICE_EVENTS_FETCHED',
              requestId: msg.requestId,
              events,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : '캘린더를 불러오지 못했습니다';
            sendToWeb({
              type: 'CALENDAR_ERROR',
              requestId: msg.requestId,
              message,
            });
          }
          return;
        }
        case 'EXPORT_DEVICE_EVENTS': {
          try {
            const result = await exportNativeDeviceEvents(msg.events || []);
            sendToWeb({
              type: 'DEVICE_EVENTS_EXPORTED',
              requestId: msg.requestId,
              added: result.added,
              updated: result.updated,
              skipped: result.skipped,
              mappings: result.mappings,
            });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : '캘린더 저장 실패';
            sendToWeb({
              type: 'CALENDAR_ERROR',
              requestId: msg.requestId,
              message,
            });
          }
          return;
        }
        default:
          return;
      }
    },
    [sendToWeb],
  );

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      const msg = parseWebMessage(event.nativeEvent.data);
      if (!msg) {
        return;
      }

      try {
        await handleMessage(msg);
      } catch (err) {
        const message = err instanceof Error ? err.message : '녹음 실패';
        sendToWeb({ type: 'RECORD_ERROR', message });
        if (msg.type === 'RECORD_STOP') {
          await audioRef.current.cancel();
        }
      }
    },
    [handleMessage, sendToWeb],
  );

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <WebView
        ref={webRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        allowsBackForwardNavigationGestures
        geolocationEnabled
        setSupportMultipleWindows={false}
        originWhitelist={['https://*', 'http://*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

import { AppState, NativeModules, Platform } from 'react-native';

type StoryahubNativeRecorderModule = {
  keepAliveIfRecording: () => Promise<boolean>;
};

const Native = NativeModules.StoryahubNativeRecorder as
  | StoryahubNativeRecorderModule
  | undefined;

/** 녹음 중 잠금·백그라운드 전환 시 iOS 네이티브 녹음 재개 */
export function bindRecordingSessionLifecycle(isRecording: () => boolean): () => void {
  if (Platform.OS !== 'ios' || !Native?.keepAliveIfRecording) return () => {};

  const sub = AppState.addEventListener('change', (state) => {
    if (!isRecording()) return;
    if (state === 'background' || state === 'inactive' || state === 'active') {
      void Native.keepAliveIfRecording();
    }
  });

  return () => sub.remove();
}

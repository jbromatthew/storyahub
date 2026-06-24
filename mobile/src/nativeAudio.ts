import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  OutputFormatAndroidType,
} from 'react-native-audio-recorder-player';
import RNFS from 'react-native-fs';

const androidRecorder = AudioRecorderPlayer;

type StoryahubNativeRecorderModule = {
  startRecording: (path: string) => Promise<string>;
  stopRecording: () => Promise<{ path: string; durationSec: number }>;
  cancelRecording: () => Promise<boolean>;
  isRecording: () => Promise<boolean>;
};

const iosRecorder = NativeModules.StoryahubNativeRecorder as
  | StoryahubNativeRecorderModule
  | undefined;

export type RecordingFile = {
  path: string;
  mime: string;
  durationSec: number;
};

export class NativeAudioRecorder {
  private path: string | null = null;
  private startedAt = 0;
  private recording = false;

  async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: '마이크 권한',
          message: '미팅 녹음을 위해 마이크 접근이 필요합니다.',
          buttonPositive: '허용',
          buttonNegative: '거부',
        },
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  isRecording(): boolean {
    return this.recording;
  }

  async start(): Promise<void> {
    if (this.recording) {
      return;
    }

    const ok = await this.requestPermission();
    if (!ok) {
      throw new Error('마이크 권한이 거부되었습니다');
    }

    const filename = `storyahub-${Date.now()}.m4a`;
    const path = `${RNFS.CachesDirectoryPath}/${filename}`;

    if (Platform.OS === 'ios') {
      if (!iosRecorder?.startRecording) {
        throw new Error('iOS 녹음 모듈을 사용할 수 없습니다. 앱을 다시 빌드해 주세요.');
      }
      await iosRecorder.startRecording(path);
    } else {
      await androidRecorder.startRecorder(path, {
        AudioSourceAndroid: AudioSourceAndroidType.MIC,
        OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
        AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
        AVFormatIDKeyIOS: 'aac',
        AVEncodingOptionIOS: 'aac',
        AVNumberOfChannelsKeyIOS: 1,
        AVSampleRateKeyIOS: 44100,
        AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
      });
    }

    this.path = path;
    this.startedAt = Date.now();
    this.recording = true;
  }

  async stop(): Promise<RecordingFile> {
    if (!this.recording || !this.path) {
      throw new Error('녹음이 시작되지 않았습니다');
    }

    let durationSec: number;
    let path = this.path;

    if (Platform.OS === 'ios' && iosRecorder?.stopRecording) {
      const result = await iosRecorder.stopRecording();
      path = result.path;
      durationSec = result.durationSec;
    } else {
      await androidRecorder.stopRecorder();
      androidRecorder.removeRecordBackListener();
      durationSec = Math.max(
        1,
        Math.round((Date.now() - this.startedAt) / 1000),
      );
    }

    this.recording = false;
    this.path = null;

    const exists = await RNFS.exists(path);
    if (!exists) {
      throw new Error('녹음 파일을 찾을 수 없습니다');
    }

    return {
      path,
      mime: 'audio/mp4',
      durationSec: Math.max(1, durationSec),
    };
  }

  async cancel(): Promise<void> {
    if (Platform.OS === 'ios' && iosRecorder?.cancelRecording) {
      await iosRecorder.cancelRecording();
    } else if (this.recording) {
      try {
        await androidRecorder.stopRecorder();
      } catch {
        /* ignore */
      }
      androidRecorder.removeRecordBackListener();
    }

    this.recording = false;

    if (this.path) {
      await RNFS.unlink(this.path).catch(() => {});
      this.path = null;
    }
  }

  async discard(path: string): Promise<void> {
    await RNFS.unlink(path).catch(() => {});
  }
}

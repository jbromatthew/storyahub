import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

export async function uploadRecordingFile(opts: {
  apiBase: string;
  token?: string;
  filePath: string;
  filename: string;
  contentType: string;
}): Promise<string> {
  const { apiBase, token, filePath, filename, contentType } = opts;
  const base = apiBase.replace(/\/$/, '');
  const uri =
    Platform.OS === 'android' && !filePath.startsWith('file://')
      ? `file://${filePath}`
      : filePath;

  const fileResp = await fetch(uri);
  if (!fileResp.ok) {
    throw new Error('녹음 파일을 읽을 수 없습니다');
  }

  const blob = await fileResp.blob();
  const res = await fetch(`${base}/uploads/direct`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': contentType,
      'X-Filename': encodeURIComponent(filename),
    },
    body: blob,
  });

  if (!res.ok) {
    let msg = res.status === 413 ? '파일이 너무 큽니다 (최대 150MB)' : '파일 업로드 실패';
    try {
      const json = await res.json();
      msg = json.error || msg;
    } catch {
      msg = (await res.text()) || msg;
    }
    throw new Error(msg);
  }

  const { key } = await res.json();
  await RNFS.unlink(filePath).catch(() => {});
  return key;
}

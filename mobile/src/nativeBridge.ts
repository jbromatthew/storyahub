export type WebToNativeMessage =
  | { type: 'PING' }
  | { type: 'RECORD_START' }
  | {
      type: 'RECORD_STOP';
      apiBase: string;
      token?: string;
      filename?: string;
    }
  | { type: 'RECORD_CANCEL' }
  | { type: 'PICK_IMAGE'; source: 'camera' | 'library'; requestId: string };

export type NativeToWebMessage =
  | { type: 'READY'; platform: 'ios' | 'android'; version: string }
  | { type: 'RECORD_STARTED' }
  | {
      type: 'RECORD_STOPPED';
      mediaKey: string;
      mime: string;
      durationSec: number;
    }
  | { type: 'RECORD_ERROR'; message: string }
  | { type: 'RECORD_INTERRUPTED' }
  | { type: 'PONG' }
  | {
      type: 'IMAGE_PICKED';
      requestId: string;
      base64: string;
      mime: string;
      filename: string;
    }
  | { type: 'IMAGE_PICK_CANCELLED'; requestId: string }
  | { type: 'IMAGE_PICK_ERROR'; requestId: string; message: string };

export function parseWebMessage(raw: string): WebToNativeMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg && typeof msg.type === 'string') {
      return msg as WebToNativeMessage;
    }
  } catch {
    /* ignore malformed messages */
  }
  return null;
}

export function buildInjectScript(message: NativeToWebMessage): string {
  const json = JSON.stringify(message);
  return `(function(){window.dispatchEvent(new CustomEvent('storyahub-native',{detail:${json}}));})();true;`;
}

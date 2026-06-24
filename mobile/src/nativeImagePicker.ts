import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';

type PickerResult = {
  path: string;
  mime: string;
  filename: string;
};

type StoryahubImagePickerModule = {
  pickFromCamera: () => Promise<PickerResult>;
  pickFromLibrary: () => Promise<PickerResult>;
};

const iosPicker = NativeModules.StoryahubImagePicker as
  | StoryahubImagePickerModule
  | undefined;

export class ImagePickCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'ImagePickCancelled';
  }
}

export function isImagePickCancelled(err: unknown): boolean {
  return (
    err instanceof ImagePickCancelled ||
    (err as { name?: string })?.name === 'ImagePickCancelled' ||
    (err as { code?: string })?.code === 'cancelled'
  );
}

export async function pickNativeImageForWeb(
  source: 'camera' | 'library',
): Promise<{ base64: string; mime: string; filename: string }> {
  if (Platform.OS !== 'ios' || !iosPicker) {
    throw new Error('Native image picker unavailable');
  }

  const pick =
    source === 'camera' ? iosPicker.pickFromCamera : iosPicker.pickFromLibrary;

  if (!pick) {
    throw new Error('Native image picker unavailable');
  }

  let result: PickerResult;
  try {
    result = await pick();
  } catch (err) {
    if (isImagePickCancelled(err)) {
      throw new ImagePickCancelled();
    }
    throw err;
  }

  try {
    const base64 = await RNFS.readFile(result.path, 'base64');
    return {
      base64,
      mime: result.mime || 'image/jpeg',
      filename: result.filename || `photo-${Date.now()}.jpg`,
    };
  } finally {
    await RNFS.unlink(result.path).catch(() => {});
  }
}

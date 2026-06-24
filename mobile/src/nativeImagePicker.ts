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
  pickMultipleFromLibrary: (maxCount: number) => Promise<PickerResult[]>;
  pickDocument: () => Promise<PickerResult>;
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

export async function pickMultipleNativeImagesForWeb(
  maxCount: number,
): Promise<Array<{ base64: string; mime: string; filename: string }>> {
  if (Platform.OS !== 'ios' || !iosPicker) {
    throw new Error('Native image picker unavailable');
  }

  const pick = iosPicker.pickMultipleFromLibrary;
  if (!pick) {
    throw new Error('Native multi image picker unavailable');
  }

  let results: PickerResult[];
  try {
    results = await pick(Math.max(1, maxCount));
  } catch (err) {
    if (isImagePickCancelled(err)) {
      throw new ImagePickCancelled();
    }
    throw err;
  }

  const out: Array<{ base64: string; mime: string; filename: string }> = [];
  try {
    for (const result of results) {
      const base64 = await RNFS.readFile(result.path, 'base64');
      out.push({
        base64,
        mime: result.mime || 'image/jpeg',
        filename: result.filename || `photo-${Date.now()}.jpg`,
      });
    }
  } finally {
    await Promise.all(results.map((r) => RNFS.unlink(r.path).catch(() => {})));
  }
  return out;
}

export async function pickNativeDocumentForWeb(): Promise<{
  base64: string;
  mime: string;
  filename: string;
}> {
  if (Platform.OS !== 'ios' || !iosPicker) {
    throw new Error('Native document picker unavailable');
  }

  const pick = iosPicker.pickDocument;
  if (!pick) {
    throw new Error('Native document picker unavailable');
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
      mime: result.mime || 'application/octet-stream',
      filename: result.filename || `document-${Date.now()}`,
    };
  } finally {
    await RNFS.unlink(result.path).catch(() => {});
  }
}

import { NativeModules, Platform } from 'react-native';

type DeviceContact = {
  person?: string;
  phone?: string;
  email?: string;
  company?: string;
};

type StoryahubContactsModule = {
  fetchContacts: () => Promise<DeviceContact[]>;
  exportContacts: (
    contacts: DeviceContact[],
  ) => Promise<{ added: number; skipped: number }>;
};

const iosContacts = NativeModules.StoryahubContacts as
  | StoryahubContactsModule
  | undefined;

export function isNativeContactsAvailable(): boolean {
  return Platform.OS === 'ios' && !!iosContacts?.fetchContacts;
}

export async function fetchNativeDeviceContacts(): Promise<DeviceContact[]> {
  if (!isNativeContactsAvailable() || !iosContacts?.fetchContacts) {
    throw new Error('Native contacts unavailable');
  }
  const rows = await iosContacts.fetchContacts();
  return Array.isArray(rows) ? rows : [];
}

export async function exportNativeDeviceContacts(
  contacts: DeviceContact[],
): Promise<{ added: number; skipped: number }> {
  if (!isNativeContactsAvailable() || !iosContacts?.exportContacts) {
    return { added: 0, skipped: contacts.length };
  }
  const result = await iosContacts.exportContacts(contacts);
  return {
    added: Number(result?.added) || 0,
    skipped: Number(result?.skipped) || 0,
  };
}

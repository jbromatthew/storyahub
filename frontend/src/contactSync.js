import { api } from "./api/client.js";
import { contactToUi } from "./mappers.js";
import { setClients } from "./store.js";
import {
  exportDeviceContacts,
  fetchDeviceContacts,
  isDeviceContactsAvailable,
} from "./api/nativeBridge.js";

export { isDeviceContactsAvailable };

/** 휴대폰 ↔ Storyahub 동기화 — 이미 있는 연락처는 건너뜀 */
export async function syncPhoneContacts() {
  const deviceContacts = await fetchDeviceContacts();
  const importResult = await api.importContacts(deviceContacts);
  if (importResult?.contacts?.length) {
    setClients(importResult.contacts.map(contactToUi));
  }
  const exportPayload = (importResult?.contacts || []).map((c) => ({
    person: c.person,
    phone: c.phone,
    email: c.email,
    company: c.company,
  }));
  const exportResult = await exportDeviceContacts(exportPayload);
  return {
    importAdded: importResult?.added || 0,
    importSkipped: importResult?.skipped || 0,
    exportAdded: exportResult?.added || 0,
    exportSkipped: exportResult?.skipped || 0,
  };
}

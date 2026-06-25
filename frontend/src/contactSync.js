import { api } from "./api/client.js";
import { contactToUi, splitMergedContactFields } from "./mappers.js";
import { setClients } from "./store.js";
import {
  exportDeviceContacts,
  fetchDeviceContacts,
  isDeviceContactsAvailable,
} from "./api/nativeBridge.js";

export { isDeviceContactsAvailable };

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 10) digits = `0${digits.slice(2)}`;
  if (digits.startsWith("10") && digits.length === 10) digits = `0${digits}`;
  return digits;
}

function contactForDeviceExport(c) {
  const split = splitMergedContactFields(c);
  const person = split.person || (c.company || "").trim();
  const title = (split.title || "").trim();
  const company = (c.company || "").trim();
  const displayName = [person, title, company].filter(Boolean).join(" · ");
  return {
    person,
    displayName: displayName || person,
    title: title || null,
    department: split.department || null,
    phone: c.phone,
    email: c.email,
    company: company || null,
  };
}

/** 휴대폰 ↔ Storyahub 동기화 — 이미 있는 번호는 직함·회사명까지 갱신 */
export async function syncPhoneContacts() {
  const deviceContacts = await fetchDeviceContacts();
  const importResult = await api.importContacts(deviceContacts);
  if (importResult?.contacts?.length) {
    setClients(importResult.contacts.map(contactToUi));
  }
  const exportPayload = (importResult?.contacts || [])
    .map(contactForDeviceExport)
    .filter((c) => normalizePhone(c.phone).length >= 9 && (c.person || c.company));
  const exportResult = await exportDeviceContacts(exportPayload);
  return {
    importAdded: importResult?.added || 0,
    importSkipped: importResult?.skipped || 0,
    exportAdded: exportResult?.added || 0,
    exportUpdated: exportResult?.updated || 0,
    exportSkipped: exportResult?.skipped || 0,
  };
}

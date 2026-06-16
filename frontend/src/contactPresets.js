import { api } from "./api/client.js";
import { mergePreferencesRaw, userPreferences } from "./preferences.js";

export async function saveContactPresets(user, { groups, tags }, onUserUpdated) {
  const base = userPreferences(user);
  const normalized = mergePreferencesRaw({
    ...base,
    contacts: { groups, tags },
  });
  const { user: u } = await api.updatePreferences(normalized);
  onUserUpdated?.(u);
  return normalized.contacts;
}

export async function renameContactGroup(contacts, oldName, newName) {
  const affected = contacts.filter((c) => c.group === oldName);
  await Promise.all(affected.map((c) => api.updateContact(c.id, { group: newName })));
}

export async function clearContactGroup(contacts, name) {
  const affected = contacts.filter((c) => c.group === name);
  await Promise.all(affected.map((c) => api.updateContact(c.id, { group: null })));
}

export async function renameContactTag(contacts, oldName, newName) {
  const affected = contacts.filter((c) => (c.tags || []).includes(oldName));
  await Promise.all(
    affected.map((c) => {
      const next = (c.tags || []).map((t) => (t === oldName ? newName : t));
      return api.updateContact(c.id, { tags: [...new Set(next)] });
    })
  );
}

export async function removeContactTag(contacts, name) {
  const affected = contacts.filter((c) => (c.tags || []).includes(name));
  await Promise.all(
    affected.map((c) => api.updateContact(c.id, { tags: (c.tags || []).filter((t) => t !== name) }))
  );
}

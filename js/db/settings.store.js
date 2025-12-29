// js/db/settings.store.js
// Stocke les préférences/app settings dans IndexedDB (store: "settings").
// Utilisé pour deviceId, lastSyncAt, appearance, flags, etc.

import { get, put } from "./db.js";

const STORE = "settings";

/* =========================
   GET / SET
   ========================= */

export async function getSetting(key) {
  const row = await get(STORE, key);
  return row ? row.value : null;
}

export async function setSetting(key, value) {
  const record = {
    key,
    value,
    updatedAt: new Date().toISOString()
  };
  await put(STORE, record);
  return value;
}

/* =========================
   DEVICE ID
   ========================= */

export async function ensureDeviceId() {
  let deviceId = await getSetting("deviceId");
  if (deviceId) return deviceId;

  deviceId = makeDeviceId();
  await setSetting("deviceId", deviceId);
  return deviceId;
}

function makeDeviceId() {
  // Format stable et lisible (pas besoin d’être un UUID parfait)
  // ex: "bs-9f3k2m1a-2r8x"
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `bs-${rand()}-${rand().slice(0, 4)}`;
}

/* =========================
   SYNC HELPERS
   ========================= */

export async function getLastSyncAt() {
  return await getSetting("lastSyncAt"); // ISO string ou null
}

export async function setLastSyncAt(isoDate) {
  return await setSetting("lastSyncAt", isoDate);
}

export async function getSyncToken() {
  return await getSetting("syncToken"); // string ou null
}

export async function setSyncToken(token) {
  return await setSetting("syncToken", token);
}

/* =========================
   UI PREFERENCES
   ========================= */

export async function getAppearance() {
  // "dark" | "light" | null
  return await getSetting("appearance");
}

export async function setAppearance(mode) {
  if (mode !== "dark" && mode !== "light") {
    throw new Error("appearance must be 'dark' or 'light'");
  }
  return await setSetting("appearance", mode);
}

export async function getAmbientGlow() {
  // "on" | "off"
  return await getSetting("ambientGlow");
}

export async function setAmbientGlow(onOff) {
  if (onOff !== "on" && onOff !== "off") {
    throw new Error("ambientGlow must be 'on' or 'off'");
  }
  return await setSetting("ambientGlow", onOff);
}

/* =========================
   FLAGS / FIRST RUN
   ========================= */

export async function isFirstRunDone() {
  return (await getSetting("firstRunDone")) === "true";
}

export async function setFirstRunDone() {
  return await setSetting("firstRunDone", "true");
}

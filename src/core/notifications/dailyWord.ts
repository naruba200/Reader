/**
 * Daily word-of-the-day notification (Android, via
 * @capacitor/local-notifications).
 *
 * Why 30 individual notifications instead of one repeating one: a
 * repeating notification can't change its word each day, so the next 30
 * days are scheduled individually at 9:00 AM local time and re-scheduled
 * on every app launch (which keeps the queue topped up and the words
 * current). The word for each date is the EXACT same deterministic pick
 * as the dictionary home (src/core/wordOfDay.ts), so the notification
 * and the home screen always agree.
 *
 * Tapping a notification opens the word's dictionary entry (the tap
 * listener lives in App.tsx and calls openDictionary with extra.word).
 * Nothing here can be verified on-device from this sandbox: the user
 * must build with `npm install` + `npx cap sync android` first, since
 * this is a new native plugin.
 */

import { Capacitor } from "@capacitor/core";
import { getWordOfDay } from "../wordOfDay";

const ENABLED_KEY = "smart-reader-daily-word-enabled";
const DAYS_AHEAD = 30;
const BASE_ID = 900000;

export function isDailyWordEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

function setEnabledFlag(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

type LocalNotificationsPlugin = typeof import("@capacitor/local-notifications").LocalNotifications;

async function loadPlugin(): Promise<LocalNotificationsPlugin> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

function queueIds(): Array<{ id: number }> {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => ({ id: BASE_ID + i }));
}

/** (Re)schedule the next 30 days at 9:00 AM local, cancelling the old queue first. */
export async function rescheduleDailyWord(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const LocalNotifications = await loadPlugin();
  await LocalNotifications.cancel({ notifications: queueIds() }).catch(() => {});
  const first = new Date();
  first.setHours(9, 0, 0, 0);
  if (first.getTime() < Date.now()) first.setDate(first.getDate() + 1);
  const notifications = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = new Date(first);
    date.setDate(first.getDate() + i);
    const pick = await getWordOfDay(date);
    if (!pick) continue;
    notifications.push({
      id: BASE_ID + i,
      title: "Word of the day",
      body: `${pick.word} (JLPT ${pick.level}) — tap to open`,
      schedule: { at: date, allowWhileIdle: true },
      extra: { word: pick.word, language: "ja" },
    });
  }
  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }
}

export type DailyWordResult =
  | { ok: true }
  | { ok: false; message: string };

/** Request permission (Android 13+ POST_NOTIFICATIONS) and enable. */
export async function requestAndEnableDailyWord(): Promise<DailyWordResult> {
  if (!Capacitor.isNativePlatform()) {
    return {
      ok: false,
      message: "Daily word notifications are available in the Android app only.",
    };
  }
  const LocalNotifications = await loadPlugin();
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") {
    setEnabledFlag(false);
    return {
      ok: false,
      message:
        "Notifications are off for Smart Reader. Allow them in Android Settings → Apps → Smart Reader → Notifications, then try again.",
    };
  }
  await rescheduleDailyWord();
  setEnabledFlag(true);
  return { ok: true };
}

/** Turn off and cancel the whole queue. */
export async function disableDailyWord(): Promise<void> {
  setEnabledFlag(false);
  if (!Capacitor.isNativePlatform()) return;
  try {
    const LocalNotifications = await loadPlugin();
    await LocalNotifications.cancel({ notifications: queueIds() });
  } catch {
    /* plugin unavailable */
  }
}

/**
 * App-launch refresh: if enabled but permission was revoked, disable
 * (Settings will show it off); otherwise re-schedule to keep the queue
 * full and the words current.
 */
export async function syncDailyWordIfEnabled(): Promise<void> {
  if (!isDailyWordEnabled() || !Capacitor.isNativePlatform()) return;
  try {
    const LocalNotifications = await loadPlugin();
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      setEnabledFlag(false);
      return;
    }
    await rescheduleDailyWord();
  } catch {
    /* best-effort refresh; the existing queue keeps firing */
  }
}

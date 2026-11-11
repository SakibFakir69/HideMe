import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Local reminders for Recently Deleted.
 *
 * Purpose (settled): while the bin holds at least one item, the app schedules a
 * single daily local notification that nudges the user to review it. The text is
 * deliberately generic — notifications render on the lock screen, so they must
 * never reveal that a vault exists or what is inside it.
 *
 * expo-notifications is loaded lazily: the vault must keep working in Expo Go,
 * on web, or in a build made before the native module was added.
 */

type NotificationsModule = typeof import('expo-notifications');

const ENABLED_KEY = 'reminders.enabled.v1';
const SCHEDULED_KEY = 'reminders.bin.identifier.v1';
const CHANNEL_ID = 'recently-deleted';
const REMINDER_HOUR = 9;
const REMINDER_MINUTE = 0;
const REMINDER_DATA_KIND = 'bin-reminder';

/** Shown in Settings so the user knows exactly when the nudge arrives. */
export const REMINDER_TIME_LABEL = '9:00 AM';

let modulePromise: Promise<NotificationsModule | null> | null = null;
let handlerBound = false;
let cachedEnabled: boolean | null = null;

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (!modulePromise) {
    modulePromise = import('expo-notifications').catch(() => null);
  }
  return modulePromise;
}

function safeStore() {
  return SecureStore.isAvailableAsync().catch(() => false);
}

export async function isRemindersSupported(): Promise<boolean> {
  return (await getNotifications()) !== null;
}

/** Bind the foreground presentation handler once, before the first schedule. */
export async function initReminders(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications || handlerBound) return;
  handlerBound = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function getRemindersEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  try {
    if (!(await safeStore())) return false;
    cachedEnabled = (await SecureStore.getItemAsync(ENABLED_KEY)) === '1';
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

async function persistEnabled(value: boolean): Promise<void> {
  cachedEnabled = value;
  try {
    if (await safeStore()) await SecureStore.setItemAsync(ENABLED_KEY, value ? '1' : '0');
  } catch {
    // preference persistence is best-effort
  }
}

async function ensureChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Cleanup reminders',
    description: 'A daily nudge while Recently Deleted holds items.',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    showBadge: false,
  });
}

async function hasPermission(Notifications: NotificationsModule): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return current.granted === true;
  } catch {
    return false;
  }
}

/**
 * Enables or disables reminders, asking for the OS permission when enabling.
 * Returns false when the platform cannot deliver notifications or the user
 * denied the permission — Settings then stays off instead of lying.
 */
export async function setRemindersEnabled(value: boolean): Promise<boolean> {
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  if (!value) {
    await persistEnabled(false);
    await cancelBinReminder(Notifications);
    return true;
  }

  await ensureChannel(Notifications);
  let granted = await hasPermission(Notifications);
  if (!granted) {
    try {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted === true;
    } catch {
      granted = false;
    }
  }
  if (!granted) return false;

  await persistEnabled(true);
  return true;
}

async function readScheduledId(): Promise<string | null> {
  try {
    if (!(await safeStore())) return null;
    return await SecureStore.getItemAsync(SCHEDULED_KEY);
  } catch {
    return null;
  }
}

async function persistScheduledId(identifier: string | null): Promise<void> {
  try {
    if (!(await safeStore())) return;
    if (identifier === null) await SecureStore.deleteItemAsync(SCHEDULED_KEY);
    else await SecureStore.setItemAsync(SCHEDULED_KEY, identifier);
  } catch {
    // identifier is only an optimization; the data kind lookup also works
  }
}

/** True when one of our reminders is already queued in the OS. */
async function hasQueuedReminder(Notifications: NotificationsModule): Promise<boolean> {
  const stored = await readScheduledId();
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter(
      (request) => request.content.data?.kind === REMINDER_DATA_KIND,
    );
    if (ours.length === 0) {
      if (stored !== null) await persistScheduledId(null);
      return false;
    }
    // Duplicates can only come from an interrupted run — collapse them.
    if (ours.length > 1) {
      for (const request of ours.slice(1)) {
        await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {});
      }
    }
    if (stored !== ours[0].identifier) await persistScheduledId(ours[0].identifier);
    return true;
  } catch {
    return false;
  }
}

async function cancelBinReminder(Notifications: NotificationsModule): Promise<void> {
  const stored = await readScheduledId();
  if (stored) {
    await Notifications.cancelScheduledNotificationAsync(stored).catch(() => {});
    await persistScheduledId(null);
  }
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const request of scheduled) {
      if (request.content.data?.kind !== REMINDER_DATA_KIND) continue;
      await Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {});
    }
  } catch {
    // nothing queued / API unavailable
  }
}

/**
 * Reconciles the queued reminder with the current bin size. Cheap and
 * idempotent: call it whenever the vault index changes and on unlock.
 */
export async function syncBinReminder(binCount: number): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  const enabled = await getRemindersEnabled();
  if (!enabled || binCount <= 0) {
    await cancelBinReminder(Notifications);
    return;
  }
  if (!(await hasPermission(Notifications))) return;

  await ensureChannel(Notifications);
  if (await hasQueuedReminder(Notifications)) return;

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Storage reminder',
        body: 'You have items waiting to be reviewed. Open the app to keep your storage tidy.',
        data: { kind: REMINDER_DATA_KIND },
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: REMINDER_HOUR,
        minute: REMINDER_MINUTE,
        channelId: CHANNEL_ID,
      },
    });
    await persistScheduledId(identifier);
  } catch {
    // scheduling can fail while the device is in a restricted state
  }
}

/** Removes every queued reminder (used before erasing all contents). */
export async function clearReminders(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await cancelBinReminder(Notifications);
}

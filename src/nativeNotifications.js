import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

const REMINDER_PREFIX = 'kyvo-task-reminder:'

export function isNativeAndroid() {
  return Capacitor.getPlatform() === 'android'
}

function notificationId(taskId) {
  const input = String(taskId || '')
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) & 0x7fffffff) || 1
}

function getReminderDate(task) {
  if (!task?.id || !task?.date || !task?.start_time) return null

  const [year, month, day] = task.date.split('-').map(Number)
  const [hour, minute] = task.start_time.split(':').map(Number)

  if (![year, month, day, hour, minute].every(Number.isFinite)) return null

  const start = new Date(year, month - 1, day, hour, minute, 0, 0)
  const reminder = new Date(start.getTime() - 10 * 60 * 1000)

  return Number.isNaN(reminder.getTime()) ? null : reminder
}

function getEligibleTasks(tasks) {
  const now = Date.now()

  return (tasks || []).filter((task) => {
    if (!task?.id || task.done) return false

    const reminderAt = getReminderDate(task)
    return reminderAt && reminderAt.getTime() > now
  })
}

async function hasNativeNotificationPermission() {
  if (!isNativeAndroid()) return false

  const permission = await LocalNotifications.checkPermissions()
  return permission.display === 'granted'
}

export async function getNativeNotificationPermissionState() {
  if (!isNativeAndroid()) return 'unsupported'

  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') return permission.display

  try {
    const exact = await LocalNotifications.checkExactNotificationSetting()
    return exact.exact_alarm === 'granted' ? 'granted' : 'exact-required'
  } catch {
    return 'granted'
  }
}

export async function requestNativeNotificationPermission() {
  if (!isNativeAndroid()) return 'unsupported'

  const permission = await LocalNotifications.requestPermissions()
  if (permission.display !== 'granted') return permission.display

  try {
    const exact = await LocalNotifications.checkExactNotificationSetting()
    if (exact.exact_alarm !== 'granted') {
      const changed = await LocalNotifications.changeExactNotificationSetting()
      if (changed.exact_alarm !== 'granted') return 'exact-required'
    }
  } catch {
    // Older Android versions do not expose the exact-alarm setting.
  }

  return 'granted'
}

export async function syncNativeTaskNotifications(tasks) {
  if (!isNativeAndroid()) return { ok: false, reason: 'not-android' }

  if (!(await hasNativeNotificationPermission())) {
    return { ok: false, reason: 'permission' }
  }

  try {
    const exact = await LocalNotifications.checkExactNotificationSetting()
    if (exact.exact_alarm !== 'granted') {
      return { ok: false, reason: 'exact-required' }
    }
  } catch {
    // Android versions without the exact-alarm setting can continue.
  }

  const eligibleTasks = getEligibleTasks(tasks)
  await LocalNotifications.createChannel({
    id: 'kyvo-reminders',
    name: 'KYVO Reminders',
    description: 'Task start reminders from KYVO',
    importance: 4,
  })

  const pending = await LocalNotifications.getPending()
  const managedPending = (pending.notifications || []).filter((notification) => (
    notification?.id &&
    notification?.data?.kyvoReminder === REMINDER_PREFIX
  ))

  const idsToCancel = managedPending
    .map((notification) => notification.id)

  if (idsToCancel.length > 0) {
    await LocalNotifications.cancel({
      notifications: idsToCancel.map((id) => ({ id })),
    })
  }

  if (eligibleTasks.length === 0) {
    return { ok: true, scheduled: 0 }
  }

  let result

  try {
    result = await LocalNotifications.schedule({
    notifications: eligibleTasks.map((task) => ({
      id: notificationId(task.id),
      title: 'KYVO Reminder',
      body: `${task.name} starts in 10 minutes.`,
      schedule: {
        at: getReminderDate(task),
        allowWhileIdle: true,
      },
      channelId: 'kyvo-reminders',
      data: {
        kyvoReminder: REMINDER_PREFIX,
        taskId: task.id,
      },
      extra: {
        kyvoReminder: REMINDER_PREFIX,
        taskId: task.id,
      },
      isExactNotification: true,
      isExactMandatory: true,
      foreground: true,
    })),
  })
  } catch (error) {
    console.error('KYVO NATIVE REMINDER SCHEDULE FAILED:', error)
    return {
      ok: false,
      reason: 'schedule-error',
      error: error?.message || String(error),
      code: error?.code || null,
    }
  }

  console.info('KYVO NATIVE REMINDERS SCHEDULED:', result)

  return {
    ok: true,
    scheduled: result.notifications?.length || 0,
    warning: result.warning || null,
  }
}

export async function cancelNativeTaskNotification(taskId) {
  if (!isNativeAndroid() || !taskId) return

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: notificationId(taskId) }],
    })
  } catch {
    // The notification may already have fired or been removed.
  }
}

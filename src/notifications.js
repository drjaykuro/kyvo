export async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'

  return Notification.requestPermission()
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

async function describeEdgeFunctionError(error) {
  const message = error?.message || 'edge-function-error'
  const status = error?.context?.status
  let body = ''

  try {
    if (typeof error?.context?.clone === 'function') {
      body = await error.context.clone().text()
    } else if (typeof error?.context?.text === 'function') {
      body = await error.context.text()
    }
  } catch {
    body = ''
  }

  const details = body?.trim()
  const statusText = status ? ` [HTTP ${status}]` : ''
  const bodyText = details ? ` — ${details.slice(0, 300)}` : ''

  return `${message}${statusText}${bodyText}`
}

export async function registerPushSubscription(supabase, userId) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  if (!userId || Notification.permission !== 'granted') return { ok: false, reason: 'permission' }

  try {
    const registration = await navigator.serviceWorker.ready
    const { data, error } = await supabase.functions.invoke('push-config-v2', { body: {} })
    if (error) {
      return {
        ok: false,
        reason: await describeEdgeFunctionError(error),
        stage: 'push-config',
        status: error?.context?.status,
      }
    }
    if (!data?.publicKey) {
      return { ok: false, reason: 'missing-public-key', stage: 'push-config' }
    }

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.publicKey),
      })
    }

    const json = subscription.toJSON()
    const endpoint = json.endpoint
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!endpoint || !p256dh || !auth) return { ok: false, reason: 'invalid-subscription', stage: 'browser-subscribe' }

    const { error: saveError } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      )

    if (saveError) {
      return { ok: false, reason: saveError.message, stage: 'save-subscription' }
    }

    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error?.message || 'subscription-failed', stage: 'unknown' }
  }
}

export async function showKyvoNotification(title, options = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false

  try {
    const registration = await navigator.serviceWorker?.ready
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        ...options,
      })
      return true
    }
  } catch {
    return false
  }

  return false
}

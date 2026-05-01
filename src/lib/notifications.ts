import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch { return null }
}

export function notificationsSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestPushPermission(userId: string): Promise<boolean> {
  if (!notificationsSupported()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.ready
    const subscribeOptions: PushSubscriptionOptionsInit = { userVisibleOnly: true }

    if (VAPID_PUBLIC_KEY) {
      subscribeOptions.applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    } else {
      // No VAPID key yet — permission granted but push not fully wired
      return true
    }

    const sub = await reg.pushManager.subscribe(subscribeOptions)
    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, subscription: JSON.stringify(sub), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    return true
  } catch {
    return true // permission granted even if subscription storage failed
  }
}

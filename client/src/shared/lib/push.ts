/** Подписка браузера на push-уведомления. Работает только с service worker (в собранном приложении). */

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const keyToBytes = (base64url: string) => {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('Уведомления доступны в установленном приложении или в браузере после перезагрузки страницы')
  return navigator.serviceWorker.ready
}

export async function currentPushSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function subscribePush(publicKey: string) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Браузер запретил уведомления. Разрешите их в настройках сайта')
  const reg = await registration()
  const existing = await reg.pushManager.getSubscription()
  return existing ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) })
}

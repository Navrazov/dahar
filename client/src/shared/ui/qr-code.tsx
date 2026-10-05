import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Skeleton } from './loading'

/** QR-код для ссылки otpauth:// — его сканирует приложение-аутентификатор. */
export function QrCode({ value, size = 176, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' }).then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [value, size])
  if (!src) return <Skeleton className="rounded-[8px]" style={{ width: size, height: size }} />
  return <img src={src} width={size} height={size} alt={label} className="rounded-[8px] bg-white p-1.5" />
}

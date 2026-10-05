import { config } from '../../config.ts'

export const sttEnabled = () => !!config.stt

/** Голосовые длиннее не расшифровываем: это уже не быстрый ввод, а запрос стоит денег. */
export const MAX_VOICE_SEC = 5 * 60

/**
 * Расшифровывает аудио через OpenAI-совместимый /audio/transcriptions.
 * По умолчанию Groq (Whisper, бесплатный лимит), можно указать OpenAI или любой совместимый сервис.
 */
export async function transcribe(audio: Buffer, filename = 'voice.ogg'): Promise<string> {
  const stt = config.stt
  if (!stt) throw new Error('STT не настроен')
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)]), filename)
  form.append('model', stt.model)
  form.append('language', 'ru')
  form.append('response_format', 'json')
  const res = await fetch(`${stt.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${stt.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } }
  if (!res.ok) throw new Error(`STT ${res.status}: ${body.error?.message ?? 'ошибка сервиса'}`)
  return (body.text ?? '').trim()
}

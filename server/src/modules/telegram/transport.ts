import { config } from '../../config.ts'

const TOKEN = config.telegram.token
let username = config.telegram.username

export type Button = { text: string; callback_data: string } | { text: string; web_app: { url: string } }
export type Buttons = Button[][]

export interface TelegramOut {
  send(chatId: number, text: string, buttons?: Buttons): Promise<unknown>
  edit(chatId: number, messageId: number, text: string, buttons?: Buttons): Promise<unknown>
  answer(callbackId: string, text?: string): Promise<unknown>
}

export const botEnabled = () => !!TOKEN
export const botInfo = () => ({ enabled: !!TOKEN, username })

/** Адрес мини-приложения, если известен публичный адрес сервиса. */
export const miniAppUrl = () => (config.publicUrl ? `${config.publicUrl}/tg` : null)
export const setBotUsername = (name: string | null) => (username = name)

export async function tg<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
  })
  const json = (await res.json()) as { ok: boolean; result: T; description?: string }
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`)
  return json.result
}

/** Скачивает файл, присланный боту. */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const file = await tg<{ file_path: string }>('getFile', { file_id: fileId })
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Telegram file download: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const markup = (buttons?: Buttons) => (buttons ? { inline_keyboard: buttons } : undefined)

export const telegramOut: TelegramOut = {
  send: (chatId, text, buttons) =>
    tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup(buttons) }),
  edit: (chatId, messageId, text, buttons) =>
    tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: markup(buttons) }).catch(() => {}),
  answer: (callbackId, text) => tg('answerCallbackQuery', { callback_query_id: callbackId, text }).catch(() => {}),
}

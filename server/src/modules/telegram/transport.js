import { config } from '../../config.js'

const TOKEN = config.telegram.token
let username = config.telegram.username

export const botEnabled = () => !!TOKEN
export const botInfo = () => ({ enabled: !!TOKEN, username })
export const setBotUsername = (name) => (username = name)

export async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`)
  return json.result
}

const markup = (buttons) => (buttons ? { inline_keyboard: buttons } : undefined)

export const telegramOut = {
  send: (chatId, text, buttons) =>
    tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: markup(buttons) }),
  edit: (chatId, messageId, text, buttons) =>
    tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: markup(buttons) }).catch(() => {}),
  answer: (callbackId, text) => tg('answerCallbackQuery', { callback_query_id: callbackId, text }).catch(() => {}),
}

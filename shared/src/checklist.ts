export interface ChecklistItem {
  text: string
  done: boolean
}
export function parseChecklist(value: string | null | undefined): ChecklistItem[] {
  return (value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      done: /^-?\s*\[x\]\s*/i.test(line),
      text: line.replace(/^-?\s*\[[ x]\]\s*/i, '').trim(),
    }))
    .filter((item) => item.text.length > 0)
}
export const serializeChecklist = (items: ChecklistItem[]) => items.map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`).join('\n')

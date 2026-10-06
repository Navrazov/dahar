import { useState } from 'react'
import { ArrowUp, SlidersHorizontal } from 'lucide-react'
import { useSave } from '@/shared/api'
import { haptic } from '@/shared/lib'
import { useEditor } from '@/features/edit-record'

export function QuickTask({ date = null }: { date?: string | null }) {
  const [title, setTitle] = useState(''),
    save = useSave('tasks'),
    edit = useEditor()
  const submit = async () => {
    const text = title.trim()
    if (!text || save.isPending) return
    haptic.tap()
    try {
      await save.mutateAsync({ title: text, status: 'todo', priority: 'medium', due_date: date })
      setTitle('')
    } catch {
      /* Global mutation handler shows the error; keep the draft. */
    }
  }
  return (
    <form
      aria-label="Быстро добавить задачу"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="flex items-center gap-1 rounded-[14px] border border-line bg-surface p-1.5 pl-4 focus-within:border-accent"
    >
      <input
        aria-label="Название новой задачи"
        value={title}
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={date ? 'Новая задача на сегодня' : 'Записать дело'}
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-fg-3"
      />
      <button
        type="button"
        aria-label="Задача с деталями"
        onClick={() => edit('tasks', { title, due_date: date })}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg-3 active:bg-hover"
      >
        <SlidersHorizontal size={18} />
      </button>
      <button
        type="submit"
        aria-label="Добавить"
        disabled={!title.trim() || save.isPending || !navigator.onLine}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-30"
      >
        <ArrowUp size={19} />
      </button>
    </form>
  )
}

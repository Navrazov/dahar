import { useState } from 'react'
import { ArrowUp, SlidersHorizontal } from 'lucide-react'
import { useList, useSave } from '@/shared/api'
import { haptic } from '@/shared/lib'
import { useEditor } from '@/features/edit-record'

export function QuickTask({ date = null }: { date?: string | null }) {
  const projects = useList('projects')
  const [project, setProject] = useState('')
  const [title, setTitle] = useState(''),
    save = useSave('tasks'),
    edit = useEditor()
  const submit = async () => {
    const text = title.trim()
    if (!text || save.isPending) return
    haptic.tap()
    try {
      await save.mutateAsync({
        title: text,
        status: 'todo',
        priority: 'medium',
        due_date: date,
        planned_date: date,
        project_id: project ? Number(project) : null,
      })
      setTitle('')
    } catch {
      /* Global mutation handler shows the error; keep the draft. */
    }
  }
  return (
    <div className="space-y-2">
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
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={date ? 'Новая задача на сегодня' : 'Записать дело'}
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-fg-3"
        />
        <button
          type="button"
          aria-label="Задача с деталями"
          onClick={() => edit('tasks', { title, due_date: date, planned_date: date, project_id: project ? Number(project) : null })}
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
      {projects.length > 0 && (
        <select
          aria-label="Проект новой задачи"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"
        >
          <option value="">Без проекта</option>
          {projects
            .filter((p) => p.status !== 'archived')
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      )}
    </div>
  )
}

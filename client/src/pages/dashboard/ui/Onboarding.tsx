import { isEnabled } from '@/entities/module'
import { useState } from 'react'
import { toast } from 'sonner'
import { useList, useSave, useSetSetting, useSettings } from '@/shared/api'
import { todayStr } from '@/shared/lib'
import { Button, Card, Input } from '@/shared/ui'

export function Onboarding() {
  const settings = useSettings()
  const tasks = useList('tasks')
  const habits = useList('habits', isEnabled(settings, 'habits'))
  const set = useSetSetting()
  const task = useSave('tasks')
  const habit = useSave('habits')
  const [title, setTitle] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  if (settings.onboarding_completed) return null
  const save = async (kind: 'task' | 'habit') => {
    setBusy(true)
    try {
      if (kind === 'task') {
        await task.mutateAsync({ title: title.trim(), status: 'todo', due_date: todayStr(), priority: 'medium', focus_date: todayStr() })
        setTitle('')
      } else {
        await habit.mutateAsync({ name: name.trim(), kind: 'build', frequency: 'daily', start_date: todayStr() })
        setName('')
      }
    } catch {
      /* Shared mutation handler reports the error. */
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="mb-6 space-y-4 p-5">
      <div>
        <h2 className="text-[16px] font-semibold">Начните с одного полезного дня</h2>
        <p className="mt-1 text-[13px] text-fg-2">Одна важная задача и одна привычка. Проекты и дополнительные направления можно подключить позже.</p>
      </div>
      {!tasks.length && (
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Первая задача"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Что главное сделать сегодня?"
            className="min-w-40 flex-1"
          />
          <Button disabled={!title.trim()} loading={busy} onClick={() => save('task')}>
            Добавить задачу
          </Button>
        </div>
      )}
      {!tasks.length && (
        <div className="flex flex-wrap gap-2">
          {['Спланировать рабочую неделю', 'Сделать первый шаг в личном проекте', 'Выделить 15 минут на новую привычку'].map((template) => (
            <Button key={template} size="sm" onClick={() => setTitle(template)}>
              {template}
            </Button>
          ))}
        </div>
      )}
      {!!tasks.length && <p className="text-[13px] text-good">Задача готова. Отметьте её выполненной, когда закончите.</p>}
      {tasks.length > 0 && isEnabled(settings, 'habits') && !habits.length && (
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Первая привычка"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: читать 15 минут"
            className="min-w-40 flex-1"
          />
          <Button disabled={!name.trim()} loading={busy} onClick={() => save('habit')}>
            Добавить привычку
          </Button>
        </div>
      )}
      {!!tasks.length && (
        <p className="text-[13px] text-fg-2">
          Хотите записывать дела из Telegram или получать напоминания? Подключите их в{' '}
          <a className="underline" href="/settings">
            настройках
          </a>
          , когда будет удобно.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-2">В конце недели загляните в «Итоги недели» — увидите, что получилось.</p>
        <Button onClick={() => set.mutate({ key: 'onboarding_completed', value: true }, { onSuccess: () => toast.success('Хорошего дня!') })}>
          {tasks.length ? 'Начать день' : 'Пропустить знакомство'}
        </Button>
      </div>
    </Card>
  )
}

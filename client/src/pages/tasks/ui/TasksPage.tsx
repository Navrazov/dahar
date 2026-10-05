import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { addDays, endOfISOWeek } from 'date-fns'
import { api, invalidateCollection, type Task, type TaskStatus, useList, useSave } from '@/shared/api'
import { todayStr, ymd } from '@/shared/lib'
import { Button, Card, Checkbox, DatePicker, Empty, FilterSelect, Input, PageHeader, SearchInput, Segmented, StatusPicker } from '@/shared/ui'
import { ProjectFilter } from '@/entities/project'
import { priorities, sortTasks, taskStatuses } from '@/entities/task'
import { useEditor } from '@/features/edit-record'
import { TaskRow } from '@/widgets/task-list'

type View = 'list' | 'board'
type Show = 'open' | 'all' | 'done'

function groupByDue(tasks: Task[]) {
  const today = todayStr()
  const tomorrow = ymd(addDays(new Date(), 1))
  const weekEnd = ymd(endOfISOWeek(new Date()))
  const groups: { key: string; title: string; items: Task[]; tone?: string }[] = [
    { key: 'overdue', title: 'Просрочено', items: [], tone: 'text-bad' },
    { key: 'today', title: 'Сегодня', items: [] },
    { key: 'tomorrow', title: 'Завтра', items: [] },
    { key: 'week', title: 'На этой неделе', items: [] },
    { key: 'later', title: 'Позже', items: [] },
    { key: 'none', title: 'Без срока', items: [] },
    { key: 'done', title: 'Выполнено', items: [] },
  ]
  const g = Object.fromEntries(groups.map((x) => [x.key, x]))
  for (const t of tasks) {
    const d = t.due_date
    if (t.status === 'done') g.done.items.push(t)
    else if (!d) g.none.items.push(t)
    else if (d < today) g.overdue.items.push(t)
    else if (d === today) g.today.items.push(t)
    else if (d === tomorrow) g.tomorrow.items.push(t)
    else if (d <= weekEnd) g.week.items.push(t)
    else g.later.items.push(t)
  }
  return groups.filter((x) => x.items.length)
}

export function TasksPage() {
  const tasks = useList('tasks')
  const projects = useList('projects')
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkDate, setBulkDate] = useState<string | null>(null)
  const [bulkProject, setBulkProject] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const bulk = async (data: Partial<Task>) => {
    setBulkBusy(true)
    try {
      await api.bulkTasks([...selected], data)
      setSelected(new Set())
      await invalidateCollection(qc, 'tasks')
      toast.success('Выбранные задачи обновлены')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }
  const edit = useEditor()
  const save = useSave('tasks')
  const [view, setView] = useState<View>('list')
  const [show, setShow] = useState<Show>('open')
  const [project, setProject] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)

  const filtered = tasks.filter(
    (t) =>
      (view === 'board' || show === 'all' || (show === 'done' ? t.status === 'done' : t.status !== 'done')) &&
      (!project || (project === 'none' ? !t.project_id : t.project_id === Number(project))) &&
      (!priority || t.priority === priority) &&
      (!q || (t.title + ' ' + (t.description || '')).toLowerCase().includes(q.toLowerCase())),
  )

  const addQuick = async () => {
    if (!quick.trim()) return
    try {
      await save.mutateAsync({
        title: quick.trim(),
        status: 'todo',
        priority: 'medium',
        due_date: todayStr(),
        project_id: project && project !== 'none' ? Number(project) : null,
      })
      setQuick('')
    } catch {}
  }

  return (
    <>
      <PageHeader
        title="Задачи"
        subtitle={`${tasks.filter((t) => t.status !== 'done').length} открытых · ${tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < todayStr()).length} просрочено`}
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'Список' },
                { value: 'board', label: 'Доска' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => edit('tasks', project && project !== 'none' ? { project_id: Number(project) } : {})}>
              Задача
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} />
        <ProjectFilter value={project} onChange={setProject} withNone />
        <FilterSelect value={priority} onChange={setPriority} all="Любой приоритет" options={priorities.map((p) => ({ value: p.value, label: p.label }))} />
        {view === 'list' && (
          <Segmented
            value={show}
            onChange={setShow}
            options={[
              { value: 'open', label: 'Открытые' },
              { value: 'done', label: 'Выполненные' },
              { value: 'all', label: 'Все' },
            ]}
          />
        )}
      </div>

      {!!selected.size && (
        <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px]">Выбрано: {selected.size}</span>
          <Button size="sm" loading={bulkBusy} onClick={() => bulk({ status: 'done' })}>
            Завершить
          </Button>
          <Button size="sm" disabled={bulkBusy} onClick={() => bulk({ due_date: ymd(addDays(new Date(), 1)) })}>
            На завтра
          </Button>
          <div className="w-40">
            <DatePicker value={bulkDate} onChange={setBulkDate} />
          </div>
          <Button size="sm" disabled={!bulkDate || bulkBusy} onClick={() => bulk({ due_date: bulkDate })}>
            Перенести
          </Button>
          <FilterSelect
            value={bulkProject}
            onChange={setBulkProject}
            all="Выберите проект"
            options={[{ value: 'none', label: 'Без проекта' }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
          />
          <Button size="sm" disabled={!bulkProject || bulkBusy} onClick={() => bulk({ project_id: bulkProject === 'none' ? null : Number(bulkProject) })}>
            Связать
          </Button>
          <Button size="sm" onClick={() => setSelected(new Set())}>
            Снять выбор
          </Button>
        </Card>
      )}
      {view === 'list' && !!filtered.length && (
        <div className="mb-2 flex items-center gap-2 text-[13px] text-fg-2">
          <Checkbox
            label="Выбрать все показанные задачи"
            checked={filtered.every((t) => selected.has(t.id))}
            onChange={() => setSelected(filtered.every((t) => selected.has(t.id)) ? new Set() : new Set(filtered.map((t) => t.id)))}
          />
          Выбрать показанные задачи
        </div>
      )}
      {view === 'list' ? (
        <Card>
          <div className="flex items-center gap-2 border-b border-line px-4 py-2">
            <Plus size={15} className="text-fg-3" />
            <Input
              value={quick}
              disabled={save.isPending}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addQuick()}
              placeholder="Быстрая задача на сегодня — введите и нажмите Enter"
              className="border-0 px-0 shadow-none hover:border-0 focus:ring-0 focus:border-0"
            />
          </div>
          {!filtered.length ? (
            <Empty title="Ничего не найдено" hint="Измените фильтры или создайте задачу" />
          ) : (
            groupByDue(filtered).map((g) => (
              <section key={g.key}>
                <div className={clsx('bg-surface-2/60 px-4 py-1.5 text-[12.5px] font-medium', g.tone || 'text-fg-2')}>
                  {g.title} <span className="text-fg-3">{g.items.length}</span>
                </div>
                <div className="divide-y divide-line">
                  {sortTasks(g.items).map((t) => (
                    <div key={t.id} className="flex items-center">
                      <div className="pl-3">
                        <Checkbox label={`Выбрать ${t.title}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <TaskRow task={t} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {taskStatuses.map((s) => {
            const col = sortTasks(filtered.filter((t) => (t.status || 'todo') === s.value))
            return (
              <div
                key={s.value}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) save.mutate({ id: dragId, status: s.value as TaskStatus })
                  setDragId(null)
                }}
                className="flex min-h-48 flex-col rounded-[10px] border border-line bg-surface-2/50"
              >
                <div className="flex items-center justify-between px-3 py-2.5 text-[12.5px] font-medium">
                  <span>
                    {s.label} <span className="text-fg-3">{col.length}</span>
                  </span>
                  <button type="button" aria-label="Добавить" onClick={() => edit('tasks', { status: s.value })} className="text-fg-3 hover:text-fg">
                    <Plus size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-2 px-2 pb-2">
                  {(s.value === 'done' ? col.slice(0, 30) : col).map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      className={clsx(
                        'relative overflow-hidden rounded-[9px] border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]',
                        dragId === t.id && 'opacity-50',
                      )}
                    >
                      <div className="[&>div]:pr-10">
                        <TaskRow task={t} />
                      </div>
                      <div className="absolute top-1.5 right-1.5">
                        <StatusPicker
                          value={t.status || 'todo'}
                          options={taskStatuses}
                          onChange={(v) => save.mutate({ id: t.id, status: v as TaskStatus })}
                          label="Статус"
                          compact
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

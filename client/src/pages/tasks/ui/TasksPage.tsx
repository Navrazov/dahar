import { accountNow } from '@/shared/lib'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { addDays, endOfISOWeek } from 'date-fns'
import { api, invalidateCollection, type Task, type TaskStatus, useList, useSave } from '@/shared/api'
import { todayStr, ymd } from '@/shared/lib'
import {
  Button,
  Card,
  Checkbox,
  DatePicker,
  DragDropProvider,
  DragHandle,
  DragShelf,
  DropZone,
  type DragItem,
  type DropTarget,
  Empty,
  FilterSelect,
  Input,
  PageHeader,
  SearchInput,
  Segmented,
  StatusPicker,
} from '@/shared/ui'
import { ProjectFilter } from '@/entities/project'
import { priorities, sortTasks, taskStatuses } from '@/entities/task'
import { useEditor } from '@/features/edit-record'
import { TaskRow } from '@/widgets/task-list'

type View = 'list' | 'board'
type Show = 'open' | 'all' | 'done'

function groupByDue(tasks: Task[]) {
  const today = todayStr()
  const tomorrow = ymd(addDays(accountNow(), 1))
  const weekEnd = ymd(endOfISOWeek(accountNow()))
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
    const d = t.planned_date || t.due_date
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
  const [selectMode, setSelectMode] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
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
  const [moving, setMoving] = useState(false)
  const [quickProject, setQuickProject] = useState('')
  const moveTask = async (item: DragItem, target: DropTarget) => {
    if (item.type !== 'task') return
    if (target.data.before) {
      if (item.id === Number(target.data.before)) return
      setMoving(true)
      try {
        await api.reorderTask(item.id, Number(target.data.before))
        await invalidateCollection(qc, 'tasks')
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setMoving(false)
      }
      return
    }
    const source = tasks.find((t) => t.id === item.id)
    if (!source) return
    const data: Partial<Task> = target.data.status
      ? { status: target.data.status as TaskStatus }
      : 'project' in target.data
        ? { project_id: target.data.project ? Number(target.data.project) : null }
        : {
            due_date: target.data.date,
            planned_date: target.data.date,
            focus_date: source.focus_date === target.data.date ? source.focus_date : null,
            ...(!target.data.date ? { due_time: null } : {}),
          }
    save.mutate({ id: item.id, ...data }, { onSuccess: () => toast.success(target.label) })
  }

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
        project_id: quickProject ? Number(quickProject) : project && project !== 'none' ? Number(project) : null,
      })
      setQuick('')
    } catch {}
  }

  return (
    <DragDropProvider onDrop={moveTask} disabled={save.isPending || moving || bulkBusy || !navigator.onLine}>
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

      <div className="mb-3 flex items-center gap-2 sm:hidden">
        <Button onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}>
          Фильтры{project || priority || q ? ' · применены' : ''}
        </Button>
        <Button
          onClick={() => {
            setSelectMode((v) => !v)
            setSelected(new Set())
          }}
        >
          {selectMode ? 'Готово' : 'Выбрать задачи'}
        </Button>
      </div>
      <div className={clsx('mb-4 flex-wrap items-center gap-2', filtersOpen ? 'flex' : 'hidden sm:flex')}>
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

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Куда перенести задачу">
        {[
          { id: 'today', label: 'На сегодня', date: todayStr() },
          { id: 'tomorrow', label: 'На завтра', date: ymd(addDays(accountNow(), 1)) },
          { id: 'none', label: 'Без срока', date: null },
        ].map((zone) => (
          <DropZone
            key={zone.id}
            target={{ id: `date:${zone.id}`, label: zone.label, data: { date: zone.date } }}
            className="flex min-h-11 items-center rounded-lg border border-dashed border-line px-3 text-xs text-fg-2"
          >
            {zone.label}
          </DropZone>
        ))}
      </div>
      <DragShelf>
        {' '}
        {projects
          .filter((p) => p.status !== 'archived' && p.status !== 'done')
          .map((p) => (
            <DropZone
              key={p.id}
              target={{ id: `project:${p.id}`, label: `В проект «${p.name}»`, data: { project: String(p.id) } }}
              className="flex min-h-11 max-w-48 items-center rounded-lg border border-dashed border-line px-3 text-xs text-fg-2"
            >
              <span className="truncate">{p.name}</span>
            </DropZone>
          ))}
      </DragShelf>
      {!!selected.size && (
        <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-[13px]">Выбрано: {selected.size}</span>
          <Button size="sm" loading={bulkBusy} onClick={() => bulk({ status: 'done' })}>
            Завершить
          </Button>
          <Button size="sm" disabled={bulkBusy} onClick={() => bulk({ due_date: ymd(addDays(accountNow(), 1)) })}>
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
        <div className={clsx('mb-2 items-center gap-2 text-[13px] text-fg-2', selectMode ? 'flex' : 'hidden sm:flex')}>
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
              className="min-w-0 flex-1 border-0 px-0 shadow-none hover:border-0 focus:ring-0 focus:border-0"
            />
            <select
              aria-label="Проект новой задачи"
              value={quickProject}
              onChange={(e) => setQuickProject(e.target.value)}
              className="h-9 max-w-40 rounded-md border border-line bg-surface px-2 text-xs"
            >
              <option value="">{project && project !== 'none' ? 'Текущий проект' : 'Без проекта'}</option>
              {projects
                .filter((p) => p.status !== 'archived')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
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
                    <DropZone
                      key={t.id}
                      target={{ id: `before:${t.id}`, label: `Перед «${t.title}»`, data: { before: String(t.id) } }}
                      className="flex items-center"
                    >
                      <DragHandle item={{ type: 'task', id: t.id, title: t.title }} />
                      <div className={clsx('pl-3', !selectMode && 'hidden sm:block')}>
                        <Checkbox label={`Выбрать ${t.title}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <TaskRow task={t} />
                      </div>
                    </DropZone>
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
              <DropZone
                key={s.value}
                target={{ id: `status:${s.value}`, label: `Статус: ${s.label}`, data: { status: s.value } }}
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
                    <div key={t.id} className={clsx('relative overflow-hidden rounded-[9px] border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04)]')}>
                      <div className="flex items-center pr-8">
                        <DragHandle item={{ type: 'task', id: t.id, title: t.title }} />
                        <div className="min-w-0 flex-1">
                          <TaskRow task={t} />
                        </div>
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
              </DropZone>
            )
          })}
        </div>
      )}
    </DragDropProvider>
  )
}

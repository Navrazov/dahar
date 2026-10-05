import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useList } from '@/shared/api'
import { Button, Card, Empty, PageHeader, Segmented } from '@/shared/ui'
import { useEditor } from '@/features/edit-record'
import { ProjectCard } from './ProjectCard'

type Filter = 'current' | 'all' | 'archive'

export function ProjectsPage() {
  const projects = useList('projects')
  const edit = useEditor()
  const [filter, setFilter] = useState<Filter>('current')
  const shown = projects.filter((p) =>
    filter === 'archive' ? p.status === 'archived' || p.status === 'done' : filter === 'current' ? p.status !== 'archived' && p.status !== 'done' : true,
  )
  const areas = [...new Set(shown.map((p) => p.area || 'Без категории'))].sort((a, b) => (a === 'Без категории' ? 1 : b === 'Без категории' ? -1 : a.localeCompare(b)))

  return (
    <>
      <PageHeader
        title="Проекты"
        subtitle="Центр системы: к проекту привязываются задачи, события, цели, сделки, продажи, контент и финансы"
        actions={
          <>
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'current', label: 'Текущие' },
                { value: 'all', label: 'Все' },
                { value: 'archive', label: 'Завершённые' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => edit('projects')}>
              Проект
            </Button>
          </>
        }
      />
      {!shown.length ? (
        <Card>
          <Empty
            title="Пока нет проектов"
            hint="Создайте проект — например «Парфюмерный бизнес» или «Обучение трейдингу» — и привязывайте к нему всё остальное"
            action={
              <Button variant="primary" icon={Plus} onClick={() => edit('projects')}>
                Создать проект
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {areas.map((area) => (
            <section key={area}>
              {areas.length > 1 && <h2 className="mb-3 text-[12.5px] font-medium text-fg-3">{area}</h2>}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {shown
                  .filter((p) => (p.area || 'Без категории') === area)
                  .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.name.localeCompare(b.name))
                  .map((p) => (
                    <ProjectCard key={p.id} p={p} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

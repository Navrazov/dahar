import { useState } from 'react'
import { Plus } from 'lucide-react'
import { byId, useList } from '@/shared/api'
import { sum } from '@/shared/lib'
import { Button, Card, CardHeader, Dot, Empty, PageHeader, Segmented, Stat } from '@/shared/ui'
import { useGoalProgress } from '@/entities/goal'
import { useEditor } from '@/features/edit-record'
import { GoalList } from '@/widgets/goal-list'

export function GoalsPage() {
  const goals = useList('goals')
  const projects = byId(useList('projects'))
  const edit = useEditor()
  const gp = useGoalProgress()
  const [show, setShow] = useState<'active' | 'all'>('active')
  const shown = goals.filter((g) => show === 'all' || g.status === 'active' || !g.status)
  const active = goals.filter((g) => g.status === 'active')
  const groups = [...new Set(shown.map((g) => g.project_id ?? 0))].sort((a, b) =>
    a === 0 ? 1 : b === 0 ? -1 : (projects.get(a)?.name || '').localeCompare(projects.get(b)?.name || ''),
  )

  return (
    <>
      <PageHeader
        title="Цели"
        subtitle="Измеримые цели с прогрессом. Привяжите цель к проекту — она будет учитываться в его прогрессе"
        actions={
          <>
            <Segmented
              value={show}
              onChange={setShow}
              options={[
                { value: 'active', label: 'Активные' },
                { value: 'all', label: 'Все' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => edit('goals')}>
              Цель
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Активные цели" value={active.length} />
        <Stat label="Достигнуто" value={goals.filter((g) => g.status === 'done').length} />
        <Stat label="Средний прогресс" value={`${active.length ? Math.round((sum(active.map(gp)) / active.length) * 100) : 0}%`} />
        <Stat label="Близко к цели (≥80%)" value={active.filter((g) => gp(g) >= 0.8).length} />
      </div>
      {!shown.length ? (
        <Card>
          <Empty
            title="Целей пока нет"
            hint="Например: «Прочитать 12 книг» с целевым значением 12"
            action={
              <Button variant="primary" icon={Plus} onClick={() => edit('goals')}>
                Создать цель
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((pid) => {
            const p = pid ? projects.get(pid) : null
            return (
              <Card key={pid}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {p && <Dot color={p.color} />}
                      {p ? p.name : 'Без проекта'}
                    </span>
                  }
                  action={
                    <Button size="sm" variant="ghost" icon={Plus} onClick={() => edit('goals', { project_id: pid || null })}>
                      Цель
                    </Button>
                  }
                />
                <GoalList goals={shown.filter((g) => (g.project_id ?? 0) === pid)} hideProject />
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

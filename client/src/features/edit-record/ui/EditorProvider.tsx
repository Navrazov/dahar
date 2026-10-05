import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, useList, useSettings, type CollectionName } from '@/shared/api'
import { money } from '@/shared/lib'
import { Button, ConfirmButton, Modal } from '@/shared/ui'
import { isEnabled } from '@/entities/module'
import { entities, type Values } from '../config/forms'
import { EditorContext, type OpenEditor } from '../model/context'
import { FieldControl } from './FieldControl'

interface State {
  table: CollectionName
  values: Values
  onSaved?: (row: any) => void
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [visible, setVisible] = useState(false)
  const unmount = useRef<ReturnType<typeof setTimeout>>(undefined)
  const settings = useSettings()
  const open = useCallback<OpenEditor>(
    (table, initial = {}, opts) => {
      const cfg = entities[table]
      if (!cfg) return
      const values = initial.id ? { ...initial } : { ...(cfg.defaults?.(settings) ?? {}), ...initial }
      clearTimeout(unmount.current)
      setState({ table, values, onSaved: opts?.onSaved })
      setVisible(true)
    },
    [settings],
  )
  // держим модалку смонтированной, пока проигрывается анимация закрытия
  const close = useCallback(() => {
    setVisible(false)
    unmount.current = setTimeout(() => setState(null), 200)
  }, [])
  return (
    <EditorContext.Provider value={open}>
      {children}
      {state && <EditorModal key={`${state.table}-${state.values.id ?? 'new'}`} state={state} open={visible} onClose={close} />}
    </EditorContext.Provider>
  )
}

function EditorModal({ state, open, onClose }: { state: State; open: boolean; onClose: () => void }) {
  const cfg = entities[state.table]!
  const qc = useQueryClient()
  const settings = useSettings()
  const products = useList('products')
  const [values, setValues] = useState<Values>(state.values)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isEdit = !!values.id

  const set = (name: string, v: unknown) => {
    setErrors((e) => ({ ...e, [name]: '' }))
    setValues((prev) => {
      const next = { ...prev, [name]: v }
      return { ...next, ...(cfg.derive?.(next, name, { products }) ?? {}) }
    })
  }

  const visible = cfg.fields.filter((f) => (f.when?.(values) ?? true) && !(f.ref === 'partners' && !isEnabled(settings, 'partners') && values[f.name] == null))

  const save = async () => {
    const missing = Object.fromEntries(
      visible.filter((f) => f.required && (values[f.name] == null || values[f.name] === '')).map((f) => [f.name, 'Обязательное поле']),
    )
    if (state.table === 'events' && values.end && values.start && values.end < values.start) missing.end = 'Окончание раньше начала'
    if (Object.keys(missing).length) return setErrors(missing)
    setBusy(true)
    try {
      const { id, created_at, ...data } = values
      if (state.table === 'events' && data.all_day && data.start) {
        data.start = String(data.start).slice(0, 10) + 'T00:00'
        data.end = String(data.end || data.start).slice(0, 10) + 'T23:59'
      }
      const row = id ? await api.update(state.table, id, data) : await api.create(state.table, data)
      await refreshLists(qc)
      toast.success(isEdit ? 'Сохранено' : `${cfg.title}: создано`)
      if (state.table === 'transactions' && data.kind === 'expense' && data.category)
        warnBudget(String(data.category), String(data.date || ''), settings.currency || '₽')
      state.onSaved?.(row)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setRemoving(true)
    try {
      await api.remove(state.table, values.id)
      await refreshLists(qc)
      toast.success('Удалено')
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? cfg.title : cfg.newLabel}
      width={cfg.fields.length > 10 ? 680 : 560}
      footer={
        <>
          <div>{isEdit && <ConfirmButton onConfirm={remove} loading={removing} />}</div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Отмена</Button>
            <Button variant="primary" onClick={save} loading={busy}>
              {isEdit ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
        }}
      >
        {visible.map((f, i) => (
          <FieldControl
            key={f.name}
            field={f}
            table={state.table}
            settings={settings}
            value={values[f.name]}
            values={values}
            error={errors[f.name]}
            onChange={(v) => set(f.name, v)}
            autoFocus={i === 0 && !isEdit}
          />
        ))}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** Онлайн ждём свежие списки, чтобы окно закрылось с актуальными данными; офлайн — кэш уже поправлен очередью. */
function refreshLists(qc: QueryClient) {
  const refetch = qc.invalidateQueries()
  return navigator.onLine ? refetch : undefined
}

async function warnBudget(category: string, date: string, cur: string) {
  const s = await api.financeSummary(date.slice(0, 7)).catch(() => null)
  const b = s?.budgets.find((x) => x.category.toLowerCase() === category.toLowerCase())
  if (!b || !b.amount) return
  if (b.spent > b.amount) toast.warning(`Бюджет «${b.category}» превышен: ${money(b.spent, cur)} из ${money(b.amount, cur)}`)
  else if (b.spent >= b.amount * 0.8) toast.warning(`Бюджет «${b.category}»: потрачено ${Math.round((b.spent / b.amount) * 100)}%`)
}

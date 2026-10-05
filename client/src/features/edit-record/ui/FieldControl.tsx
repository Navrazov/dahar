import { useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { ImagePlus, Trash2 } from 'lucide-react'
import { api, useList, type CollectionName, type Settings } from '@/shared/api'
import { swatches, WEEKDAY_SHORT } from '@/shared/lib'
import {
  DatePicker,
  DateTimePicker,
  FieldLabel,
  IconButton,
  Input,
  NumberInput,
  PhoneInput,
  PopoverPanel,
  Select,
  Switch,
  TelegramInput,
  Textarea,
  TimePicker,
} from '@/shared/ui'
import type { Field, Values } from '../config/forms'

function resolveSuffix(s: string | undefined, settings: Settings) {
  if (s === 'cur') return settings.currency || '₽'
  if (s === 'tcur') return settings.trading_currency || '$'
  return s
}

export function FieldControl({
  field: f,
  table,
  settings,
  value,
  values,
  error,
  onChange,
  autoFocus,
}: {
  field: Field
  table: CollectionName
  settings: Settings
  value: any
  values: Values
  error?: string
  onChange: (v: any) => void
  autoFocus?: boolean
}) {
  const wide = f.full || f.type === 'textarea' || f.type === 'image' || f.type === 'days' || f.type === 'color'
  const group = f.type === 'days' || f.type === 'color' || f.type === 'image'
  const wrap = (node: ReactNode) => (
    <FieldLabel
      group={group}
      label={f.label + (f.required ? ' *' : '')}
      className={clsx(wide && 'sm:col-span-2', error && '[&_input]:border-bad [&_button]:border-bad')}
      hint={error ? <span className="text-bad">{error}</span> : undefined}
    >
      {node}
    </FieldLabel>
  )

  switch (f.type) {
    case 'textarea':
      return wrap(<Textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />)
    case 'number':
      return wrap(
        <NumberInput
          value={value}
          onChange={onChange}
          placeholder={f.placeholder}
          suffix={resolveSuffix(f.suffix, settings)}
          allowNegative={!f.positive}
          autoFocus={autoFocus}
        />,
      )
    case 'date':
      return wrap(<DatePicker value={value} onChange={onChange} />)
    case 'time':
      return wrap(<TimePicker value={value} onChange={onChange} />)
    case 'datetime':
      return wrap(<DateTimePicker value={value} onChange={onChange} dateOnly={!!values.all_day} />)
    case 'select':
      return wrap(<Select value={value} onChange={onChange} options={f.options!.map((o) => ({ value: o.value, label: o.label }))} />)
    case 'ref':
      return wrap(<RefSelect field={f} value={value} values={values} onChange={onChange} />)
    case 'phone':
      return wrap(<PhoneInput value={value} onChange={onChange} />)
    case 'telegram':
      return wrap(<TelegramInput value={value} onChange={onChange} />)
    case 'email':
      return wrap(
        <Input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={value ?? ''}
          placeholder="name@example.com"
          onChange={(e) => onChange(e.target.value.trim())}
        />,
      )
    case 'checkbox':
      return (
        <div className={clsx('self-end', f.full && 'sm:col-span-2')}>
          <Switch checked={!!value} onChange={onChange} label={f.label} />
        </div>
      )
    case 'color':
      return wrap(
        <div className="flex flex-wrap items-center gap-2">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Цвет ${c}`}
              aria-pressed={value === c}
              onClick={() => onChange(value === c ? null : c)}
              className={clsx('h-6 w-6 rounded-full transition-transform hover:scale-110', value === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface')}
              style={{ background: c }}
            />
          ))}
        </div>,
      )
    case 'days': {
      const days: number[] = value || []
      return wrap(
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_SHORT.map((n, i) => {
            const d = i + 1
            const on = days.includes(d)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d].sort())}
                className={clsx(
                  'h-9 w-11 rounded-[7px] border text-[13.5px] font-medium transition-colors',
                  on ? 'border-ink bg-ink text-on-ink' : 'border-line text-fg-2 hover:bg-hover',
                )}
              >
                {n}
              </button>
            )
          })}
        </div>,
      )
    }
    case 'image':
      return wrap(<ImageField value={value} onChange={onChange} />)
    default:
      return wrap(
        f.suggest || f.suggestFrom ? (
          <SuggestInput
            table={f.suggestFrom?.table ?? table}
            column={f.suggestFrom?.column ?? f.name}
            value={value}
            onChange={onChange}
            placeholder={f.placeholder}
            autoFocus={autoFocus}
          />
        ) : (
          <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} autoFocus={autoFocus} />
        ),
      )
  }
}

function SuggestInput({
  table,
  column,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  table: CollectionName
  column: string
  value: any
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const rows = useList(table) as any[]
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const all = useMemo(() => [...new Set(rows.map((r) => r[column]).filter(Boolean))].sort() as string[], [rows, column])
  const q = String(value ?? '').toLowerCase()
  const options = all.filter((o) => o.toLowerCase().includes(q) && o !== value).slice(0, 8)
  return (
    <PopoverPanel
      open={open && options.length > 0}
      onOpenChange={setOpen}
      keepFocus
      ignoreRef={wrap}
      matchWidth
      anchor={
        <div ref={wrap}>
          <Input
            value={value ?? ''}
            onChange={(e) => {
              onChange(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => e.key === 'Escape' && open && (e.stopPropagation(), setOpen(false))}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
          />
        </div>
      }
    >
      <div className="p-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange(o)
              setOpen(false)
            }}
            className="flex h-8 w-full items-center rounded-[7px] px-2 text-left text-[13.5px] hover:bg-hover"
          >
            {o}
          </button>
        ))}
      </div>
    </PopoverPanel>
  )
}

function RefSelect({ field, value, values, onChange }: { field: Field; value: any; values: Values; onChange: (v: number | null) => void }) {
  const projects = useList('projects')
  const partners = useList('partners')
  const products = useList('products')
  const customers = useList('customers')
  const accounts = useList('accounts')
  const goals = useList('goals')

  let options: { value: string; label: string; dot?: string | null; hint?: string }[] = []
  switch (field.ref) {
    case 'projects':
      options = projects.filter((p) => p.status !== 'archived' || p.id === value).map((p) => ({ value: String(p.id), label: p.name, dot: p.color }))
      break
    case 'partners':
      options = partners.map((p) => ({ value: String(p.id), label: p.name, hint: p.company ?? undefined }))
      break
    case 'products':
      options = products.map((p) => ({
        value: String(p.id),
        label: `${p.brand ? p.brand + ' — ' : ''}${p.name}${p.volume ? ' ' + p.volume : ''}`,
        hint: `${p.stock ?? 0} шт`,
      }))
      break
    case 'customers':
      options = customers.map((c) => ({ value: String(c.id), label: c.name, hint: c.instagram ?? c.phone ?? undefined }))
      break
    case 'accounts':
      options = accounts
        .filter((a) => (!a.archived || a.id === value) && !(field.name === 'to_account_id' && a.id === values.account_id))
        .map((a) => ({ value: String(a.id), label: a.name, dot: a.color }))
      break
    case 'goals':
      options = goals
        .filter((g) => g.id === value || (g.status === 'active' && (!values.project_id || g.project_id === values.project_id)))
        .map((g) => ({ value: String(g.id), label: g.title }))
      break
  }
  const empty = {
    projects: 'Без проекта',
    partners: 'Без партнёра',
    products: 'Без товара',
    customers: 'Без клиента',
    accounts: 'Не выбран',
    goals: 'Без цели',
  }[field.ref!]
  return (
    <Select
      value={value == null ? null : String(value)}
      onChange={(v) => onChange(v ? Number(v) : null)}
      options={options}
      clearable
      clearLabel={empty}
      placeholder={empty}
      searchable={options.length > 6}
    />
  )
}

async function fileToDataUrl(file: File, max = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

function ImageField({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const take = async (file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('Нужен файл изображения')
    try {
      const id = toast.loading('Загружаю изображение…')
      const { url } = await api.upload(await fileToDataUrl(file))
      toast.dismiss(id)
      onChange(url)
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Не удалось загрузить изображение. Попробуйте PNG или JPG')
    }
  }
  if (value) {
    return (
      <div className="relative overflow-hidden rounded-[9px] border border-line">
        <img src={value} alt="Скриншот сделки" className="max-h-72 w-full bg-surface-2 object-contain" />
        <IconButton icon={Trash2} label="Удалить скриншот" onClick={() => onChange(null)} className="absolute top-2 right-2 bg-surface shadow" />
      </div>
    )
  }
  return (
    <div
      tabIndex={0}
      onPaste={(e) => take(e.clipboardData.files[0])}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        take(e.dataTransfer.files[0])
      }}
      className="flex flex-col items-center justify-center gap-1 rounded-[9px] border border-dashed border-line-strong px-4 py-6 text-center text-[12.5px] text-fg-3 outline-none focus:border-accent"
    >
      <ImagePlus size={18} />
      <span>Перетащите или вставьте (⌘V после клика сюда), или</span>
      <label className="cursor-pointer font-medium text-accent-text hover:underline">
        выберите файл
        <input type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} />
      </label>
    </div>
  )
}

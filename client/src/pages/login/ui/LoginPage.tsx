import { LoginForm } from '@/features/auth'

const lines = ['Задачи и проекты', 'Привычки', 'Деньги и бюджеты', 'Партнёры, сделки, продажи']

export function LoginPage() {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center px-6 py-12">
        <LoginForm />
      </div>
      <div className="hidden flex-col justify-end border-l border-line bg-surface-2 p-14 lg:flex">
        <ul className="space-y-1 text-[40px] leading-[1.1] font-semibold tracking-[-0.035em] text-fg-3">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
          <li className="text-fg">в одном месте.</li>
        </ul>
      </div>
    </div>
  )
}

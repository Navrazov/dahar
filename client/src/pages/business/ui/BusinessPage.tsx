import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useList } from '@/shared/api'
import { Button, PageHeader, Tabs } from '@/shared/ui'
import { useModule } from '@/entities/module'
import { useEditor } from '@/features/edit-record'
import { ModuleSettings } from '@/features/module-settings'
import { Overview } from './Overview'
import { Products } from './Products'
import { Sales } from './Sales'
import { Customers } from './Customers'
import { Expenses } from './Expenses'
import { ContentBoard } from './ContentBoard'

type Tab = 'overview' | 'products' | 'sales' | 'customers' | 'expenses' | 'content'

export function BusinessPage() {
  const { label: title } = useModule('business')
  const [tab, setTab] = useState<Tab>('overview')
  const edit = useEditor()
  const products = useList('products')
  const sales = useList('sales')
  const customers = useList('customers')
  const expenses = useList('biz_expenses')
  const content = useList('content')

  const addAction: Record<Tab, { label: string; table: 'sales' | 'products' | 'customers' | 'biz_expenses' | 'content' }> = {
    overview: { label: 'Продажа', table: 'sales' },
    sales: { label: 'Продажа', table: 'sales' },
    products: { label: 'Товар', table: 'products' },
    customers: { label: 'Клиент', table: 'customers' },
    expenses: { label: 'Расход', table: 'biz_expenses' },
    content: { label: 'Контент', table: 'content' },
  }

  return (
    <>
      <PageHeader
        title={title}
        subtitle="Товары, склад, продажи, клиенты, расходы и контент-план"
        actions={
          <>
            <ModuleSettings
              title="Настройки бизнеса"
              items={[
                {
                  key: 'business_project_id',
                  label: 'Проект бизнеса',
                  type: 'project',
                  hint: 'Новые товары, продажи, расходы и контент автоматически привязываются к нему',
                },
                { key: 'currency', label: 'Валюта', type: 'currency', hint: 'Общая валюта для бизнеса и личных финансов' },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => edit(addAction[tab].table)}>
              {addAction[tab].label}
            </Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Обзор' },
          { value: 'products', label: 'Товары', count: products.length },
          { value: 'sales', label: 'Продажи', count: sales.length },
          { value: 'customers', label: 'Клиенты', count: customers.length },
          { value: 'expenses', label: 'Расходы', count: expenses.length },
          { value: 'content', label: 'Контент', count: content.filter((c) => c.status !== 'published').length },
        ]}
      />
      {tab === 'overview' && <Overview />}
      {tab === 'products' && <Products />}
      {tab === 'sales' && <Sales />}
      {tab === 'customers' && <Customers />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'content' && <ContentBoard />}
    </>
  )
}

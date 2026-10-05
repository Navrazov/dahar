/** Операция, разобранная из выписки банка, до сопоставления с базой. */
export interface ParsedRow {
  date: string
  time: string
  kind: 'income' | 'expense'
  amount: number
  description: string
  bank_category: string
  mcc: string
}

export type Bank = 'tbank' | 'sber' | 'csv'

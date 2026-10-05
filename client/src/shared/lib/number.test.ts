import { describe, expect, it } from 'vitest'
import { money, num, signedMoney } from './number'

const clean = (s: string) => s.replace(/\s/g, ' ')

describe('number formatting', () => {
  it('formats money with the currency in the right place', () => {
    expect(clean(money(1234.5))).toBe('1 235 ₽')
    expect(clean(money(1234.5, '$', 2))).toBe('$1 234,5')
    expect(clean(money(-50))).toBe('−50 ₽')
    expect(clean(signedMoney(50))).toBe('+50 ₽')
  })

  it('shows a dash for missing values', () => {
    expect(num(null)).toBe('—')
    expect(money(Number.NaN)).toBe('—')
  })
})

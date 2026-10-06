import { afterEach, expect, test } from 'vitest'
import { accountNow, setAccountTimezone, ymd } from './date'
afterEach(() => setAccountTimezone())
test('account calendar day can differ from browser day', () => {
  const instant = new Date('2026-10-06T01:00:00Z')
  setAccountTimezone('Europe/Moscow')
  expect(ymd(accountNow(instant))).toBe('2026-10-06')
  expect(accountNow(instant).getHours()).toBe(4)
  setAccountTimezone('America/Los_Angeles')
  expect(ymd(accountNow(instant))).toBe('2026-10-05')
  expect(accountNow(instant).getHours()).toBe(18)
})
test('account wall time follows daylight saving transition', () => {
  setAccountTimezone('America/New_York')
  expect(accountNow(new Date('2026-03-08T06:59:00Z')).getHours()).toBe(1)
  expect(accountNow(new Date('2026-03-08T07:01:00Z')).getHours()).toBe(3)
})

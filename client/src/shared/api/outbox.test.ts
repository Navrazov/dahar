import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushOutbox, remapBody, setOutboxOwner, failedChanges, retryChange, type OutboxItem } from './outbox'
const mock = vi.hoisted(() => ({ items: [] as Record<string, any>[], maps: new Map<string, Record<string, number>>() }))
vi.mock('../lib/idb', () => ({
  idbAvailable: () => true,
  kv: { get: async (k: string) => mock.maps.get(k) },
  queue: {
    all: async () => structuredClone(mock.items),
    put: async (item: Record<string, any>) => {
      mock.items = mock.items.map((x) => (x.seq === item.seq ? item : x))
    },
    remove: async (seq: number) => {
      mock.items = mock.items.filter((x) => x.seq !== seq)
    },
    complete: async (seq: number, key: string, map: Record<string, number>) => {
      mock.maps.set(key, map)
      mock.items = mock.items.filter((x) => x.seq !== seq)
    },
    withLease: async (run: () => Promise<unknown>) => run(),
  },
}))
const item = (seq: number, data: Partial<OutboxItem> = {}): OutboxItem => ({
  seq,
  owner: 1,
  url: '/api/tasks',
  method: 'POST',
  body: '{"title":"Task"}',
  createdAt: 1,
  operationKey: `operation-key-${seq}`,
  tempId: -seq,
  ...data,
})
beforeEach(() => {
  mock.items = []
  mock.maps.clear()
  setOutboxOwner(1)
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
  vi.stubGlobal(
    'CustomEvent',
    class {
      constructor(
        public name: string,
        public init: unknown,
      ) {}
    },
  )
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, run: () => Promise<unknown>) => run() } })
})
afterEach(() => vi.unstubAllGlobals())
describe('offline reliability', () => {
  it('remaps identities, including bulk fields, without changing text or negative amounts', () => {
    const body = { id: -1, account_id: -2, amount: -1, description: 'id: -1', ids: [-1, -2], data: { project_id: -1, amount: -2 } }
    expect(
      JSON.parse(
        remapBody(
          JSON.stringify(body),
          new Map([
            [-1, 10],
            [-2, 20],
          ]),
        )!,
      ),
    ).toEqual({ ...body, id: 10, account_id: 20, ids: [10, 20], data: { project_id: 10, amount: -2 } })
  })
  it('a validation failure retains its dependent operations and can be corrected', async () => {
    mock.items = [item(1), item(2, { method: 'PATCH', url: '/api/tasks/-1', body: '{"status":"done"}', tempId: undefined })]
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{"error":"Too long"}', { status: 400 }))
    vi.stubGlobal('fetch', fetch)
    expect((await flushOutbox()).failed).toHaveLength(1)
    expect(mock.items).toHaveLength(2)
    expect(await failedChanges()).toHaveLength(1)
    await retryChange(1, '{"title":"Fixed"}')
    fetch.mockResolvedValueOnce(new Response('{"id":5}')).mockResolvedValueOnce(new Response('{"id":5,"status":"done"}'))
    expect((await flushOutbox()).sent).toBe(2)
    expect(fetch.mock.calls.at(-1)?.[0]).toBe('/api/tasks/5')
    expect(mock.items).toHaveLength(0)
    expect(fetch.mock.calls[1][1].headers['Idempotency-Key']).toBe('operation-key-1')
  })
  it('network and server errors keep the original key for later retries', async () => {
    mock.items = [item(1)]
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"id":9}'))
    vi.stubGlobal('fetch', fetch)
    expect((await flushOutbox()).sent).toBe(0)
    expect((await flushOutbox()).sent).toBe(0)
    expect((await flushOutbox()).sent).toBe(1)
    expect(fetch.mock.calls.map((c) => c[1].headers['Idempotency-Key'])).toEqual(['operation-key-1', 'operation-key-1', 'operation-key-1'])
  })
  it('keeps other owners intact and resumes with a persisted temporary ID mapping', async () => {
    mock.maps.set('outbox-ids:1', { '-4': 42 })
    mock.items = [item(1, { owner: 2 }), item(2, { url: '/api/tasks/-4', method: 'PATCH', tempId: undefined, body: '{"project_id":-4}' })]
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    expect((await flushOutbox()).sent).toBe(1)
    expect(mock.items[0].owner).toBe(2)
    expect(fetch.mock.calls[0][0]).toBe('/api/tasks/42')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ project_id: 42 })
  })
})

/** Минимальная обёртка над IndexedDB: хранилище «ключ — значение» и очередь с автоинкрементом. */

const DB_NAME = 'dahar'
const VERSION = 1
export const STORES = { kv: 'kv', outbox: 'outbox' } as const

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.kv)) db.createObjectStore(STORES.kv)
      if (!db.objectStoreNames.contains(STORES.outbox)) db.createObjectStore(STORES.outbox, { keyPath: 'seq', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function store(name: string, mode: IDBTransactionMode) {
  return (await open()).transaction(name, mode).objectStore(name)
}

export const idbAvailable = () => typeof indexedDB !== 'undefined'

export const kv = {
  get: async <T>(key: string) => done((await store(STORES.kv, 'readonly')).get(key)) as Promise<T | undefined>,
  set: async (key: string, value: unknown) => void (await done((await store(STORES.kv, 'readwrite')).put(value, key))),
  del: async (key: string) => void (await done((await store(STORES.kv, 'readwrite')).delete(key))),
}

export const queue = {
  add: async <T extends object>(item: T) => Number(await done((await store(STORES.outbox, 'readwrite')).add(item))),
  all: async <T>() => done((await store(STORES.outbox, 'readonly')).getAll()) as Promise<T[]>,
  put: async (item: object) => void (await done((await store(STORES.outbox, 'readwrite')).put(item))),
  remove: async (seq: number) => void (await done((await store(STORES.outbox, 'readwrite')).delete(seq))),
  count: async () => done((await store(STORES.outbox, 'readonly')).count()),
  clear: async () => void (await done((await store(STORES.outbox, 'readwrite')).clear())),
}

/** Удаляет все локальные данные пользователя — при выходе из аккаунта. */
export async function wipeLocalData() {
  if (!idbAvailable()) return
  dbPromise?.then((db) => db.close()).catch(() => {})
  dbPromise = null
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

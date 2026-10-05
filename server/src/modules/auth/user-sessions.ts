import { createSessionStore } from './sessions.ts'

export const userSessions = createSessionStore({ table: 'sessions', owner: 'user_id', cookie: 'sid', bearer: true })

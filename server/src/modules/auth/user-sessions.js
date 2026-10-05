import { createSessionStore } from './sessions.js'

export const userSessions = createSessionStore({ table: 'sessions', owner: 'user_id', cookie: 'sid' })

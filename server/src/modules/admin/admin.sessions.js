import { createSessionStore } from '../auth/sessions.js'

export const adminSessions = createSessionStore({ table: 'admin_sessions', owner: 'admin_id', cookie: 'dahar_admin', path: '/api/admin', days: 7 })

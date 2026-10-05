import { Router } from 'express'
import { search } from './search.service.ts'

export function searchRoutes() {
  const r = Router()
  r.get('/', async (req, res) => res.json(await search(req.user.id, String(req.query.q ?? ''))))
  return r
}

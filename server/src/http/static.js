import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')

function spa(dist, { serviceWorker = false } = {}) {
  const r = express.Router()
  if (serviceWorker) {
    r.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(resolve(dist, 'sw.js'))
    })
  }
  r.use('/assets', express.static(resolve(dist, 'assets'), { maxAge: '1y', immutable: true }))
  r.use(express.static(dist, { index: false, maxAge: '1d' }))
  r.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(resolve(dist, 'index.html'))
  })
  return r
}

export function mountFrontends(app) {
  const admin = resolve(root, 'admin/dist')
  const client = resolve(root, 'client/dist')
  if (existsSync(admin)) app.use('/admin', spa(admin))
  if (existsSync(client)) app.use(spa(client, { serviceWorker: true }))
}

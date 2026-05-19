import { createServer } from 'http'
import { fileURLToPath } from 'url'
import path from 'path'
import express from 'express'
import { Server } from 'socket.io'
import { GameRoom } from './GameRoom.js'

const PORT = process.env.PORT || 3001

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
// Built client lives at <repo>/client/dist (Vite outDir)
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist')

const app = express()

// Serve the built client as static assets
app.use(express.static(CLIENT_DIST, { fallthrough: true, maxAge: '1h' }))

// SPA fallback — anything not matched by static serves index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next()
  res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => {
    if (err) next(err)
  })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
})

const room = new GameRoom(io)

httpServer.listen(PORT, () => {
  console.log(`[server] running on :${PORT}`)
  console.log(`[server] serving client from ${CLIENT_DIST}`)
})

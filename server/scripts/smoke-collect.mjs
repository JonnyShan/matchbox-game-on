// Smoke test for Matchbox COLLECT mode.
import { createServer } from 'node:http'
import { Server }       from 'socket.io'
import { io as ioc }    from 'socket.io-client'
import { GameRoom }     from '../src/GameRoom.js'

const log = (...a) => console.log('[smoke]', ...a)

const httpServer = createServer()
const io = new Server(httpServer)
const room = new GameRoom(io)
await new Promise((r) => httpServer.listen(0, r))
const port = httpServer.address().port

const url = `http://localhost:${port}`
const connect = () => new Promise((r) => { const s = ioc(url, { transports: ['websocket'] }); s.on('connect', () => r(s)) })
const waitFor = (s, evt, ms = 2500) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout ' + evt)), ms)
  s.once(evt, (d) => { clearTimeout(t); res(d) })
})

let fails = 0
const check = (label, ok) => { if (ok) log('PASS:', label); else { console.error('FAIL:', label); fails++ } }

try {
  const a = await connect()
  const b = await connect()

  a.emit('player:join', { name: 'collector-a', mode: 'collect', carColor: 0, carType: 'default' })
  b.emit('player:join', { name: 'collector-b', mode: 'collect', carColor: 1, carType: 'speeder' })
  const ja = await waitFor(a, 'room:joined')
  const jb = await waitFor(b, 'room:joined')
  log('a joined mode=', ja.mode, ' pickups=', ja.collectState?.pickups?.length)
  check('a got mode=collect', ja.mode === 'collect')
  check('a got 10 pickup defs', ja.collectState?.pickups?.length === 10)
  check('a got matchEndAt', typeof ja.collectState?.matchEndAt === 'number')
  check('b also got 10 pickups (same match)', jb.collectState?.pickups?.length === 10)
  check('b matchEndAt equals a\'s', jb.collectState?.matchEndAt === ja.collectState?.matchEndAt)

  // Position client A on top of pickup 0 (plateau apex at (0,0,2.6))
  const p0 = ja.collectState.pickups[0]
  a.emit('player:snapshot', { pos: [p0.x, p0.y, p0.z], quat: [0,0,0,1], vel: [0,0,0], angVel: [0,0,0], wheels: [] })

  const pickup = await waitFor(b, 'collect:pickup', 2500)
  log('first collect:', pickup)
  check('A collected pickup #0', pickup.idx === 0 && pickup.byId === a.id)
  check('A score = 1', pickup.score === 1)
  check('completed = false', pickup.completed === false)

  // Register listeners BEFORE driving so we don't miss the 'finished' emit
  const allPickups = []
  let finishedEvent = null
  b.on('collect:pickup',    (p) => allPickups.push(p))
  b.on('collect:finished',  (d) => { finishedEvent = d })

  for (let i = 1; i < 10; i++) {
    const p = ja.collectState.pickups[i]
    a.emit('player:snapshot', { pos: [p.x, p.y, p.z], quat: [0,0,0,1], vel: [0,0,0], angVel: [0,0,0], wheels: [] })
    await new Promise(r => setTimeout(r, 250))
  }
  // Drain any pending events
  await new Promise(r => setTimeout(r, 200))
  log('total pickup events received by b:', allPickups.length, 'idx:', allPickups.map(p => p.idx))
  log('completed flags:', allPickups.map(p => p.completed))

  const finished = finishedEvent
  log('finished:', finished)
  check('A won (collected all 10)', finished.winnerId === a.id)
  check('reason = target', finished.reason === 'target')

  a.disconnect(); b.disconnect()
} catch (e) {
  console.error('EXCEPTION', e)
  fails++
}

httpServer.close()
process.exit(fails > 0 ? 1 : 0)

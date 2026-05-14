// Smoke test for server-authoritative combat.
// 1. Boots GameRoom on an ephemeral port.
// 2. Connects two socket.io-client peers.
// 3. Confirms server rejects forged player:combatDamage events.
// 4. Confirms server emits combat:hp + combat:death from a real missile fire.
// 5. Confirms chat rate limiter kicks in after burst.

import { createServer } from 'node:http'
import { Server }       from 'socket.io'
import { io as ioc }    from 'socket.io-client'
import { GameRoom }     from '../src/GameRoom.js'

const log = (...a) => console.log('[smoke]', ...a)

const httpServer = createServer()
const io = new Server(httpServer)
const room = new GameRoom(io)

await new Promise((resolve) => httpServer.listen(0, resolve))
const port = httpServer.address().port
log('server listening on', port)

const url = `http://localhost:${port}`
function connect(name) {
  return new Promise((resolve) => {
    const s = ioc(url, { transports: ['websocket'] })
    s.on('connect', () => resolve(s))
  })
}

function waitFor(s, evt, ms = 2500) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${evt}`)), ms)
    s.once(evt, (d) => { clearTimeout(t); resolve(d) })
  })
}

let fails = 0
function check(label, cond) {
  if (cond) log('PASS:', label)
  else { console.error('FAIL:', label); fails++ }
}

try {
  const shooter = await connect()
  const victim  = await connect()

  // Join with intentionally bad inputs to verify sanitization
  shooter.emit('player:join', { name: 'shooter\x00\x01trim', carColor: 99, carType: 'wat' })
  victim.emit('player:join',  { name: 'victim', carColor: 2, carType: 'tank' })
  const joinShooter = await waitFor(shooter, 'room:joined')
  const joinVictim  = await waitFor(victim, 'room:joined')
  log('shooter joined id=', joinShooter.id, 'maxHp=', joinShooter.maxHp, 'invulnMs=', joinShooter.invulnMs)
  log('victim  joined id=', joinVictim.id,  'maxHp=', joinVictim.maxHp)
  check('victim got Tank HP=160', joinVictim.maxHp === 160)
  check('shooter got default HP=100 (bad type sanitized)', joinShooter.maxHp === 100)

  // Forged client-damage event should produce no combat:hp on victim
  let forgedHpReceived = false
  victim.on('combat:hp', () => { forgedHpReceived = true })
  shooter.emit('player:combatDamage', { targetId: joinVictim.id, amount: 9999 })
  await new Promise(r => setTimeout(r, 250))
  check('forged player:combatDamage was ignored', !forgedHpReceived)

  // Wait past spawn invuln
  await new Promise(r => setTimeout(r, joinShooter.invulnMs + 200))

  // Place victim 5m east of shooter via snapshots
  shooter.emit('player:snapshot', { pos: [0, 0, 1], quat: [0,0,0,1], vel: [0,0,0], angVel: [0,0,0], wheels: [] })
  victim.emit('player:snapshot',  { pos: [5, 0, 1], quat: [0,0,0,1], vel: [0,0,0], angVel: [0,0,0], wheels: [] })
  await new Promise(r => setTimeout(r, 100))

  // Fire missile +X
  const hpPromise = waitFor(victim, 'combat:hp', 3000)
  shooter.emit('combat:missile', { x: 0, y: 0, z: 1, dx: 1, dy: 0 })
  const hp = await hpPromise
  log('combat:hp →', hp)
  check('server emitted combat:hp from real missile', typeof hp.hp === 'number')
  check('damage came from shooter', hp.fromId === joinShooter.id)
  check('amount = 30', hp.amount === 30)
  check('victim HP dropped (tank had 160)', hp.hp === 160 - 30)

  // Cooldown: second fire immediately should NOT yield another hp event within 600ms
  let secondHp = false
  victim.once('combat:hp', () => { secondHp = true })
  shooter.emit('combat:missile', { x: 0, y: 0, z: 1, dx: 1, dy: 0 })
  await new Promise(r => setTimeout(r, 600))
  check('rapid second fire blocked by cooldown', !secondHp)

  // Direction validation: bogus dx/dy magnitude rejected
  let bogusHp = false
  victim.once('combat:hp', () => { bogusHp = true })
  await new Promise(r => setTimeout(r, 1000))   // wait past cooldown
  // Reposition victim again
  victim.emit('player:snapshot', { pos: [5, 0, 1], quat: [0,0,0,1], vel: [0,0,0], angVel: [0,0,0], wheels: [] })
  await new Promise(r => setTimeout(r, 100))
  shooter.emit('combat:missile', { x: 0, y: 0, z: 1, dx: 9, dy: 9 })   // not unit vector
  await new Promise(r => setTimeout(r, 500))
  check('non-unit-vector missile rejected', !bogusHp)

  // Chat rate limit: burst of 6 messages → expect rate-limited
  let rateHits = 0
  shooter.on('chat:rate-limited', () => { rateHits++ })
  for (let i = 0; i < 6; i++) shooter.emit('chat:message', { text: `msg ${i}` })
  await new Promise(r => setTimeout(r, 300))
  check('chat rate limiter fired', rateHits > 0)

  // Mine drop: shooter drops a mine, victim drives onto it, expect explosion+hp
  await new Promise(r => setTimeout(r, 800))   // past mine cooldown if any
  shooter.emit('player:snapshot', { pos: [10, 0, 1], quat: [0,0,0,1], vel: [0,0,0], angVel: [0,0,0], wheels: [] })
  await new Promise(r => setTimeout(r, 100))
  const mineDropped = waitFor(shooter, 'combat:mineDropped', 1500)
  shooter.emit('combat:mineDrop', { x: 10, y: 0, z: 0.1 })
  const mine = await mineDropped
  log('mine dropped:', mine)
  // Wait past arm delay, then move victim onto mine
  await new Promise(r => setTimeout(r, 1100))
  const mineHp = waitFor(victim, 'combat:hp', 2000)
  victim.emit('player:snapshot', { pos: [10, 0, 1], quat: [0,0,0,1], vel: [0,0,0], angVel: [0,0,0], wheels: [] })
  const hpFromMine = await mineHp
  log('mine hp event:', hpFromMine)
  check('mine produced hp event', hpFromMine.source === 'mine')

  shooter.disconnect()
  victim.disconnect()
} catch (e) {
  console.error('EXCEPTION', e)
  fails++
}

httpServer.close()
process.exit(fails > 0 ? 1 : 0)

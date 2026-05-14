import CANNON from 'cannon'
import { PhysicsWorld } from './PhysicsWorld.js'
import { HealthSystem } from './HealthSystem.js'
import { CombatRules } from './CombatRules.js'
import { MinesSystem } from './MinesSystem.js'
import { ChatRateLimiter } from './ChatRateLimiter.js'
import {
  sanitizeName,
  sanitizeCarColor,
  sanitizeCarType,
  sanitizeChatText,
  isValidSpawnVec,
  isValidPos,
} from './Validators.js'
import { NETWORK, COMBAT, SPAWN_GRID } from '../../shared/constants.js'

const { tickRate, physicsRate, maxPlayers } = NETWORK

export class GameRoom {
  constructor(io) {
    this.io      = io
    this.physics = new PhysicsWorld()
    this.players = new Map() // socketId → { id, name, carColor, carType, actions, spawnXY, clientSnapshot, kills }

    this.health = new HealthSystem()
    this.combat = new CombatRules()
    this.mines  = new MinesSystem()
    this.chat   = new ChatRateLimiter()
    this._pendingMeteors = []   // [{ x, y, impactAt }]

    this._startLoop()
    this._setupSocketEvents()
    this._startMeteorShower()
  }

  // Server-driven meteor shower so all players see the same impacts.
  // Skips emit when nobody is connected to save bandwidth.
  _startMeteorShower() {
    const SPAWN_RANGE = 38
    const METEOR_FALL_MS = 1500
    const tick = () => {
      const delay = 250 + Math.random() * 350   // 250–600ms (avg ~425ms)
      setTimeout(() => {
        if (this.players.size > 0) {
          const now = Date.now()
          const x = (Math.random() - 0.5) * SPAWN_RANGE * 2
          const y = (Math.random() - 0.5) * SPAWN_RANGE * 2
          this.io.emit('combat:meteor', { x, y, t: now })
          // Track the strike so _resolveCombat can apply damage server-side
          this._pendingMeteors.push({ x, y, impactAt: now + METEOR_FALL_MS })
        }
        tick()
      }, delay)
    }
    tick()
  }

  _setupSocketEvents() {
    this.io.on('connection', (socket) => {
      if (this.players.size >= maxPlayers) {
        socket.emit('room:full')
        socket.disconnect()
        return
      }

      console.log(`[+] ${socket.id}`)

      socket.on('ping', (cb) => {
        if (typeof cb === 'function') cb(Date.now())
      })

      socket.on('player:join', (rawPayload) => {
        const name     = sanitizeName(rawPayload?.name)
        const carColor = sanitizeCarColor(rawPayload?.carColor)
        const carType  = sanitizeCarType(rawPayload?.carType)

        const spawnPos = this._getSpawnPosition()
        this.physics.addCar(socket.id, spawnPos)
        this.health.addPlayer(socket.id, carType)

        this.players.set(socket.id, {
          id:       socket.id,
          name,
          carColor,
          carType,
          actions:  { up: false, down: false, left: false, right: false, brake: false, boost: false },
          spawnXY:  { x: spawnPos.x, y: spawnPos.y },
          kills:    0,
        })

        // Send existing players to new joiner (with their types so they get correct stats locally)
        const existingPlayers = [...this.players.values()]
          .filter(p => p.id !== socket.id)
          .map(({ id, name, carColor, carType }) => ({ id, name, carColor, carType }))

        socket.emit('room:joined', {
          id: socket.id,
          existingPlayers,
          spawnPos: { x: spawnPos.x, y: spawnPos.y },
          maxHp: this.health.getMaxHp(socket.id),
          invulnMs: COMBAT.spawnInvulnMs,
        })

        // Notify everyone else
        socket.broadcast.emit('player:joined', {
          id: socket.id,
          name,
          carColor,
          carType,
        })

        console.log(`[join] ${name} (${socket.id}) type=${carType} — ${this.players.size} online`)
      })

      socket.on('player:ready', () => {
        const car    = this.physics.cars.get(socket.id)
        const player = this.players.get(socket.id)
        if (car && player) {
          const { x, y } = player.spawnXY
          car.chassis.position.set(x, y, 12)
          car.chassis.velocity.set(0, 0, 0)
          car.chassis.angularVelocity.set(0, 0, 0)
          car.chassis.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), 0)
        }
      })

      socket.on('player:input', (actions) => {
        const player = this.players.get(socket.id)
        if (player && actions && typeof actions === 'object') player.actions = actions
      })

      socket.on('player:bump', ({ targetId, fromPos } = {}) => {
        const targetSocket = this.io.sockets.sockets.get(targetId)
        if (targetSocket) {
          targetSocket.emit('player:bumped', { fromId: socket.id, fromPos })
        }
      })

      socket.on('chat:message', ({ text } = {}) => {
        const player = this.players.get(socket.id)
        if (!player) return
        const clean = sanitizeChatText(text)
        if (!clean) return

        const { allowed } = this.chat.check(socket.id, Date.now())
        if (!allowed) {
          socket.emit('chat:rate-limited')
          return
        }

        socket.broadcast.emit('chat:message', {
          name: player.name,
          text: clean,
          color: player.carColor,
        })
      })

      // ── Combat: missile fire (server-authoritative) ──
      socket.on('combat:missile', (data) => {
        if (this.health.isDead(socket.id)) return
        if (this.health.isInvulnerable(socket.id)) return  // can't fire during spawn invuln
        if (!isValidSpawnVec(data)) return

        const ok = this.combat.registerMissile(socket.id, data, Date.now())
        if (!ok) return

        // Broadcast to everyone (including shooter) so visuals stay in sync via one channel
        this.io.emit('combat:missile', {
          fromId: socket.id,
          x: data.x, y: data.y, z: data.z, dx: data.dx, dy: data.dy,
        })
      })

      // ── Combat: drop a mine (server-authoritative) ──
      socket.on('combat:mineDrop', (data) => {
        if (this.health.isDead(socket.id)) return
        if (this.health.isInvulnerable(socket.id)) return
        if (!isValidPos(data)) return

        const mine = this.mines.registerDrop(socket.id, data, Date.now())
        if (!mine) return

        this.io.emit('combat:mineDropped', {
          fromId:    socket.id,
          mineId:    mine.id,
          x:         mine.x,
          y:         mine.y,
          z:         mine.z,
          armedAt:   mine.armedAt,
        })
      })

      // Client-trusted damage event is intentionally NOT handled.
      // All damage is produced by CombatRules.tick() / MinesSystem.tick() server-side.

      socket.on('combat:explosion', (data) => {
        // Visual-only relay — actual damage happens server-side via missile resolution.
        socket.broadcast.emit('combat:explosion', { fromId: socket.id, ...data })
      })

      socket.on('combat:carDestroyed', (data) => {
        // Visual-only relay. Server's HP authority is the canonical kill source.
        socket.broadcast.emit('combat:carDestroyed', { fromId: socket.id, ...data })
      })

      socket.on('player:snapshot', (state) => {
        const player = this.players.get(socket.id)
        if (player && state && typeof state === 'object') player.clientSnapshot = state
      })

      socket.on('disconnect', () => {
        this.physics.removeCar(socket.id)
        this.health.removePlayer(socket.id)
        this.combat.removeOwner(socket.id)
        this.mines.removeOwner(socket.id)
        this.chat.removeOwner(socket.id)
        const player = this.players.get(socket.id)
        this.players.delete(socket.id)
        this.io.emit('player:left', { id: socket.id })
        console.log(`[-] ${player?.name ?? socket.id} — ${this.players.size} online`)
      })
    })
  }

  _startLoop() {
    const physicsInterval  = 1000 / physicsRate
    const broadcastInterval = 1000 / tickRate
    let last             = Date.now()
    let broadcastAccum   = 0

    setInterval(() => {
      const now   = Date.now()
      const delta = (now - last) / 1000
      last = now

      // Apply inputs
      for (const [id, player] of this.players) {
        this.physics.applyInputs(id, player.actions)
      }

      // Step physics
      this.physics.step(delta)

      // Broadcast at tickRate using client-reported snapshots
      broadcastAccum += delta * 1000
      if (broadcastAccum >= broadcastInterval) {
        broadcastAccum -= broadcastInterval
        const cars = []
        for (const [id, player] of this.players) {
          if (player.clientSnapshot) {
            cars.push({ id, ...player.clientSnapshot })
          }
        }
        if (cars.length > 0) {
          this.io.emit('world:snapshot', { t: now, cars })
        }

        // ── Combat resolution: missiles + mines + respawns ──
        this._resolveCombat(now)
      }
    }, physicsInterval)
  }

  _resolveCombat(now) {
    // Build position map from latest snapshots
    const carPositions = new Map()
    for (const [id, p] of this.players) {
      if (p.clientSnapshot?.pos) {
        carPositions.set(id, {
          x: p.clientSnapshot.pos[0],
          y: p.clientSnapshot.pos[1],
          z: p.clientSnapshot.pos[2],
        })
      }
    }

    const invuln = (id) => this.health.isInvulnerable(id, now) || this.health.isDead(id)

    // ── Missiles ──
    const { hits, expired } = this.combat.tick(now, carPositions, invuln)
    for (const hit of hits) {
      this._applyHit(hit.victimId, hit.ownerId, hit.damage, hit.x, hit.y, hit.z, 'missile')
      this.io.emit('combat:explosion', { fromId: hit.ownerId, x: hit.x, y: hit.y, z: hit.z })
    }
    for (const ex of expired) {
      this.io.emit('combat:explosion', { fromId: ex.ownerId, x: ex.x, y: ex.y, z: ex.z })
    }

    // ── Meteors ── apply damage when impact time elapses
    for (let i = this._pendingMeteors.length - 1; i >= 0; i--) {
      const m = this._pendingMeteors[i]
      if (now < m.impactAt) continue
      const r2 = COMBAT.meteor.hitRadius * COMBAT.meteor.hitRadius
      for (const [victimId, pos] of carPositions) {
        if (invuln(victimId)) continue
        if (pos.z > 4) continue   // airborne car is safe
        const dx = pos.x - m.x, dy = pos.y - m.y
        if (dx * dx + dy * dy <= r2) {
          this._applyHit(victimId, victimId, COMBAT.meteor.damage, m.x, m.y, 0.5, 'meteor')
        }
      }
      this._pendingMeteors.splice(i, 1)
    }

    // ── Mines ──
    const { explosions: mineExplosions, expired: mineExpired } = this.mines.tick(now, carPositions, invuln)
    for (const ex of mineExplosions) {
      this.io.emit('combat:mineExplosion', { mineId: ex.id, fromId: ex.ownerId, x: ex.x, y: ex.y, z: ex.z })
      for (const v of ex.victims) {
        this._applyHit(v.id, ex.ownerId, v.damage, ex.x, ex.y, ex.z, 'mine')
      }
    }
    for (const m of mineExpired) {
      this.io.emit('combat:mineExpired', { mineId: m.id, fromId: m.ownerId })
    }

    // ── Respawns ──
    const respawnedIds = this.health.tickRespawns(now)
    for (const id of respawnedIds) {
      const player = this.players.get(id)
      const sp = player?.spawnXY ?? { x: 0, y: -35 }
      // Reset server physics car so it doesn't drift while dead
      const car = this.physics.cars.get(id)
      if (car) {
        car.chassis.position.set(sp.x, sp.y, 12)
        car.chassis.velocity.set(0, 0, 0)
        car.chassis.angularVelocity.set(0, 0, 0)
      }
      this.io.emit('combat:respawn', {
        id,
        hp: this.health.getMaxHp(id),
        x: sp.x,
        y: sp.y,
        invulnUntil: now + COMBAT.spawnInvulnMs,
      })
    }
  }

  _applyHit(victimId, attackerId, damage, x, y, z, source) {
    const result = this.health.applyDamage(victimId, damage, Date.now())
    if (result.ignored || result.blocked) return

    const isEnv = attackerId === victimId || !this.players.has(attackerId)
    const attackerName = isEnv ? null : (this.players.get(attackerId)?.name ?? '???')
    const victimName   = this.players.get(victimId)?.name ?? '???'

    this.io.emit('combat:hp', {
      id:           victimId,
      hp:           result.hp,
      maxHp:        this.health.getMaxHp(victimId),
      fromId:       isEnv ? null : attackerId,
      fromName:     isEnv ? this._envLabel(source) : attackerName,
      victimName,
      amount:       damage,
      x, y, z,
      source,
    })

    if (result.died) {
      const attacker = isEnv ? null : this.players.get(attackerId)
      if (attacker) attacker.kills++
      this.io.emit('combat:death', {
        id:            victimId,
        victimName,
        killerId:      isEnv ? null : attackerId,
        killerName:    isEnv ? this._envLabel(source) : attackerName,
        attackerKills: attacker?.kills ?? 0,
        source,
      })
    }
  }

  _envLabel(source) {
    switch (source) {
      case 'meteor': return 'Meteor ☄️'
      case 'mine':   return 'Mine 💣'
      default:       return 'Environment'
    }
  }

  _getSpawnPosition() {
    // Assign grid slot based on current player count (wraps if full)
    const slot = this.players.size % SPAWN_GRID.length
    const { x, y } = SPAWN_GRID[slot]
    return { x, y, z: 12 }
  }
}

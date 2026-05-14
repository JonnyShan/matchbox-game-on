import { COMBAT, VEHICLE_TYPES } from '../../shared/constants.js'

// Server-authoritative HP/death/respawn/spawn-invuln state per socketId.
//
// Damage and heal calls are no-ops while a player is dead or within their
// spawn-invuln window. tickRespawns(now) returns the list of socketIds that
// just respawned this tick so GameRoom can broadcast a combat:respawn event.

function hpForVehicle(vehicleType) {
  return VEHICLE_TYPES[vehicleType]?.hp ?? COMBAT.maxHp
}

export class HealthSystem {
  constructor() {
    this._state = new Map()  // socketId → { maxHp, hp, dead, respawnAt, invulnUntil }
  }

  addPlayer(socketId, vehicleType = 'default', now = Date.now()) {
    const maxHp = hpForVehicle(vehicleType)
    this._state.set(socketId, {
      maxHp,
      hp:           maxHp,
      dead:         false,
      respawnAt:    null,
      invulnUntil:  now + COMBAT.spawnInvulnMs,
    })
  }

  removePlayer(socketId) {
    this._state.delete(socketId)
  }

  getHp(socketId) {
    return this._state.get(socketId)?.hp ?? 0
  }

  getMaxHp(socketId) {
    return this._state.get(socketId)?.maxHp ?? COMBAT.maxHp
  }

  isDead(socketId) {
    return this._state.get(socketId)?.dead ?? false
  }

  isInvulnerable(socketId, now = Date.now()) {
    const s = this._state.get(socketId)
    if (!s) return false
    return now < s.invulnUntil
  }

  applyDamage(socketId, amount, now = Date.now()) {
    const s = this._state.get(socketId)
    if (!s || s.dead) return { hp: s?.hp ?? 0, died: false, blocked: false, ignored: true }
    if (now < s.invulnUntil) return { hp: s.hp, died: false, blocked: true, ignored: false }
    s.hp = Math.max(0, s.hp - amount)
    const died = s.hp === 0
    if (died) {
      s.dead = true
      s.respawnAt = now + COMBAT.respawnMs
    }
    return { hp: s.hp, died, blocked: false, ignored: false }
  }

  heal(socketId, amount) {
    const s = this._state.get(socketId)
    if (!s || s.dead) return { hp: s?.hp ?? 0 }
    s.hp = Math.min(s.maxHp, s.hp + amount)
    return { hp: s.hp }
  }

  tickRespawns(now = Date.now()) {
    const respawned = []
    for (const [id, s] of this._state) {
      if (s.dead && s.respawnAt !== null && now >= s.respawnAt) {
        s.dead = false
        s.hp = s.maxHp
        s.respawnAt = null
        s.invulnUntil = now + COMBAT.spawnInvulnMs
        respawned.push(id)
      }
    }
    return respawned
  }
}

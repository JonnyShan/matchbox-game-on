import { COMBAT } from '../../shared/constants.js'

const DIR_TOLERANCE = 0.08  // unit-vector tolerance for fired missile direction

// Server-authoritative missile registry. Clients send fire intents; the server
// validates per-owner cooldown, global in-flight cap, and direction normalization,
// then integrates each missile forward at tick() time and emits hit/expire events.

export class CombatRules {
  constructor() {
    this._missiles = []          // [{ id, ownerId, x, y, z, dx, dy, spawnedAt, _lastAgeMs }]
    this._lastFireAt = new Map() // ownerId → epoch ms of last accepted fire
    this._nextId = 1
  }

  activeMissileCount() {
    return this._missiles.length
  }

  registerMissile(ownerId, spawn, now) {
    const last = this._lastFireAt.get(ownerId) ?? -Infinity
    if (now - last < COMBAT.missile.cooldownMs) return false
    if (this._missiles.length >= COMBAT.missile.maxInFlight) return false

    const mag = Math.sqrt(spawn.dx * spawn.dx + spawn.dy * spawn.dy)
    if (Math.abs(mag - 1) > DIR_TOLERANCE) return false

    this._missiles.push({
      id: this._nextId++,
      ownerId,
      x: spawn.x, y: spawn.y, z: spawn.z,
      dx: spawn.dx, dy: spawn.dy,
      spawnedAt: now,
      _lastAgeMs: 0,
    })
    this._lastFireAt.set(ownerId, now)
    return true
  }

  // carPositions: Map<socketId, {x,y,z}>. invulnPredicate: (socketId)=>bool to skip invulnerable victims.
  tick(now, carPositions, invulnPredicate = () => false) {
    const hits = []
    const expired = []
    const hitRadiusSq = COMBAT.missile.hitRadius * COMBAT.missile.hitRadius

    for (let i = this._missiles.length - 1; i >= 0; i--) {
      const m = this._missiles[i]
      const ageMs = now - m.spawnedAt

      if (ageMs >= COMBAT.missile.lifeMs) {
        expired.push({ id: m.id, ownerId: m.ownerId, x: m.x, y: m.y, z: m.z })
        this._missiles.splice(i, 1)
        continue
      }

      const dtMs = ageMs - m._lastAgeMs
      const step = COMBAT.missile.speed * (dtMs / 1000)
      m.x += m.dx * step
      m.y += m.dy * step
      m._lastAgeMs = ageMs

      let hit = null
      for (const [victimId, pos] of carPositions) {
        if (victimId === m.ownerId) continue
        if (invulnPredicate(victimId)) continue
        const dx = pos.x - m.x
        const dy = pos.y - m.y
        const dz = pos.z - m.z
        if (dx * dx + dy * dy + dz * dz <= hitRadiusSq) {
          hit = victimId
          break
        }
      }

      if (hit) {
        hits.push({
          id: m.id,
          ownerId: m.ownerId,
          victimId: hit,
          x: m.x, y: m.y, z: m.z,
          damage: COMBAT.missile.damage,
        })
        this._missiles.splice(i, 1)
      }
    }

    return { hits, expired }
  }

  removeOwner(ownerId) {
    this._missiles = this._missiles.filter((m) => m.ownerId !== ownerId)
    this._lastFireAt.delete(ownerId)
  }
}

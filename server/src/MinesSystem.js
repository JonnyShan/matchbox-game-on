import { COMBAT } from '../../shared/constants.js'

// Server-authoritative mines. Players drop a mine at their current position.
// After armDelayMs, the mine becomes live and explodes when any other player
// enters triggerRadius. Damage radius is wider (explosionRadius) and falls
// off linearly.

export class MinesSystem {
  constructor() {
    this._mines = []                 // [{ id, ownerId, x, y, z, droppedAt, armedAt, expiresAt }]
    this._lastDropAt = new Map()     // ownerId → last drop epoch ms
    this._perOwnerCount = new Map()  // ownerId → active mine count
    this._nextId = 1
  }

  registerDrop(ownerId, pos, now) {
    const last = this._lastDropAt.get(ownerId) ?? -Infinity
    if (now - last < COMBAT.mine.cooldownMs) return null
    const active = this._perOwnerCount.get(ownerId) ?? 0
    if (active >= COMBAT.mine.maxPerPlayer) return null

    const mine = {
      id:        this._nextId++,
      ownerId,
      x:         pos.x,
      y:         pos.y,
      z:         pos.z,
      droppedAt: now,
      armedAt:   now + COMBAT.mine.armDelayMs,
      expiresAt: now + COMBAT.mine.lifeMs,
    }
    this._mines.push(mine)
    this._lastDropAt.set(ownerId, now)
    this._perOwnerCount.set(ownerId, active + 1)
    return mine
  }

  // Returns { explosions: [{id, ownerId, x, y, z, victims:[{id, damage}]}], expired:[mine] }
  tick(now, carPositions, invulnPredicate = () => false) {
    const explosions = []
    const expired = []
    const triggerRadiusSq = COMBAT.mine.triggerRadius ** 2
    const explosionRadiusSq = COMBAT.mine.explosionRadius ** 2

    for (let i = this._mines.length - 1; i >= 0; i--) {
      const m = this._mines[i]

      // Expire un-triggered mines
      if (now >= m.expiresAt) {
        expired.push(m)
        this._removeMine(i)
        continue
      }

      // Not armed yet
      if (now < m.armedAt) continue

      // Trigger check: any non-owner non-invuln car within triggerRadius
      let triggered = false
      for (const [victimId, pos] of carPositions) {
        if (victimId === m.ownerId) continue
        if (invulnPredicate(victimId)) continue
        const dx = pos.x - m.x, dy = pos.y - m.y
        if (dx * dx + dy * dy <= triggerRadiusSq) {
          triggered = true
          break
        }
      }

      if (!triggered) continue

      // Compute victims within explosionRadius, damage falls off linearly
      const victims = []
      for (const [victimId, pos] of carPositions) {
        if (victimId === m.ownerId) continue
        if (invulnPredicate(victimId)) continue
        const dx = pos.x - m.x, dy = pos.y - m.y
        const distSq = dx * dx + dy * dy
        if (distSq > explosionRadiusSq) continue
        const t = 1 - Math.sqrt(distSq) / COMBAT.mine.explosionRadius
        const damage = Math.max(1, Math.round(COMBAT.mine.damage * t))
        victims.push({ id: victimId, damage })
      }

      explosions.push({ id: m.id, ownerId: m.ownerId, x: m.x, y: m.y, z: m.z, victims })
      this._removeMine(i)
    }

    return { explosions, expired }
  }

  removeOwner(ownerId) {
    for (let i = this._mines.length - 1; i >= 0; i--) {
      if (this._mines[i].ownerId === ownerId) this._mines.splice(i, 1)
    }
    this._lastDropAt.delete(ownerId)
    this._perOwnerCount.delete(ownerId)
  }

  _removeMine(i) {
    const m = this._mines[i]
    this._mines.splice(i, 1)
    const c = this._perOwnerCount.get(m.ownerId) ?? 1
    if (c <= 1) this._perOwnerCount.delete(m.ownerId)
    else this._perOwnerCount.set(m.ownerId, c - 1)
  }
}

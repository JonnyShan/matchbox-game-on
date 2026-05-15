import { COLLECT } from '../../shared/constants.js'

// Authoritative Matchbox COLLECT mode. Owns:
//   - 10 pickup definitions (alive/collected flag + collector)
//   - per-player score (collected count + per-pickup ownership map)
//   - match timer + win/lose attribution
//
// Multi-player: every pickup is one-shot — once any player grabs it, it's gone
// for everyone. First to collect all available wins; if timer expires, top
// score wins (ties broken by earliest 10th-collect timestamp).

export class CollectManager {
  constructor() {
    this._pickups = []   // [{ idx, x, y, z, model, collected, collectedBy, collectedAt }]
    this._matchStartAt = null
    this._matchEndAt = null
    this._scores = new Map()  // socketId → { count, finishAt }
    this._winnerId = null
  }

  startMatch(now = Date.now()) {
    // matchStartAt = when pickups go live (after countdown)
    // matchEndAt   = matchStartAt + durationMs
    this._matchStartAt = now + COLLECT.countdownMs
    this._matchEndAt   = this._matchStartAt + COLLECT.durationMs
    this._winnerId     = null
    this._scores.clear()
    this._pickups = COLLECT.positions.map((p, i) => ({
      idx:         i,
      x:           p.x,
      y:           p.y,
      z:           p.z,
      model:       p.model,
      collected:   false,
      collectedBy: null,
      collectedAt: null,
    }))
  }

  // Pre-match countdown is live (before pickups go hot)
  isCountdown(now = Date.now()) {
    return this._matchStartAt !== null && now < this._matchStartAt
  }

  isRunning(now = Date.now()) {
    return this._matchStartAt !== null
      && now >= this._matchStartAt
      && now < this._matchEndAt
      && !this._winnerId
  }

  remainingMs(now = Date.now()) {
    if (this._matchEndAt === null) return COLLECT.durationMs
    return Math.max(0, this._matchEndAt - now)
  }

  addPlayer(socketId) {
    if (!this._scores.has(socketId)) {
      this._scores.set(socketId, { count: 0, finishAt: null })
    }
  }

  removePlayer(socketId) {
    this._scores.delete(socketId)
  }

  // Server-side proximity check on every broadcast tick. Returns events:
  // { collected: [{idx, x, y, z, model, byId, score, completed:bool}], finished: socketId | null }
  tick(now, carPositions) {
    if (!this.isRunning(now)) {
      // If timer just expired, determine winner by score
      if (this._matchStartAt !== null && !this._winnerId && now >= this._matchEndAt) {
        this._winnerId = this._pickWinnerByScore()
        return { collected: [], finished: this._winnerId, reason: 'timer' }
      }
      return { collected: [], finished: null }
    }

    const radiusSq = COLLECT.pickupRadius * COLLECT.pickupRadius
    const collected = []
    let finished = null

    for (const p of this._pickups) {
      if (p.collected) continue
      // Find closest car within radius (lowest socketId wins tie via Map iteration order)
      let claimedBy = null
      for (const [id, pos] of carPositions) {
        const dx = pos.x - p.x, dy = pos.y - p.y, dz = pos.z - p.z
        if (dx * dx + dy * dy + dz * dz <= radiusSq) {
          claimedBy = id
          break
        }
      }
      if (!claimedBy) continue

      p.collected   = true
      p.collectedBy = claimedBy
      p.collectedAt = now

      const score = this._scores.get(claimedBy) ?? { count: 0, finishAt: null }
      score.count++
      if (score.count >= COLLECT.targetCount && score.finishAt === null) {
        score.finishAt = now
      }
      this._scores.set(claimedBy, score)

      const completed = score.count >= COLLECT.targetCount
      collected.push({
        idx:       p.idx,
        x:         p.x,
        y:         p.y,
        z:         p.z,
        model:     p.model,
        byId:      claimedBy,
        score:     score.count,
        completed,
      })

      if (completed && !this._winnerId) {
        this._winnerId = claimedBy
        finished = claimedBy
      }
    }

    return { collected, finished, reason: finished ? 'target' : null }
  }

  getStateSnapshot() {
    return {
      matchStartAt: this._matchStartAt,
      matchEndAt:   this._matchEndAt,
      target:       COLLECT.targetCount,
      pickups:      this._pickups.map(p => ({
        idx:         p.idx,
        x:           p.x,
        y:           p.y,
        z:           p.z,
        model:       p.model,
        collected:   p.collected,
        collectedBy: p.collectedBy,
      })),
      scores: [...this._scores.entries()].map(([id, s]) => ({ id, count: s.count, finishAt: s.finishAt })),
      winnerId: this._winnerId,
    }
  }

  _pickWinnerByScore() {
    let best = null
    for (const [id, s] of this._scores) {
      if (!best) { best = { id, ...s }; continue }
      if (s.count > best.count) best = { id, ...s }
      else if (s.count === best.count && s.finishAt !== null && (best.finishAt === null || s.finishAt < best.finishAt)) {
        best = { id, ...s }
      }
    }
    return best?.id ?? null
  }
}

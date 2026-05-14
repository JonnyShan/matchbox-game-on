import { COMBAT } from '../../shared/constants.js'

// Per-socket sliding-window chat rate limiter. Combines two checks:
//   1. Minimum interval between two consecutive messages (anti-flood)
//   2. Burst cap inside a rolling window (anti-spam)

export class ChatRateLimiter {
  constructor() {
    this._timestamps = new Map() // ownerId → number[] (recent send timestamps, sorted asc)
  }

  // Returns { allowed: bool, reason: string|null }
  check(ownerId, now = Date.now()) {
    const arr = this._timestamps.get(ownerId) ?? []
    const last = arr[arr.length - 1]
    if (last !== undefined && now - last < COMBAT.chat.minIntervalMs) {
      return { allowed: false, reason: 'too_fast' }
    }
    // Drop entries older than burst window
    const cutoff = now - COMBAT.chat.burstWindowMs
    const recent = arr.filter((t) => t >= cutoff)
    if (recent.length >= COMBAT.chat.burstMax) {
      return { allowed: false, reason: 'burst_exceeded' }
    }
    recent.push(now)
    this._timestamps.set(ownerId, recent)
    return { allowed: true, reason: null }
  }

  removeOwner(ownerId) {
    this._timestamps.delete(ownerId)
  }
}

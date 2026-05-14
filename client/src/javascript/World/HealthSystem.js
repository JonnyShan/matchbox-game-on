import EventEmitter from '../Utils/EventEmitter.js'
import { COMBAT } from '../../../../shared/constants.js'

// Client-side HealthSystem is presentational only — server owns HP, death,
// respawn, and the spawn-invuln window. We mirror the values for HUD use and
// emit the same legacy events (`damage`, `healed`, `death`, `respawn`) so the
// rest of the client wiring continues to work unchanged.

export default class HealthSystem extends EventEmitter
{
    constructor(_options)
    {
        super()
        this.physics  = _options.physics
        this.network  = _options.network
        this.spawnPos = _options.spawnPos || { x: 5, y: -35 }
        this.maxHp    = _options.maxHp || COMBAT.maxHp
        this.hp       = this.maxHp
        this._dead    = false
        this._invulnUntil = 0

        this._wireNetwork()
    }

    isDead()        { return this._dead }
    isInvulnerable(now = Date.now()) { return now < this._invulnUntil }

    // Legacy compat shim — Meteors.js and HazardZones.js still call takeDamage()/heal()
    // for local-only effects. With server authority these become no-ops; the server
    // emits combat:hp when actual damage lands.
    takeDamage() { /* server-authoritative — no-op */ }

    heal()       { /* server-authoritative — no-op */ }

    _wireNetwork()
    {
        if(!this.network) return
        const isMe = (id) => id === this.network.localId

        this.network.on('room:joined', ({ maxHp, invulnMs }) =>
        {
            if(typeof maxHp === 'number') this.maxHp = maxHp
            this.hp = this.maxHp
            this._invulnUntil = Date.now() + (invulnMs ?? COMBAT.spawnInvulnMs)
        })

        this.network.on('combat:hp', (data) =>
        {
            if(!isMe(data.id)) return
            const before = this.hp
            this.hp = data.hp
            if(typeof data.maxHp === 'number') this.maxHp = data.maxHp
            if(this.hp < before)
                this.trigger('damage', [{ hp: this.hp, amount: before - this.hp, fromId: data.fromId, fromName: data.fromName, source: data.source }])
            else if(this.hp > before)
                this.trigger('healed', [{ hp: this.hp }])
        })

        this.network.on('combat:death', (data) =>
        {
            if(!isMe(data.id)) return
            this._dead = true
            this.hp = 0
            this.trigger('death', [{ killerId: data.killerId, killerName: data.killerName, source: data.source }])
        })

        this.network.on('combat:respawn', (data) =>
        {
            if(!isMe(data.id)) return
            this._dead = false
            this.hp = data.hp ?? this.maxHp
            this._invulnUntil = data.invulnUntil ?? (Date.now() + COMBAT.spawnInvulnMs)

            // Teleport the local physics body to the server-prescribed spawn
            const body = this.physics?.car?.chassis?.body
            if(body)
            {
                body.sleep()
                body.position.set(data.x, data.y, 12)
                body.quaternion.set(0, 0, 0, 1)
                body.velocity.set(0, 0, 0)
                body.angularVelocity.set(0, 0, 0)
                body.wakeUp()
            }

            this.trigger('respawn', [{ hp: this.hp, invulnUntil: this._invulnUntil }])
        })
    }
}

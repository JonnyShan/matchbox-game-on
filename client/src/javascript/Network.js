import { io } from 'socket.io-client'
import EventEmitter from './Utils/EventEmitter.js'

export default class Network extends EventEmitter
{
    constructor()
    {
        super()

        this.socket   = null
        this.localId  = null
        this.latency  = 0
        this.serverTimeOffset = 0     // serverTime ≈ Date.now() + offset
        this._pingInterval = null
    }

    // Returns the current server clock estimate (used for interpolation
    // timing so clients pin to the same temporal reference)
    serverNow()
    {
        return Date.now() + this.serverTimeOffset
    }

    connect(serverUrl = '/')
    {
        this.socket = io(serverUrl, { autoConnect: true })

        this.socket.on('connect', () =>
        {
            console.log('[network] connected id=', this.socket.id)
            this.trigger('connected')

            // Re-emit join if we were previously joined
            if(this._wasJoined)
            {
                this.socket.emit('player:join', this._lastJoinPayload)
            }
        })

        this.socket.on('disconnect', () =>
        {
            console.warn('[network] disconnected')
            this.trigger('disconnected')
        })

        this.socket.on('room:joined', (data) =>
        {
            this.localId  = data.id
            this.spawnPos = data.spawnPos
            this.trigger('room:joined', [data])
        })

        this.socket.on('room:full', () =>
        {
            this.trigger('room:full')
        })

        this.socket.on('player:joined', (data) =>
        {
            this.trigger('player:joined', [data])
        })

        this.socket.on('player:left', (data) =>
        {
            this.trigger('player:left', [data])
        })

        this.socket.on('world:snapshot', (snapshot) =>
        {
            this.trigger('world:snapshot', [snapshot])
        })

        this.socket.on('player:bumped', (data) =>
        {
            this.trigger('player:bumped', [data])
        })

        this.socket.on('chat:message', (data) =>
        {
            this.trigger('chat:message', [data])
        })

        this.socket.on('chat:rate-limited', () =>
        {
            this.trigger('chat:rate-limited')
        })

        // ── Server-authoritative combat events ──
        this.socket.on('combat:missile', (data) =>
        {
            this.trigger('combat:missile', [data])
        })

        this.socket.on('combat:explosion', (data) =>
        {
            this.trigger('combat:explosion', [data])
        })

        this.socket.on('combat:carDestroyed', (data) =>
        {
            this.trigger('combat:carDestroyed', [data])
        })

        this.socket.on('combat:hp', (data) =>
        {
            this.trigger('combat:hp', [data])
        })

        this.socket.on('combat:death', (data) =>
        {
            this.trigger('combat:death', [data])
        })

        this.socket.on('combat:respawn', (data) =>
        {
            this.trigger('combat:respawn', [data])
        })

        this.socket.on('combat:mineDropped', (data) =>
        {
            this.trigger('combat:mineDropped', [data])
        })

        this.socket.on('combat:mineExplosion', (data) =>
        {
            this.trigger('combat:mineExplosion', [data])
        })

        this.socket.on('combat:mineExpired', (data) =>
        {
            this.trigger('combat:mineExpired', [data])
        })

        this.socket.on('combat:meteor', (data) =>
        {
            this.trigger('combat:meteor', [data])
        })

        // Latency + clock-sync
        this._pingInterval = setInterval(() =>
        {
            const start = Date.now()
            this.socket.emit('ping', (serverTime) =>
            {
                const rtt = Date.now() - start
                this.latency = rtt
                if(typeof serverTime === 'number')
                {
                    const sampled = (serverTime + rtt / 2) - Date.now()
                    if(this._offsetInitialized)
                        this.serverTimeOffset = this.serverTimeOffset * 0.7 + sampled * 0.3
                    else
                    {
                        this.serverTimeOffset = sampled
                        this._offsetInitialized = true
                    }
                }
                this.trigger('ping', [this.latency])
            })
        }, 1500)
    }

    join(name, carColor, carType = 'default')
    {
        this.localPlayerName = name
        this._wasJoined        = true
        this._lastJoinPayload  = { name, carColor, carType }
        this.socket.emit('player:join', this._lastJoinPayload)
    }

    sendInput(actions)
    {
        this.socket.emit('player:input', actions)
    }

    sendSnapshot(state)
    {
        this.socket.emit('player:snapshot', state)
    }

    sendBump(targetId, fromPos)
    {
        this.socket.emit('player:bump', { targetId, fromPos })
    }

    sendChat(text)
    {
        this.socket.emit('chat:message', { text })
    }

    sendMissileFired(x, y, z, dx, dy)
    {
        this.socket.emit('combat:missile', { x, y, z, dx, dy })
    }

    sendMineDrop(x, y, z)
    {
        this.socket.emit('combat:mineDrop', { x, y, z })
    }

    sendExplosion(x, y, z)
    {
        this.socket.emit('combat:explosion', { x, y, z })
    }

    sendCarDestroyed(x, y, z, vx, vy, color)
    {
        this.socket.emit('combat:carDestroyed', { x, y, z, vx, vy, color })
    }

    playerReady()
    {
        this.socket.emit('player:ready')
    }

    disconnect()
    {
        clearInterval(this._pingInterval)
        this.socket?.disconnect()
    }
}

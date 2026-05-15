import { COLLECT } from '../../../../shared/constants.js'

// Top-right: 10-slot car progress strip.
// Bottom-center: circular minimap + compass arrow pointing to nearest uncollected pickup.

const SLOT_SIZE = 38

// Minimap covers a square world region centered on origin (arena fits).
const MAP_WORLD_HALF = 55       // m — arena is 100×100, give a 10m margin
const MAP_PX         = 150      // canvas size (square, drawn as circle via mask)

function makeCarSVG(filled, tint = '#f0c14b')
{
    const body   = filled ? tint     : 'transparent'
    const stroke = filled ? '#1a1a1a' : 'rgba(247,236,210,0.55)'
    return `
        <svg viewBox="0 0 64 36" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <g fill="${body}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round">
                <path d="M3 26 Q6 14 18 12 L46 12 Q56 14 60 22 L60 26 Z"/>
                <circle cx="16" cy="28" r="4" fill="${filled ? '#1a1a1a' : 'transparent'}" stroke="${stroke}"/>
                <circle cx="48" cy="28" r="4" fill="${filled ? '#1a1a1a' : 'transparent'}" stroke="${stroke}"/>
                <path d="M18 14 Q22 8 32 8 L42 8 Q48 9 50 14"
                      fill="${filled ? '#bfd9d8' : 'transparent'}"
                      stroke="${stroke}"/>
            </g>
        </svg>
    `
}

export default class CollectHUD
{
    constructor(_options)
    {
        this.network        = _options.network
        this.physics        = _options.physics
        this.collectPickups = _options.collectPickups
        this.target         = COLLECT.targetCount
        this.score          = 0

        this.$root = this._build()
        this._renderSlots()
        this._buildMinimap()

        if(this.network)
        {
            this.network.on('collect:pickup', (data) =>
            {
                if(data.byId !== this.network.localId) return
                this.score = data.score
                this._renderSlots(true)
            })

            this.network.on('room:joined', (data) =>
            {
                const me = data?.collectState?.scores?.find(s => s.id === this.network.localId)
                if(me) { this.score = me.count; this._renderSlots() }
            })
        }
    }

    _build()
    {
        const root = document.createElement('div')
        root.id = 'collect-hud'
        root.style.cssText = `
            position: fixed;
            top: max(16px, env(safe-area-inset-top));
            right: max(16px, env(safe-area-inset-right));
            background: rgba(20, 12, 5, 0.78);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(240, 193, 75, 0.4);
            border-radius: 14px;
            padding: 10px 14px 12px;
            font-family: 'Space Grotesk', 'JetBrains Mono', monospace;
            color: #f7ecd2;
            z-index: 510;
            pointer-events: none;
            box-shadow: 0 6px 24px rgba(0,0,0,0.4);
            min-width: 240px;
        `
        root.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;letter-spacing:2px;font-size:10px;color:rgba(247,236,210,0.6);">
                <span>COLLECTION</span>
                <span id="collect-score" style="color:#f0c14b;font-weight:900;font-size:14px;letter-spacing:0;">0 / ${this.target}</span>
            </div>
            <div id="collect-slots" style="display:grid;grid-template-columns:repeat(${this.target}, 1fr);gap:4px;"></div>
        `
        document.body.appendChild(root)
        this._$slots = root.querySelector('#collect-slots')
        this._$score = root.querySelector('#collect-score')
        return root
    }

    // Bottom-center minimap container: circular canvas + compass arrow next to it.
    _buildMinimap()
    {
        const wrap = document.createElement('div')
        wrap.id = 'collect-minimap-wrap'
        wrap.style.cssText = `
            position: fixed;
            bottom: max(20px, env(safe-area-inset-bottom));
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 510;
            pointer-events: none;
            font-family: 'Space Grotesk', 'JetBrains Mono', monospace;
            color: #f7ecd2;
        `
        wrap.innerHTML = `
            <div id="collect-arrow-pill" style="
                display:flex;flex-direction:column;align-items:center;
                background: rgba(20, 12, 5, 0.82);
                backdrop-filter: blur(8px);
                border: 1px solid rgba(240, 193, 75, 0.45);
                border-radius: 14px;
                padding: 10px 16px 10px;
                box-shadow: 0 6px 24px rgba(0,0,0,0.4);
                min-width: 88px;
            ">
                <div id="collect-arrow-label" style="font-size:9px;letter-spacing:2px;color:rgba(247,236,210,0.55);margin-bottom:4px;">NEXT</div>
                <div id="collect-arrow-svg" style="width:42px;height:42px;display:flex;align-items:center;justify-content:center;">
                    <svg viewBox="-32 -32 64 64" width="42" height="42" xmlns="http://www.w3.org/2000/svg">
                        <g id="collect-arrow-rot" style="transition: transform 0.12s ease-out;">
                            <path d="M0 -24 L18 8 L6 4 L6 22 L-6 22 L-6 4 L-18 8 Z"
                                  fill="#f0c14b" stroke="#1a1a1a" stroke-width="2" stroke-linejoin="round"/>
                        </g>
                    </svg>
                </div>
                <div id="collect-arrow-dist" style="margin-top:4px;font-size:14px;font-weight:900;color:#f0c14b;letter-spacing:0;">--m</div>
            </div>
            <div id="collect-minimap" style="
                width: ${MAP_PX}px;
                height: ${MAP_PX}px;
                border-radius: 50%;
                background: rgba(20, 12, 5, 0.82);
                backdrop-filter: blur(8px);
                border: 2px solid rgba(240, 193, 75, 0.45);
                box-shadow: 0 6px 24px rgba(0,0,0,0.4);
                overflow: hidden;
                position: relative;
            ">
                <canvas id="collect-minimap-canvas" width="${MAP_PX}" height="${MAP_PX}" style="width:100%;height:100%;display:block;"></canvas>
            </div>
        `
        document.body.appendChild(wrap)
        this._$arrowPill  = wrap.querySelector('#collect-arrow-pill')
        this._$arrowRot   = wrap.querySelector('#collect-arrow-rot')
        this._$arrowDist  = wrap.querySelector('#collect-arrow-dist')
        this._$arrowLabel = wrap.querySelector('#collect-arrow-label')
        this._$mapCanvas  = wrap.querySelector('#collect-minimap-canvas')
        this._mapCtx      = this._$mapCanvas.getContext('2d')
    }

    _renderSlots(pulse = false)
    {
        if(!this._$slots) return
        this._$slots.innerHTML = ''
        for(let i = 0; i < this.target; i++)
        {
            const filled = i < this.score
            const cell = document.createElement('div')
            cell.style.cssText = `
                width: ${SLOT_SIZE}px;
                height: ${SLOT_SIZE * 0.66}px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: ${filled ? 'rgba(240, 193, 75, 0.18)' : 'rgba(247,236,210,0.04)'};
                border: 1px solid ${filled ? '#f0c14b' : 'rgba(247,236,210,0.18)'};
                border-radius: 6px;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s, border-color 0.2s;
            `
            cell.innerHTML = makeCarSVG(filled, '#f0c14b')
            this._$slots.appendChild(cell)
        }
        if(this._$score) this._$score.textContent = `${this.score} / ${this.target}`

        if(pulse && this.score > 0)
        {
            const newest = this._$slots.children[this.score - 1]
            if(newest)
            {
                newest.style.transform = 'scale(1.4)'
                requestAnimationFrame(() =>
                {
                    setTimeout(() => { newest.style.transform = 'scale(1)' }, 180)
                })
            }
        }
    }

    // Called from World tick. Reads physics + collectPickups state and redraws.
    updateMinimap()
    {
        if(!this._mapCtx) return
        const body = this.physics?.car?.chassis?.body
        if(!body) return

        const ctx = this._mapCtx
        const W = MAP_PX, H = MAP_PX
        ctx.clearRect(0, 0, W, H)

        // Arena ring background (forest tint)
        const g = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W/2)
        g.addColorStop(0,   'rgba(95, 168, 63, 0.32)')
        g.addColorStop(0.7, 'rgba(45, 90, 50, 0.4)')
        g.addColorStop(1,   'rgba(20, 40, 25, 0.55)')
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(W/2, H/2, W/2 - 2, 0, Math.PI * 2); ctx.fill()

        // Subtle radial grid lines
        ctx.strokeStyle = 'rgba(240, 193, 75, 0.10)'
        ctx.lineWidth = 1
        for(let r = 0.33; r < 1; r += 0.33)
        {
            ctx.beginPath(); ctx.arc(W/2, H/2, (W/2 - 2) * r, 0, Math.PI * 2); ctx.stroke()
        }
        ctx.beginPath(); ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke()

        // World → minimap projection (origin at center, +y world maps to -y screen so north is up)
        const scale = (W / 2) / MAP_WORLD_HALF
        const w2m = (wx, wy) => ({ x: W/2 + wx * scale, y: H/2 - wy * scale })

        // Draw pickups
        const items = this.collectPickups?._items
        let nearest = null
        let nearestSq = Infinity
        if(items)
        {
            for(const item of items.values())
            {
                const p = item.group.position
                const { x, y } = w2m(p.x, p.y)
                // gold dot with halo
                ctx.fillStyle = 'rgba(240, 193, 75, 0.35)'
                ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill()
                ctx.fillStyle = '#f0c14b'
                ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = '#1a1a1a'
                ctx.lineWidth = 1
                ctx.stroke()

                // Track nearest for compass arrow
                const dx = p.x - body.position.x
                const dy = p.y - body.position.y
                const sq = dx * dx + dy * dy
                if(sq < nearestSq) { nearestSq = sq; nearest = { x: p.x, y: p.y } }
            }
        }

        // Draw player as orange triangle aligned to heading
        const q = body.quaternion
        const hx = 1 - 2 * (q.y * q.y + q.z * q.z)
        const hy = 2 * (q.x * q.y + q.z * q.w)
        const yaw = Math.atan2(hy, hx)
        const player = w2m(body.position.x, body.position.y)
        ctx.save()
        ctx.translate(player.x, player.y)
        // Screen rotation: world heading (atan2(hy, hx)) — north is +Y in world = -Y in screen.
        // Rotate so triangle apex points in the player's forward direction.
        ctx.rotate(-yaw + Math.PI / 2)
        ctx.fillStyle = '#e54e34'
        ctx.strokeStyle = '#f7ecd2'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(0, -9)
        ctx.lineTo(6, 6)
        ctx.lineTo(-6, 6)
        ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.restore()

        // Compass arrow next to minimap — rotates toward nearest uncollected pickup
        if(nearest)
        {
            const dx = nearest.x - body.position.x
            const dy = nearest.y - body.position.y
            const targetWorldAngle = Math.atan2(dy, dx)   // world angle to target
            // Convert to compass rotation relative to player heading
            // Compass points UP toward player's forward, so we want angle relative to yaw
            const rel = targetWorldAngle - yaw
            const screenDeg = -rel * 180 / Math.PI - 90   // +90 because compass triangle apex points up
            this._$arrowRot.setAttribute('transform', `rotate(${screenDeg.toFixed(1)})`)
            const dist = Math.sqrt(nearestSq)
            this._$arrowDist.textContent = `${Math.round(dist)}m`
            this._$arrowPill.style.opacity = '1'
            this._$arrowLabel.textContent = 'NEXT'
        }
        else
        {
            this._$arrowDist.textContent = 'DONE'
            this._$arrowLabel.textContent = '✓'
            this._$arrowRot.setAttribute('transform', 'rotate(0)')
        }
    }

    // Legacy method kept for compatibility (CollectArrow used to write distance here)
    setDistance() { /* now driven directly by updateMinimap */ }

    destroy()
    {
        if(this.$root?.parentNode) this.$root.parentNode.removeChild(this.$root)
        const wrap = document.getElementById('collect-minimap-wrap')
        if(wrap?.parentNode) wrap.parentNode.removeChild(wrap)
    }
}

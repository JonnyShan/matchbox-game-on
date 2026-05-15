// Top-right HUD that shows 10 car outlines. Each slot fills with a tinted
// silhouette as the local player picks up cars. Server is the source of
// truth via combat:collect:pickup events.

import { COLLECT } from '../../../../shared/constants.js'

const SLOT_SIZE = 38

function makeCarSVG(filled, tint = '#f0c14b')
{
    // Two-tone Matchbox-style silhouette
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
        this.network = _options.network
        this.target  = COLLECT.targetCount
        this.score   = 0

        this.$root    = this._build()
        this._renderSlots()

        if(this.network)
        {
            this.network.on('collect:pickup', (data) =>
            {
                if(data.byId !== this.network.localId) return
                this.score = data.score
                this._renderSlots(true)
            })

            // Server-pushed initial state on join may already have some
            // pickups taken — reflect that on first paint.
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
            <div id="collect-distance" style="margin-top:8px;text-align:right;font-size:10px;letter-spacing:2px;color:rgba(247,236,210,0.55);">
                NEXT &nbsp;<span id="collect-distance-val" style="color:#f0c14b;font-weight:900;">--</span>
            </div>
        `
        document.body.appendChild(root)
        this._$slots    = root.querySelector('#collect-slots')
        this._$score    = root.querySelector('#collect-score')
        this._$distance = root.querySelector('#collect-distance-val')
        return root
    }

    setDistance(d)
    {
        if(!this._$distance) return
        if(d === null || d === undefined) { this._$distance.textContent = 'DONE'; return }
        this._$distance.textContent = `${Math.round(d)}m`
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

        // Pulse the just-collected slot
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

    destroy()
    {
        if(this.$root?.parentNode) this.$root.parentNode.removeChild(this.$root)
    }
}

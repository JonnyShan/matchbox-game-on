import { COLLECT } from '../../../../shared/constants.js'

// Top-center HUD widget showing:
//   1. Pre-match countdown: huge 3 → 2 → 1 → GO! overlay
//   2. Live match timer: MM:SS.t format, pulses red under 10s
//
// Driven from server clock — matchStartAt / matchEndAt come down via
// room:joined.collectState. We read them and tick against Network.serverNow().

const FINAL_WARN_MS = 10_000

export default class MatchTimer
{
    constructor(_options)
    {
        this.network = _options.network
        this.matchStartAt = null
        this.matchEndAt   = null
        this._onStart = _options.onStart || null
        this._onEnd   = _options.onEnd   || null
        this._lastCountStr = null
        this._startFired = false
        this._endFired   = false

        this.$root = this._build()

        if(this.network)
        {
            this.network.on('room:joined', (data) =>
            {
                const s = data?.collectState
                if(!s) return
                this.matchStartAt = s.matchStartAt ?? null
                this.matchEndAt   = s.matchEndAt   ?? null
            })
        }
    }

    _build()
    {
        const root = document.createElement('div')
        root.id = 'mb-match-timer'
        root.style.cssText = `
            position: fixed;
            top: max(16px, env(safe-area-inset-top));
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-family: 'JetBrains Mono', 'Space Grotesk', monospace;
            color: #f7ecd2;
            z-index: 530;
            pointer-events: none;
        `
        root.innerHTML = `
            <div class="mb-timer-label" style="
                font-size: 10px;
                letter-spacing: 4px;
                color: rgba(247,236,210,0.55);
                font-weight: 800;
            ">TIME</div>
            <div class="mb-timer-value" id="mb-timer-value" style="
                font-size: 42px;
                font-weight: 900;
                letter-spacing: 0.04em;
                line-height: 1;
                color: #f0c14b;
                background: rgba(20, 12, 5, 0.78);
                backdrop-filter: blur(8px);
                border: 2px solid rgba(240, 193, 75, 0.5);
                border-radius: 10px;
                padding: 6px 22px 8px;
                min-width: 140px;
                text-align: center;
                text-shadow: 2px 2px 0 rgba(0,0,0,0.45);
                box-shadow: 0 6px 20px rgba(0,0,0,0.4);
                transition: color 0.2s, border-color 0.2s, transform 0.2s;
            ">1:00.0</div>
        `

        // Big-overlay countdown number
        const overlay = document.createElement('div')
        overlay.id = 'mb-countdown-overlay'
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 720;
            pointer-events: none;
            font-family: 'Space Grotesk', sans-serif;
        `
        overlay.innerHTML = `
            <div id="mb-countdown-text" style="
                font-size: clamp(120px, 28vw, 320px);
                font-weight: 900;
                color: #f7ecd2;
                text-shadow:
                    6px 6px 0 #1a1a1a,
                    0 20px 40px rgba(0,0,0,0.6);
                letter-spacing: -0.04em;
                opacity: 0;
                transform: scale(0.6);
                transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
            ">3</div>
        `
        document.body.appendChild(root)
        document.body.appendChild(overlay)

        this._$value     = root.querySelector('#mb-timer-value')
        this._$countdown = overlay
        this._$countText = overlay.querySelector('#mb-countdown-text')
        return root
    }

    // Called from World tick.
    update()
    {
        if(this.matchStartAt === null) return

        const now = this.network?.serverNow?.() ?? Date.now()
        const toStart = this.matchStartAt - now
        const toEnd   = this.matchEndAt   - now

        // ── Pre-match countdown ───────────────────────────────────────────
        if(toStart > 0)
        {
            this._$countdown.style.display = 'flex'
            // Show 3 / 2 / 1 / GO! based on seconds remaining
            const secsLeft = Math.ceil(toStart / 1000)
            const label    = secsLeft >= 1 ? String(secsLeft) : 'GO!'
            if(label !== this._lastCountStr)
            {
                this._lastCountStr = label
                this._$countText.textContent = label
                // restart pop animation
                this._$countText.style.transition = 'none'
                this._$countText.style.opacity = '0'
                this._$countText.style.transform = 'scale(0.6)'
                this._$countText.style.color = secsLeft === 1 ? '#f0c14b' : '#f7ecd2'
                requestAnimationFrame(() =>
                {
                    this._$countText.style.transition = 'opacity 0.18s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    this._$countText.style.opacity = '1'
                    this._$countText.style.transform = 'scale(1)'
                })
            }
            // Hold timer at 60s, dim while waiting
            this._$value.textContent = this._fmt(this.matchEndAt - this.matchStartAt)
            this._$value.style.opacity = '0.45'
            return
        }

        // ── Fire onStart hook once ────────────────────────────────────────
        if(!this._startFired)
        {
            this._startFired = true
            // Brief "GO!" pop then fade
            this._$countText.textContent = 'GO!'
            this._$countText.style.color = '#5fa83f'
            this._$countText.style.opacity = '1'
            this._$countText.style.transform = 'scale(1.2)'
            setTimeout(() =>
            {
                this._$countdown.style.opacity = '0'
                this._$countdown.style.transition = 'opacity 0.45s'
                setTimeout(() => { this._$countdown.style.display = 'none'; this._$countdown.style.opacity = '1' }, 470)
            }, 350)
            this._onStart?.()
        }

        // ── Live timer ────────────────────────────────────────────────────
        this._$value.style.opacity = '1'

        if(toEnd <= 0)
        {
            this._$value.textContent = '0:00.0'
            if(!this._endFired) { this._endFired = true; this._onEnd?.() }
            return
        }

        this._$value.textContent = this._fmt(toEnd)

        // Pulse red under 10s
        if(toEnd <= FINAL_WARN_MS)
        {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.012)
            this._$value.style.color       = '#ee3a2f'
            this._$value.style.borderColor = '#ee3a2f'
            this._$value.style.transform   = `scale(${1 + 0.05 * pulse})`
        }
        else
        {
            this._$value.style.color       = '#f0c14b'
            this._$value.style.borderColor = 'rgba(240,193,75,0.5)'
            this._$value.style.transform   = 'scale(1)'
        }
    }

    isCountdown()
    {
        const now = this.network?.serverNow?.() ?? Date.now()
        return this.matchStartAt !== null && now < this.matchStartAt
    }

    _fmt(ms)
    {
        const total = Math.max(0, ms) / 1000
        const m = Math.floor(total / 60)
        const s = Math.floor(total % 60)
        const t = Math.floor((total * 10) % 10)
        return `${m}:${String(s).padStart(2, '0')}.${t}`
    }

    destroy()
    {
        this.$root?.remove()
        this._$countdown?.remove()
    }
}

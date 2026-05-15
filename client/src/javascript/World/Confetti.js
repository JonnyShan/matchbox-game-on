// Full-screen canvas confetti burst. Spawns N particles from a screen
// position and lets them fall + spin + fade. Driven by requestAnimationFrame
// internally — no need for game tick wiring.

const COLORS = ['#ee3a2f', '#f0c14b', '#f7ecd2', '#5fa83f', '#8fd3ff', '#ffffff']

export default class Confetti
{
    constructor()
    {
        this.$canvas = document.createElement('canvas')
        this.$canvas.id = 'mb-confetti'
        this.$canvas.style.cssText = `
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 740;
            display: none;
        `
        document.body.appendChild(this.$canvas)
        this.ctx = this.$canvas.getContext('2d')
        this._particles = []
        this._lastFrame = 0
        this._running   = false

        window.addEventListener('resize', () => this._resize())
        this._resize()
    }

    _resize()
    {
        this.$canvas.width  = window.innerWidth  * window.devicePixelRatio
        this.$canvas.height = window.innerHeight * window.devicePixelRatio
        this.$canvas.style.width  = `${window.innerWidth}px`
        this.$canvas.style.height = `${window.innerHeight}px`
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }

    // burst({ x, y, count }) — defaults to center, 200 particles
    burst({ x, y, count = 220 } = {})
    {
        const sx = x ?? window.innerWidth  * 0.5
        const sy = y ?? window.innerHeight * 0.5
        this.$canvas.style.display = 'block'

        for(let i = 0; i < count; i++)
        {
            const a = Math.random() * Math.PI * 2
            const v = 6 + Math.random() * 14
            this._particles.push({
                x:  sx + (Math.random() - 0.5) * 30,
                y:  sy + (Math.random() - 0.5) * 30,
                vx: Math.cos(a) * v,
                vy: Math.sin(a) * v - 6,                // bias upward
                rot: Math.random() * Math.PI * 2,
                vr:  (Math.random() - 0.5) * 0.4,
                size: 6 + Math.random() * 8,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                life: 0,
                ttl: 1500 + Math.random() * 1500,
                shape: Math.random() > 0.5 ? 'rect' : 'circle',
            })
        }
        if(!this._running) this._loop()
    }

    _loop()
    {
        this._running = true
        const frame = (t) =>
        {
            const dt = this._lastFrame ? Math.min(40, t - this._lastFrame) : 16
            this._lastFrame = t
            this._step(dt)
            this._draw()
            if(this._particles.length > 0) requestAnimationFrame(frame)
            else
            {
                this._running = false
                this._lastFrame = 0
                this.$canvas.style.display = 'none'
            }
        }
        requestAnimationFrame(frame)
    }

    _step(dtMs)
    {
        const g = 0.55          // gravity per ms (visually tuned)
        const drag = 0.012      // air resistance
        for(let i = this._particles.length - 1; i >= 0; i--)
        {
            const p = this._particles[i]
            p.life += dtMs
            if(p.life >= p.ttl) { this._particles.splice(i, 1); continue }
            p.vy += g * (dtMs / 16)
            p.vx *= 1 - drag
            p.vy *= 1 - drag * 0.5
            p.x  += p.vx * (dtMs / 16)
            p.y  += p.vy * (dtMs / 16)
            p.rot += p.vr * (dtMs / 16)
        }
    }

    _draw()
    {
        const c = this.ctx
        c.clearRect(0, 0, window.innerWidth, window.innerHeight)
        for(const p of this._particles)
        {
            const a = Math.max(0, 1 - p.life / p.ttl)
            c.save()
            c.translate(p.x, p.y)
            c.rotate(p.rot)
            c.globalAlpha = a
            c.fillStyle = p.color
            if(p.shape === 'rect')
            {
                c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
            }
            else
            {
                c.beginPath()
                c.arc(0, 0, p.size / 2, 0, Math.PI * 2)
                c.fill()
            }
            c.restore()
        }
    }

    destroy()
    {
        this.$canvas?.remove()
    }
}

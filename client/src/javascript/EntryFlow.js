import { CAR_COLORS } from '../../../shared/constants.js'

// Matchbox single-mode flow:
//   page load → box-art screen → COLOR PICKER (this overlay) → game starts.
// All other entry surfaces (legacy menu / onboarding) stay hidden.

export default class EntryFlow
{
    constructor(_options)
    {
        this.config     = _options.config
        this.onComplete = _options.onComplete

        // Hide legacy overlay nodes so they never flash
        for(const id of ['redline-title', 'redline-menu', 'redline-onboarding'])
        {
            const $el = document.getElementById(id)
            if($el) $el.style.display = 'none'
        }
        const $grain = document.getElementById('redline-grain')
        if($grain) $grain.classList.add('hidden')

        // Lock mode + non-color defaults
        this.config.gameMode   = 'collect'
        this.config.soloMode   = false
        this.config.skipLobby  = true
        this.config.carType    = this.config.carType   || 'default'
        const savedName        = localStorage.getItem('mb:playerName')
        this.config.playerName = this.config.playerName || savedName || this._autoName()

        // Restore previous color choice if any
        const saved = parseInt(localStorage.getItem('mb:carColor') ?? '', 10)
        this._selected = Number.isInteger(saved) && saved >= 0 && saved < CAR_COLORS.length ? saved : 0
        this.config.carColor = this._selected

        this._buildPicker()
    }

    _buildPicker()
    {
        const $root = document.createElement('div')
        $root.id = 'mb-color-picker'
        $root.innerHTML = `
            <div class="mb-picker-card">
                <div class="mb-picker-eyebrow">CHOOSE YOUR</div>
                <div class="mb-picker-title">JEEP</div>
                <div class="mb-picker-preview">
                    <svg viewBox="0 0 460 280" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <ellipse cx="230" cy="245" rx="170" ry="14" fill="rgba(0,0,0,0.45)"/>
                        <path id="mb-jeep-body" d="M50 200 Q60 168 100 162 L150 158 L160 140 L320 138 L335 158 L380 164 Q410 170 416 200 L416 230 L50 230 Z"
                              stroke="#1a1a1a" stroke-width="6" stroke-linejoin="round"/>
                        <path id="mb-jeep-side" d="M70 196 L400 196 L400 218 L70 218 Z"/>
                        <path d="M168 144 L312 142 L302 100 L184 102 Z" fill="#cfe9e8" stroke="#1a1a1a" stroke-width="5"/>
                        <rect x="190" y="84" width="100" height="14" fill="#1a1a1a" rx="2"/>
                        <rect x="196" y="74" width="18" height="14" fill="#f0c14b" stroke="#1a1a1a" stroke-width="2"/>
                        <rect x="218" y="74" width="18" height="14" fill="#f0c14b" stroke="#1a1a1a" stroke-width="2"/>
                        <rect x="240" y="74" width="18" height="14" fill="#f0c14b" stroke="#1a1a1a" stroke-width="2"/>
                        <rect x="262" y="74" width="18" height="14" fill="#f0c14b" stroke="#1a1a1a" stroke-width="2"/>
                        <rect x="80" y="178" width="62" height="36" fill="#1a1a1a"/>
                        <circle cx="90" cy="170" r="9" fill="#f0c14b" stroke="#1a1a1a" stroke-width="3"/>
                        <circle cx="120" cy="170" r="9" fill="#f0c14b" stroke="#1a1a1a" stroke-width="3"/>
                        <circle cx="118" cy="232" r="36" fill="#1a1a1a"/>
                        <circle cx="118" cy="232" r="14" fill="#9ba8b0"/>
                        <circle cx="350" cy="232" r="36" fill="#1a1a1a"/>
                        <circle cx="350" cy="232" r="14" fill="#9ba8b0"/>
                    </svg>
                </div>
                <div class="mb-picker-grid"></div>
                <button class="mb-picker-go" type="button">START</button>
                <div class="mb-picker-hint" id="mb-picker-hint">Driver: <strong id="mb-picker-name">${this._escape(this.config.playerName)}</strong></div>
            </div>
        `
        document.body.appendChild($root)
        this.$root = $root

        const $grid     = $root.querySelector('.mb-picker-grid')
        const $jeepBody = $root.querySelector('#mb-jeep-body')
        const $jeepSide = $root.querySelector('#mb-jeep-side')
        const $goBtn    = $root.querySelector('.mb-picker-go')

        // Build swatches
        CAR_COLORS.forEach((hex, i) =>
        {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'mb-swatch' + (i === this._selected ? ' selected' : '')
            btn.style.background = hex
            btn.dataset.i = String(i)
            btn.setAttribute('aria-label', `Color ${i + 1}`)
            btn.addEventListener('click', () =>
            {
                this._selected = i
                this.config.carColor = i
                $root.querySelectorAll('.mb-swatch').forEach((s, k) =>
                {
                    s.classList.toggle('selected', k === i)
                })
                this._paintPreview($jeepBody, $jeepSide)
            })
            $grid.appendChild(btn)
        })

        this._paintPreview($jeepBody, $jeepSide)

        $goBtn.addEventListener('click', () => this._start())
        // Keyboard shortcut: Enter / Space to start
        this._keyHandler = (e) =>
        {
            if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._start() }
        }
        document.addEventListener('keydown', this._keyHandler)
    }

    _paintPreview($body, $side)
    {
        const hex = CAR_COLORS[this._selected]
        if($body) $body.setAttribute('fill', hex)
        if($side) $side.setAttribute('fill', this._shade(hex, -0.22))
    }

    _shade(hex, lum)
    {
        let h = hex.replace('#', '')
        if(h.length === 3) h = h.split('').map(c => c + c).join('')
        const num = parseInt(h, 16)
        const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 0xff) * (1 + lum))))
        const g = Math.max(0, Math.min(255, Math.round(((num >>  8) & 0xff) * (1 + lum))))
        const b = Math.max(0, Math.min(255, Math.round(( num        & 0xff) * (1 + lum))))
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
    }

    _start()
    {
        if(this._started) return
        this._started = true
        document.removeEventListener('keydown', this._keyHandler)
        localStorage.setItem('mb:carColor', String(this._selected))

        if(this.$root)
        {
            this.$root.style.transition = 'opacity 0.35s'
            this.$root.style.opacity = '0'
            setTimeout(() => this.$root.remove(), 380)
        }

        this.onComplete?.()
    }

    _autoName()
    {
        const adj  = ['Quick', 'Lucky', 'Mighty', 'Tiny', 'Speedy', 'Brave', 'Wild', 'Bold']
        const noun = ['Driver', 'Racer', 'Collector', 'Hunter', 'Rookie', 'Ace']
        return `${adj[Math.floor(Math.random()*adj.length)]}${noun[Math.floor(Math.random()*noun.length)]}`
    }

    _escape(s)
    {
        return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
    }
}

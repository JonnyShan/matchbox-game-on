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
                <div class="mb-picker-title">COLOR</div>
                <div class="mb-picker-grid"></div>
                <button class="mb-picker-go" type="button">START</button>
                <div class="mb-picker-hint" id="mb-picker-hint">Driver: <strong id="mb-picker-name">${this._escape(this.config.playerName)}</strong></div>
            </div>
        `
        document.body.appendChild($root)
        this.$root = $root

        const $grid  = $root.querySelector('.mb-picker-grid')
        const $goBtn = $root.querySelector('.mb-picker-go')

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
            })
            $grid.appendChild(btn)
        })

        $goBtn.addEventListener('click', () => this._start())
        // Keyboard shortcut: Enter / Space to start
        this._keyHandler = (e) =>
        {
            if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._start() }
        }
        document.addEventListener('keydown', this._keyHandler)
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

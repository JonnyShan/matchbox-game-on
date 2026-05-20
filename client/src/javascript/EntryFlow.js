import { CAR_COLORS } from '../../../shared/constants.js'

// Matchbox single-mode entry flow:
//   page load → box-art screen → COLOR pick → BODY pick → game starts.

const BODY_SHAPES = [
    { key: 'default',    name: 'WRANGLER',  blurb: 'Balanced',  hpHint: '100 HP · 1.00x SPD',  type: 'default'    },
    { key: 'tank',       name: 'GLADIATOR', blurb: 'Heavy bruiser. Slower.',    hpHint: '160 HP · 0.90x SPD',  type: 'tank'       },
    { key: 'speeder',    name: 'CHEROKEE',  blurb: 'Fast, fragile.',            hpHint: ' 75 HP · 1.20x SPD',  type: 'speeder'    },
    { key: 'cybertruck', name: 'RENEGADE',  blurb: 'Nimble + sturdy.',          hpHint: '100 HP · 1.00x SPD',  type: 'cybertruck' },
]

export default class EntryFlow
{
    constructor(_options)
    {
        this.config     = _options.config
        this.onComplete = _options.onComplete

        // Hide legacy overlay nodes
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
        const savedName        = localStorage.getItem('mb:playerName')
        this.config.playerName = this.config.playerName || savedName || this._autoName()

        // Restore previous picks if any
        const savedColor = parseInt(localStorage.getItem('mb:carColor') ?? '', 10)
        this._selectedColor = Number.isInteger(savedColor) && savedColor >= 0 && savedColor < CAR_COLORS.length ? savedColor : 0
        this.config.carColor = this._selectedColor

        const savedBody = localStorage.getItem('mb:carBody')
        this._selectedBody = BODY_SHAPES.findIndex(b => b.key === savedBody)
        if(this._selectedBody < 0) this._selectedBody = 0
        this.config.carType = BODY_SHAPES[this._selectedBody].type

        // Let the Matchbox "Game On" box-art sit on screen for 4s before the
        // picker overlay drops in. Skip the wait if the player taps anything.
        const INTRO_HOLD_MS = 4000
        let opened = false
        const open = () =>
        {
            if(opened) return
            opened = true
            document.removeEventListener('pointerdown', open)
            document.removeEventListener('keydown', open)
            clearTimeout(this._introTimer)
            this._buildPicker()
        }
        this._introTimer = setTimeout(open, INTRO_HOLD_MS)
        document.addEventListener('pointerdown', open, { once: true })
        document.addEventListener('keydown',     open, { once: true })
    }

    _buildPicker()
    {
        const $root = document.createElement('div')
        $root.id = 'mb-color-picker'
        $root.innerHTML = `
            <div class="mb-picker-card">
                <div class="mb-picker-step" id="mb-picker-step-color">
                    <div class="mb-picker-eyebrow">STEP 1 OF 2</div>
                    <div class="mb-picker-title">COLOR</div>
                    <div class="mb-picker-grid"></div>
                    <button class="mb-picker-go" id="mb-picker-color-next" type="button">NEXT</button>
                </div>

                <div class="mb-picker-step" id="mb-picker-step-body" style="display:none">
                    <div class="mb-picker-eyebrow">STEP 2 OF 2</div>
                    <div class="mb-picker-title">JEEP</div>
                    <div class="mb-picker-body-grid"></div>
                    <div class="mb-picker-buttons">
                        <button class="mb-picker-back" id="mb-picker-back" type="button">← BACK</button>
                        <button class="mb-picker-go"   id="mb-picker-start" type="button">START</button>
                    </div>
                </div>

                <div class="mb-picker-hint" id="mb-picker-hint">Driver: <strong>${this._escape(this.config.playerName)}</strong></div>
            </div>
        `
        document.body.appendChild($root)
        this.$root = $root

        const $colorStep = $root.querySelector('#mb-picker-step-color')
        const $bodyStep  = $root.querySelector('#mb-picker-step-body')
        const $grid      = $root.querySelector('.mb-picker-grid')
        const $bodyGrid  = $root.querySelector('.mb-picker-body-grid')

        // ── Step 1: color swatches ───────────────────────────────────────────
        CAR_COLORS.forEach((hex, i) =>
        {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'mb-swatch' + (i === this._selectedColor ? ' selected' : '')
            btn.style.background = hex
            btn.dataset.i = String(i)
            btn.setAttribute('aria-label', `Color ${i + 1}`)
            btn.addEventListener('click', () =>
            {
                this._selectedColor  = i
                this.config.carColor = i
                $root.querySelectorAll('.mb-swatch').forEach((s, k) =>
                    s.classList.toggle('selected', k === i)
                )
            })
            $grid.appendChild(btn)
        })

        // ── Step 2: body shape cards ─────────────────────────────────────────
        BODY_SHAPES.forEach((b, i) =>
        {
            const card = document.createElement('button')
            card.type = 'button'
            card.className = 'mb-body-card' + (i === this._selectedBody ? ' selected' : '')
            card.dataset.i = String(i)
            card.innerHTML = `
                <div class="mb-body-name">${b.name}</div>
                <div class="mb-body-blurb">${b.blurb}</div>
                <div class="mb-body-stats">${b.hpHint}</div>
            `
            card.addEventListener('click', () =>
            {
                this._selectedBody  = i
                this.config.carType = b.type
                $root.querySelectorAll('.mb-body-card').forEach((c, k) =>
                    c.classList.toggle('selected', k === i)
                )
            })
            $bodyGrid.appendChild(card)
        })

        // ── Navigation ───────────────────────────────────────────────────────
        $root.querySelector('#mb-picker-color-next').addEventListener('click', () =>
        {
            $colorStep.style.display = 'none'
            $bodyStep.style.display  = 'block'
        })
        $root.querySelector('#mb-picker-back').addEventListener('click', () =>
        {
            $bodyStep.style.display  = 'none'
            $colorStep.style.display = 'block'
        })
        $root.querySelector('#mb-picker-start').addEventListener('click', () => this._start())

        // Enter/Space starts on body step
        this._keyHandler = (e) =>
        {
            if(e.key === 'Enter' || e.key === ' ')
            {
                e.preventDefault()
                if($bodyStep.style.display !== 'none') this._start()
                else $root.querySelector('#mb-picker-color-next').click()
            }
        }
        document.addEventListener('keydown', this._keyHandler)
    }

    _start()
    {
        if(this._started) return
        this._started = true
        document.removeEventListener('keydown', this._keyHandler)
        localStorage.setItem('mb:carColor', String(this._selectedColor))
        localStorage.setItem('mb:carBody', BODY_SHAPES[this._selectedBody].key)

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

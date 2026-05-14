import gsap from 'gsap'

// Matchbox single-mode flow:
// Title screen → (press any key) → straight into COLLECT.
// No menu, no onboarding, no manual mode pick. Locked to gameMode='collect'.

export default class EntryFlow
{
    constructor(_options)
    {
        this.config     = _options.config
        this.onComplete = _options.onComplete

        this.$title      = document.getElementById('redline-title')
        this.$menu       = document.getElementById('redline-menu')
        this.$onboarding = document.getElementById('redline-onboarding')
        this.$grain      = document.getElementById('redline-grain')

        // Hide the legacy menu + onboarding nodes outright (they ship from the
        // template but are unreachable in single-mode Matchbox build).
        if(this.$menu)       this.$menu.style.display       = 'none'
        if(this.$onboarding) this.$onboarding.style.display = 'none'

        this._showTitle()
    }

    _showTitle()
    {
        this.$title.classList.add('is-active')
        this.$grain?.classList.remove('hidden')

        const logo    = this.$title.querySelector('.mb-logo')
        const tagline = this.$title.querySelector('.rl-tagline')
        const stats   = this.$title.querySelector('.mb-stats')
        const prompt  = this.$title.querySelector('.rl-prompt')

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.fromTo(logo,    { scale: 0.85, opacity: 0, y: -10 }, { scale: 1, opacity: 1, y: 0, duration: 0.9 })
          .fromTo(tagline, { y: 12, opacity: 0 },               { y: 0, opacity: 1, duration: 0.5 }, '-=0.4')
          .fromTo(stats,   { y: 12, opacity: 0 },               { y: 0, opacity: 1, duration: 0.5 }, '-=0.3')
          .fromTo(prompt,  { opacity: 0 },                       { opacity: 0.55, duration: 0.4 }, '-=0.1')

        const advance = () =>
        {
            document.removeEventListener('keydown', this._keyHandler)
            this.$title.removeEventListener('click', this._clickHandler)
            this._enterGame(logo, tagline, stats, prompt)
        }

        this._keyHandler = (e) =>
        {
            if(e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return
            advance()
        }
        this._clickHandler = () => advance()
        document.addEventListener('keydown', this._keyHandler, { once: true })
        this.$title.addEventListener('click', this._clickHandler, { once: true })
    }

    _enterGame(logo, tagline, stats, prompt)
    {
        // Lock the mode + defaults — no lobby, no picker
        this.config.gameMode  = 'collect'
        this.config.soloMode  = false
        this.config.skipLobby = true
        this.config.carColor  = this.config.carColor ?? Math.floor(Math.random() * 8)
        this.config.carType   = this.config.carType  || 'default'
        this.config.playerName = this.config.playerName || this._autoName()

        gsap.timeline({
            onComplete: () =>
            {
                this.$title.classList.remove('is-active')
                this.$grain?.classList.add('hidden')
                this.onComplete?.()
            },
        })
        .to([logo, tagline, stats, prompt], {
            opacity: 0, y: -8, duration: 0.45, ease: 'power2.in', stagger: 0.05,
        })
    }

    _autoName()
    {
        const adj  = ['Quick', 'Lucky', 'Mighty', 'Tiny', 'Speedy', 'Brave', 'Wild', 'Bold']
        const noun = ['Driver', 'Racer', 'Collector', 'Hunter', 'Rookie', 'Ace']
        return `${adj[Math.floor(Math.random()*adj.length)]}${noun[Math.floor(Math.random()*noun.length)]}`
    }
}

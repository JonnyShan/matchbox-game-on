// Single-mode Matchbox build: no title, no menu, no onboarding, no lobby.
// Resources finish loading → EntryFlow seeds defaults → onComplete fires →
// LobbyUI auto-submits → game starts.

export default class EntryFlow
{
    constructor(_options)
    {
        this.config     = _options.config
        this.onComplete = _options.onComplete

        // Hide legacy overlay nodes so they never flash
        const $title      = document.getElementById('redline-title')
        const $menu       = document.getElementById('redline-menu')
        const $onboarding = document.getElementById('redline-onboarding')
        const $grain      = document.getElementById('redline-grain')

        if($title)      $title.style.display      = 'none'
        if($menu)       $menu.style.display       = 'none'
        if($onboarding) $onboarding.style.display = 'none'
        if($grain)      $grain.classList.add('hidden')

        // Lock the mode + defaults — no UI required
        this.config.gameMode  = 'collect'
        this.config.soloMode  = false
        this.config.skipLobby = true
        this.config.carColor  = this.config.carColor ?? Math.floor(Math.random() * 8)
        this.config.carType   = this.config.carType  || 'default'
        this.config.playerName = this.config.playerName || this._autoName()

        // Defer one frame so Application's existing setup ordering stays intact
        requestAnimationFrame(() => this.onComplete?.())
    }

    _autoName()
    {
        const adj  = ['Quick', 'Lucky', 'Mighty', 'Tiny', 'Speedy', 'Brave', 'Wild', 'Bold']
        const noun = ['Driver', 'Racer', 'Collector', 'Hunter', 'Rookie', 'Ace']
        return `${adj[Math.floor(Math.random()*adj.length)]}${noun[Math.floor(Math.random()*noun.length)]}`
    }
}

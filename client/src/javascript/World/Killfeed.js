// Killfeed: tiny scrolling list of recent kill events, top-right of screen.
// Each row fades out after KILL_TTL_MS. Driven entirely by server combat:death.

const KILL_TTL_MS = 5000
const MAX_ROWS    = 6

const SOURCE_ICON = {
    missile: '🚀',
    mine:    '💣',
    meteor:  '☄️',
}

export default class Killfeed
{
    constructor(_options)
    {
        this.network = _options.network
        this.$root   = this._buildRoot()
        this._rows = []  // { $row, ts }

        if(this.network)
        {
            this.network.on('combat:death', (data) => this.push(data))
        }
    }

    _buildRoot()
    {
        const root = document.createElement('div')
        root.id = 'killfeed'
        root.style.cssText = `
            position: fixed;
            top: 56px;
            right: 16px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-family: monospace;
            font-size: 12px;
            z-index: 510;
            pointer-events: none;
        `
        document.body.appendChild(root)
        return root
    }

    push({ killerName, victimName, source } = {})
    {
        const $row = document.createElement('div')
        $row.style.cssText = `
            background: rgba(0,0,0,0.55);
            border: 1px solid rgba(255,46,77,0.35);
            backdrop-filter: blur(4px);
            border-radius: 4px;
            padding: 4px 10px;
            color: #fff;
            letter-spacing: 0.5px;
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 8px;
            opacity: 0;
            transform: translateX(20px);
            transition: opacity 0.25s, transform 0.25s;
        `
        const icon = SOURCE_ICON[source] || '💥'
        $row.innerHTML = `
            <span style="color:#fff">${escapeHtml(killerName || '???')}</span>
            <span style="opacity:0.7">${icon}</span>
            <span style="color:#FF2E4D">${escapeHtml(victimName || '???')}</span>
        `
        this.$root.appendChild($row)
        // Animate in
        requestAnimationFrame(() =>
        {
            $row.style.opacity = '1'
            $row.style.transform = 'translateX(0)'
        })

        this._rows.push({ $row, ts: Date.now() })
        // Prune oldest if over cap
        while(this._rows.length > MAX_ROWS) this._removeRow(this._rows.shift())

        setTimeout(() =>
        {
            const idx = this._rows.findIndex(r => r.$row === $row)
            if(idx >= 0) this._removeRow(this._rows.splice(idx, 1)[0])
        }, KILL_TTL_MS)
    }

    _removeRow({ $row })
    {
        $row.style.opacity = '0'
        $row.style.transform = 'translateX(20px)'
        setTimeout(() => { if($row.parentNode) $row.parentNode.removeChild($row) }, 260)
    }
}

function escapeHtml(s)
{
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]))
}

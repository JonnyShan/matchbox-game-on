import * as THREE from 'three'

// Floats damage numbers above hit positions for ~900ms. Driven by server
// combat:hp events. Uses canvas-backed sprites so the numbers always face
// the camera and stay legible without HUD overlay tricks.

const LIFE_MS  = 900
const RISE     = 1.4   // meters rise over LIFE_MS

function makeNumberTexture(value, color = '#ffffff')
{
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 96
    const ctx = c.getContext('2d')
    ctx.font = '700 64px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'
    ctx.fillStyle = color
    const text = `-${value}`
    ctx.strokeText(text, 64, 48)
    ctx.fillText(text, 64, 48)
    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    return tex
}

export default class DamageNumbers
{
    constructor(_options)
    {
        this.scene   = _options.scene
        this.network = _options.network
        this._items  = []

        if(this.network)
        {
            this.network.on('combat:hp', (data) => this.spawn(data))
        }
    }

    spawn({ amount, x, y, z, id, fromId } = {})
    {
        if(!amount || amount <= 0 || x === undefined) return
        const localId = this.network?.localId
        // Red for damage taken by us, white for everyone else, gold if we dealt it
        let color = '#ffffff'
        if(id === localId)        color = '#ff5555'
        else if(fromId === localId) color = '#ffe066'

        const tex = makeNumberTexture(amount, color)
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
        const sprite = new THREE.Sprite(mat)
        sprite.position.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + 1.6)
        sprite.scale.set(1.5, 1.1, 1)
        sprite.frustumCulled = false
        this.scene.add(sprite)
        this._items.push({ sprite, mat, tex, t: 0 })
    }

    update(dt)
    {
        for(let i = this._items.length - 1; i >= 0; i--)
        {
            const it = this._items[i]
            it.t += dt
            const p = Math.min(it.t / LIFE_MS, 1)
            if(p >= 1)
            {
                this.scene.remove(it.sprite)
                it.mat.dispose()
                it.tex.dispose()
                this._items.splice(i, 1)
                continue
            }
            it.sprite.position.z += (RISE / LIFE_MS) * dt
            it.mat.opacity = 1 - p * p
        }
    }
}

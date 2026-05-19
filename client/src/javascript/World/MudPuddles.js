import * as THREE from 'three'
import { COLLECT } from '../../../../shared/constants.js'

// Visual brown puddles on the ground + per-tick friction modifier:
// when the local car is inside a puddle, scale its horizontal velocity by
// puddle.drag each frame, leaving a brief slip.

function makePuddleTexture()
{
    const SZ = 128
    const c = document.createElement('canvas')
    c.width = c.height = SZ
    const ctx = c.getContext('2d')
    // soft brown radial blob
    const g = ctx.createRadialGradient(SZ/2, SZ/2, 0, SZ/2, SZ/2, SZ/2)
    g.addColorStop(0,    'rgba(56, 36, 18, 0.95)')
    g.addColorStop(0.55, 'rgba(70, 48, 22, 0.65)')
    g.addColorStop(1,    'rgba(70, 48, 22, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SZ, SZ)
    // dark speckles for "wet mud" texture
    for(let i = 0; i < 40; i++)
    {
        const r = Math.random() * SZ * 0.42
        const a = Math.random() * Math.PI * 2
        const x = SZ/2 + Math.cos(a) * r
        const y = SZ/2 + Math.sin(a) * r
        ctx.fillStyle = `rgba(20, 12, 5, ${0.2 + Math.random() * 0.3})`
        ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3)
    }
    // little highlight glints
    for(let i = 0; i < 12; i++)
    {
        const r = Math.random() * SZ * 0.35
        const a = Math.random() * Math.PI * 2
        const x = SZ/2 + Math.cos(a) * r
        const y = SZ/2 + Math.sin(a) * r
        ctx.fillStyle = `rgba(150, 110, 70, ${0.15 + Math.random() * 0.15})`
        ctx.fillRect(x, y, 2, 1)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    return tex
}

export default class MudPuddles
{
    constructor(_options)
    {
        this.scene   = _options.scene
        this.physics = _options.physics
        this._items  = []
        this._tex    = makePuddleTexture()
        this._build()
    }

    _build()
    {
        for(const def of COLLECT.mudPuddles)
        {
            const mat = new THREE.MeshBasicMaterial({
                map:         this._tex,
                transparent: true,
                depthWrite:  false,
            })
            const geo = new THREE.PlaneGeometry(def.r * 2, def.r * 2)
            const mesh = new THREE.Mesh(geo, mat)
            mesh.position.set(def.x, def.y, 0.04)   // just above arena floor
            mesh.frustumCulled = false
            this.scene.add(mesh)
            this._items.push({ mesh, ...def, r2: def.r * def.r })
        }
    }

    // Called from World tick — slows local car when overlapping any puddle.
    update()
    {
        const body = this.physics?.car?.chassis?.body
        if(!body) return
        const px = body.position.x, py = body.position.y
        // Only apply drag if car is on/near the ground (z < ~1.5 m)
        if(body.position.z > 1.5) return
        for(const p of this._items)
        {
            const dx = px - p.x, dy = py - p.y
            if(dx * dx + dy * dy <= p.r2)
            {
                body.velocity.x *= p.drag
                body.velocity.y *= p.drag
                return
            }
        }
    }

    destroy()
    {
        for(const it of this._items) this.scene.remove(it.mesh)
        this._items = []
    }
}

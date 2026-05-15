import * as THREE from 'three'
import { COLLECT } from '../../../../shared/constants.js'

// Matchbox-style pickup visual: camera-facing sprite of a blister-pack box
// + a tall gold beacon beam so the pickup is visible from anywhere on the map.
// Server is authoritative for collected state.

const CARD_W = 2.4
const CARD_H = 3.6
const BEAM_HEIGHT = 14
const BEAM_RADIUS = 0.55
const BOB_AMP   = 0.25
const BOB_SPEED = 0.0019

const CAR_TINTS = {
    pickup: '#5fa83f',
    sedan:  '#3478c8',
    sports: '#e54e34',
    truck:  '#f0c14b',
}

// Build a Matchbox-style blister-pack texture for the sprite face.
function makeBlisterTexture(modelKey)
{
    const W = 256, H = 384
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')

    // Cardboard backer with grain
    ctx.fillStyle = '#f3e9d2'
    ctx.fillRect(0, 0, W, H)
    for(let i = 0; i < 220; i++)
    {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(180,150,90,0.08)' : 'rgba(120,90,40,0.06)'
        ctx.fillRect(Math.random() * W, Math.random() * H, 2, 1)
    }

    // Top red header
    ctx.fillStyle = '#d83a2f'
    ctx.fillRect(0, 0, W, 90)
    ctx.fillStyle = '#f0c14b'
    ctx.fillRect(0, 86, W, 4)

    ctx.fillStyle = '#f7ecd2'
    ctx.font = '900 44px "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('MATCHBOX', W / 2, 48)

    // Window outline
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 4
    ctx.strokeRect(28, 130, W - 56, 200)

    // Forest backdrop inside window
    const g = ctx.createLinearGradient(0, 130, 0, 330)
    g.addColorStop(0,   '#bfd9c4')
    g.addColorStop(0.6, '#7fae73')
    g.addColorStop(1,   '#5a8a3e')
    ctx.fillStyle = g
    ctx.fillRect(30, 132, W - 60, 196)

    // Tiny tree silhouettes
    ctx.fillStyle = 'rgba(40, 70, 35, 0.55)'
    for(let i = 0; i < 6; i++)
    {
        const tx = 40 + i * 30 + Math.random() * 8
        const ty = 200 + Math.random() * 12
        ctx.beginPath()
        ctx.moveTo(tx, ty + 30)
        ctx.lineTo(tx + 8, ty - 14)
        ctx.lineTo(tx + 16, ty + 30)
        ctx.closePath()
        ctx.fill()
    }

    // Road strip
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(30, 268, W - 60, 18)
    ctx.fillStyle = '#f7ecd2'
    for(let i = 30; i < W - 30; i += 26) ctx.fillRect(i, 276, 12, 2)

    // Car silhouette tinted by model
    const carColor = CAR_TINTS[modelKey] || CAR_TINTS.sedan
    ctx.fillStyle = carColor
    if(modelKey === 'pickup' || modelKey === 'truck')
    {
        ctx.fillRect(78, 232, 50, 32)
        ctx.fillRect(128, 244, 70, 20)
    }
    else if(modelKey === 'sports')
    {
        ctx.beginPath()
        ctx.moveTo(74, 264); ctx.lineTo(102, 232)
        ctx.lineTo(160, 232); ctx.lineTo(190, 264)
        ctx.closePath(); ctx.fill()
    }
    else
    {
        ctx.fillRect(80, 240, 110, 24)
        ctx.beginPath()
        ctx.moveTo(96, 240); ctx.lineTo(108, 222)
        ctx.lineTo(168, 222); ctx.lineTo(184, 240)
        ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath(); ctx.arc(96,  274, 9, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(178, 274, 9, 0, Math.PI * 2); ctx.fill()

    // Footer
    ctx.fillStyle = '#d83a2f'
    ctx.fillRect(0, H - 50, W, 50)
    ctx.fillStyle = '#f7ecd2'
    ctx.font = '700 22px "Space Grotesk", sans-serif'
    ctx.fillText(modelKey.toUpperCase(), W / 2, H - 25)

    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    return tex
}

// Build the tall vertical gold light-beam used to make pickups findable.
function buildBeam()
{
    const geo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS * 1.4, BEAM_HEIGHT, 16, 1, true)
    // CylinderGeometry runs along Y axis by default; we rotate to Z-up
    const mat = new THREE.MeshBasicMaterial({
        color:        0xffd76a,
        transparent:  true,
        opacity:      0.55,
        side:         THREE.DoubleSide,
        depthWrite:   false,
        blending:     THREE.AdditiveBlending,
    })
    const beam = new THREE.Mesh(geo, mat)
    beam.rotation.x = Math.PI / 2   // align with world Z
    return beam
}

function buildPickup(modelKey)
{
    const group = new THREE.Group()

    // Camera-facing card
    const blister = makeBlisterTexture(modelKey)
    const cardMat = new THREE.SpriteMaterial({
        map: blister,
        transparent: false,
        depthWrite:  true,
    })
    const card = new THREE.Sprite(cardMat)
    card.scale.set(CARD_W, CARD_H, 1)
    card.center.set(0.5, 0.5)
    group.add(card)
    group.userData.card = card

    // Gold halo behind card (always faces camera too)
    const haloTex = makeHaloTexture()
    const haloMat = new THREE.SpriteMaterial({
        map: haloTex,
        transparent: true,
        opacity:     0.7,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
    })
    const halo = new THREE.Sprite(haloMat)
    halo.scale.set(CARD_W * 2.2, CARD_H * 2.0, 1)
    halo.position.z = -0.05
    group.add(halo)
    group.userData.halo = halo

    return group
}

function makeHaloTexture()
{
    const S = 128
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2)
    g.addColorStop(0,   'rgba(255, 215, 106, 0.9)')
    g.addColorStop(0.5, 'rgba(255, 180,  60, 0.35)')
    g.addColorStop(1,   'rgba(255, 180,  60, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    return new THREE.CanvasTexture(c)
}

function buildGroundDisc()
{
    const geo = new THREE.RingGeometry(1.2, 1.8, 32)
    const mat = new THREE.MeshBasicMaterial({
        color:       0xffd76a,
        transparent: true,
        opacity:     0.75,
        side:        THREE.DoubleSide,
        depthWrite:  false,
    })
    const m = new THREE.Mesh(geo, mat)
    // Lying flat on XY plane (no rotation needed in Z-up world)
    return m
}

export default class CollectPickups
{
    constructor(_options)
    {
        this.scene   = _options.scene
        this.network = _options.network
        this._items  = new Map()    // idx → { card, halo, beam, disc, baseZ, idx }
        this._t = 0

        if(this.network)
        {
            this.network.on('collect:pickup', ({ idx }) => this._burst(idx))
        }
    }

    spawnFromState(state)
    {
        if(!state || !Array.isArray(state.pickups))
        {
            console.warn('[CollectPickups] spawnFromState: no pickups in state', state)
            return
        }
        console.log(`[CollectPickups] spawning ${state.pickups.length} pickups`)
        for(const p of state.pickups)
        {
            if(p.collected) continue
            this._spawn(p.idx, p.x, p.y, p.z, p.model)
        }
    }

    _spawn(idx, x, y, z, model)
    {
        if(this._items.has(idx)) return

        const group = buildPickup(model)
        group.position.set(x, y, z + 1.5)   // raise card so center is well above ground
        group.frustumCulled = false
        this.scene.add(group)

        const beam = buildBeam()
        beam.position.set(x, y, BEAM_HEIGHT / 2)
        beam.frustumCulled = false
        this.scene.add(beam)

        const disc = buildGroundDisc()
        disc.position.set(x, y, 0.03)
        disc.frustumCulled = false
        this.scene.add(disc)

        this._items.set(idx, { group, beam, disc, baseZ: z + 1.5, idx })
    }

    _burst(idx)
    {
        const item = this._items.get(idx)
        if(!item) return
        // Quick celebratory pop + fade
        const start = Date.now()
        const DUR = 450
        const baseScaleY = item.group.userData.card?.scale.y || CARD_H
        const tick = () =>
        {
            const t = Math.min(1, (Date.now() - start) / DUR)
            item.group.position.z = item.baseZ + t * 2.4
            const s = 1 + t * 0.6
            item.group.userData.card?.scale.set(CARD_W * s, baseScaleY * s, 1)
            item.group.userData.halo?.material && (item.group.userData.halo.material.opacity = 0.7 * (1 - t))
            item.group.userData.card?.material && (item.group.userData.card.material.opacity = 1 - t)
            if(item.group.userData.card?.material) item.group.userData.card.material.transparent = true
            item.beam.material.opacity = 0.55 * (1 - t)
            item.disc.material.opacity = 0.75 * (1 - t)
            if(t < 1) requestAnimationFrame(tick)
            else
            {
                this.scene.remove(item.group)
                this.scene.remove(item.beam)
                this.scene.remove(item.disc)
                this._items.delete(idx)
            }
        }
        tick()
    }

    clearAll()
    {
        for(const item of this._items.values())
        {
            this.scene.remove(item.group)
            this.scene.remove(item.beam)
            this.scene.remove(item.disc)
        }
        this._items.clear()
    }

    update(dt)
    {
        this._t += dt
        for(const item of this._items.values())
        {
            const bob = Math.sin(this._t * BOB_SPEED + item.idx * 0.9) * BOB_AMP
            item.group.position.z = item.baseZ + bob

            // Halo pulse
            const halo = item.group.userData.halo
            if(halo?.material)
            {
                halo.material.opacity = 0.5 + 0.3 * (0.5 + 0.5 * Math.sin(this._t * 0.004 + item.idx))
            }

            // Beam pulse
            if(item.beam?.material)
            {
                item.beam.material.opacity = 0.45 + 0.2 * (0.5 + 0.5 * Math.sin(this._t * 0.003 + item.idx))
            }

            // Disc slow rotation around Z
            if(item.disc) item.disc.rotation.z = this._t * 0.001
        }
    }
}

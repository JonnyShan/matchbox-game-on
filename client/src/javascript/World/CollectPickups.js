import * as THREE from 'three'
import { COLLECT } from '../../../../shared/constants.js'

// Matchbox-style pickup visual: cardboard blister-pack box with a tiny stylized
// car silhouette inside + MATCHBOX label on the top edge. Each pickup is one of
// four "models" (pickup/sedan/sports/truck) — only the car silhouette inside
// the box changes between them.
//
// Server is authoritative for collected state. This class spawns the visuals,
// listens to `collect:pickup` to remove them, animates bobbing + spinning.

const BOX_W = 1.6
const BOX_H = 2.4
const BOX_D = 0.25
const BOB_AMP   = 0.22
const BOB_SPEED = 0.0018
const SPIN_RATE = 0.0009

const CAR_TINTS = {
    pickup: '#5fa83f',   // matchbox-green truck (matches header image)
    sedan:  '#3478c8',
    sports: '#e54e34',
    truck:  '#f0c14b',
}

// Build a 2D Matchbox-style blister-pack texture for the front face.
function makeBlisterTexture(modelKey)
{
    const W = 256, H = 384
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')

    // Cardboard backing — soft cream with subtle grain
    ctx.fillStyle = '#f3e9d2'
    ctx.fillRect(0, 0, W, H)
    for(let i = 0; i < 220; i++)
    {
        const x = Math.random() * W, y = Math.random() * H
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(180,150,90,0.08)' : 'rgba(120,90,40,0.06)'
        ctx.fillRect(x, y, 2, 1)
    }

    // Top red header bar (matches Matchbox brand layout)
    ctx.fillStyle = '#d83a2f'
    ctx.fillRect(0, 0, W, 90)
    // Yellow underline
    ctx.fillStyle = '#f0c14b'
    ctx.fillRect(0, 86, W, 4)

    // MATCHBOX wordmark
    ctx.fillStyle = '#f7ecd2'
    ctx.font = '900 44px "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('MATCHBOX', W / 2, 48)

    // Black outlined window for the "car"
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 4
    ctx.strokeRect(28, 130, W - 56, 200)

    // Forest backdrop inside the window
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

    // Road strip across the window
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(30, 268, W - 60, 18)
    ctx.fillStyle = '#f7ecd2'
    for(let i = 30; i < W - 30; i += 26)
    {
        ctx.fillRect(i, 276, 12, 2)
    }

    // Car silhouette — stylized + color-tinted by model
    const carColor = CAR_TINTS[modelKey] || CAR_TINTS.sedan
    ctx.fillStyle = carColor
    if(modelKey === 'pickup' || modelKey === 'truck')
    {
        // Cab + bed pickup truck shape
        ctx.fillRect(78, 232, 50, 32)   // cab
        ctx.fillRect(128, 244, 70, 20)  // bed
    }
    else if(modelKey === 'sports')
    {
        // Sleek low coupe
        ctx.beginPath()
        ctx.moveTo(74, 264)
        ctx.lineTo(102, 232)
        ctx.lineTo(160, 232)
        ctx.lineTo(190, 264)
        ctx.closePath()
        ctx.fill()
    }
    else
    {
        // Sedan
        ctx.fillRect(80, 240, 110, 24)
        ctx.beginPath()
        ctx.moveTo(96, 240); ctx.lineTo(108, 222)
        ctx.lineTo(168, 222); ctx.lineTo(184, 240)
        ctx.closePath(); ctx.fill()
    }
    // Wheels
    ctx.fillStyle = '#1a1a1a'
    ctx.beginPath(); ctx.arc(96,  274, 9, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(178, 274, 9, 0, Math.PI * 2); ctx.fill()

    // Footer red strip with model name
    ctx.fillStyle = '#d83a2f'
    ctx.fillRect(0, H - 50, W, 50)
    ctx.fillStyle = '#f7ecd2'
    ctx.font = '700 22px "Space Grotesk", sans-serif'
    ctx.fillText(modelKey.toUpperCase(), W / 2, H - 25)

    return new THREE.CanvasTexture(c)
}

function buildPickup(modelKey)
{
    const group = new THREE.Group()

    // Cardboard backer (thin box)
    const blister = makeBlisterTexture(modelKey)
    const frontMat = new THREE.MeshBasicMaterial({ map: blister })
    const sideMat  = new THREE.MeshBasicMaterial({ color: 0xf0c14b })
    const backMat  = new THREE.MeshBasicMaterial({ color: 0xe8d49b })

    const mats = [sideMat, sideMat, sideMat, sideMat, frontMat, backMat]
    const box = new THREE.Mesh(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D), mats)
    group.add(box)

    // Hanger tab at top
    const tab = new THREE.Mesh(
        new THREE.BoxGeometry(BOX_W * 0.5, BOX_H * 0.12, BOX_D),
        new THREE.MeshBasicMaterial({ color: 0xf3e9d2 }),
    )
    tab.position.y = BOX_H * 0.56
    group.add(tab)

    // Gold pulse halo behind the box
    const halo = new THREE.Mesh(
        new THREE.RingGeometry(BOX_W * 0.65, BOX_W * 0.95, 24),
        new THREE.MeshBasicMaterial({
            color: 0xffd76a, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }),
    )
    group.add(halo)
    group.userData.halo = halo

    // Ground disc under it
    const disc = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.4, 32),
        new THREE.MeshBasicMaterial({
            color: 0xffd76a, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
        }),
    )
    disc.rotation.x = -Math.PI / 2
    group.userData.disc = disc

    return { group, disc }
}

export default class CollectPickups
{
    constructor(_options)
    {
        this.scene   = _options.scene
        this.network = _options.network
        this._items  = new Map()    // idx → { group, disc, baseZ, idx }
        this._t = 0

        if(this.network)
        {
            this.network.on('collect:pickup', ({ idx, x, y, z, model, completed }) =>
            {
                this._burst(idx)
            })
        }
    }

    spawnFromState(state)
    {
        // state.pickups[]: { idx, x, y, z, model, collected, collectedBy }
        for(const p of state.pickups)
        {
            if(p.collected) continue
            this._spawn(p.idx, p.x, p.y, p.z, p.model)
        }
    }

    _spawn(idx, x, y, z, model)
    {
        if(this._items.has(idx)) return
        const { group, disc } = buildPickup(model)
        group.position.set(x, y, z)
        this.scene.add(group)
        // Disc is added separately so it can sit at ground level
        disc.position.set(x, y, 0.02)
        this.scene.add(disc)
        this._items.set(idx, { group, disc, baseZ: z, idx })
    }

    _burst(idx)
    {
        const item = this._items.get(idx)
        if(!item) return
        // Small celebratory upward fade
        const start = Date.now()
        const DUR = 450
        const baseScale = item.group.scale.x
        const tick = () =>
        {
            const t = Math.min(1, (Date.now() - start) / DUR)
            item.group.position.z = item.baseZ + t * 1.6
            item.group.scale.setScalar(baseScale * (1 + t * 0.5))
            item.group.rotation.z += 0.08
            // Fade halo
            const h = item.group.userData.halo
            if(h && h.material) h.material.opacity = 0.45 * (1 - t)
            // Fade box materials
            item.group.traverse((m) =>
            {
                if(m.material && m.material.transparent !== false)
                {
                    m.material.transparent = true
                    m.material.opacity = (m.material.opacity ?? 1) * (1 - t * 0.06)
                }
            })
            item.disc.material.opacity = 0.6 * (1 - t)
            if(t < 1) requestAnimationFrame(tick)
            else
            {
                this.scene.remove(item.group)
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
            this.scene.remove(item.disc)
        }
        this._items.clear()
    }

    update(dt)
    {
        this._t += dt
        for(const item of this._items.values())
        {
            // Always face the camera in Z up — easy: rotate around Z over time
            const bob = Math.sin(this._t * BOB_SPEED + item.idx * 0.9) * BOB_AMP
            item.group.position.z = item.baseZ + bob
            item.group.rotation.z = Math.sin(this._t * SPIN_RATE + item.idx) * 0.35
            item.group.rotation.x = Math.PI / 2   // stand the box upright (face up out of plane)
            // Halo pulse
            const halo = item.group.userData.halo
            if(halo?.material)
            {
                halo.material.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(this._t * 0.004 + item.idx))
            }
            // Disc rotation
            item.disc.rotation.z = -this._t * 0.001
        }
    }
}

import * as THREE from 'three'
import { COLLECT } from '../../../../shared/constants.js'

// Matchbox-style pickup visual: camera-facing sprite of a blister-pack box
// + a tall gold beacon beam so the pickup is visible from anywhere on the map.
// Server is authoritative for collected state.

const CARD_W = 2.8
const CARD_H = 4.4
const BEAM_HEIGHT = 14
const BEAM_RADIUS = 0.55
const BOB_AMP   = 0.25
const BOB_SPEED = 0.0019

// 10 distinct cars to match the real Matchbox collection variety.
// shape ∈ { 'sedan' | 'pickup' | 'sports' | 'truck' | 'micro' | 'classic' | 'wagon' }
const CAR_MODELS = {
    nissan_pickup:    { name: "'62 NISSAN JUNIOR",        brand: 'NISSAN',   body: '#9bbf80', accent: '#7aa05f', window: '#bfd9d8', shape: 'pickup'   },
    el_camino:        { name: "'63 CHEVY EL CAMINO",      brand: 'CHEVY',    body: '#a8c6dc', accent: '#7a98ae', window: '#cfe1e8', shape: 'pickup'   },
    ford_f150:        { name: "'21 FORD F-150 LIGHTNING", brand: 'FORD',     body: '#2a2e34', accent: '#15171b', window: '#9fb3bd', shape: 'truck'    },
    dodge_challenger: { name: "'70 DODGE CHALLENGER",     brand: 'DODGE',    body: '#c63027', accent: '#8c1f17', window: '#bfd9d8', shape: 'sports'   },
    ford_mustang:     { name: "'19 FORD MUSTANG COBRA",   brand: 'FORD',     body: '#1a1a1a', accent: '#3d3d3d', window: '#5a6f7a', shape: 'sports'   },
    volvo_240:        { name: "'82 VOLVO 240 SEDAN",      brand: 'VOLVO',    body: '#7d1f23', accent: '#5a1014', window: '#cfd9d8', shape: 'sedan'    },
    bluebird_wagon:   { name: "'68 BLUEBIRD WAGON",       brand: 'NISSAN',   body: '#4978c8', accent: '#3b65a8', window: '#bfd9d8', shape: 'wagon'    },
    plymouth_coupe:   { name: "'40 PLYMOUTH COUPE",       brand: 'PLYMOUTH', body: '#e6cf86', accent: '#b9a25b', window: '#bfd9d8', shape: 'classic'  },
    fiat_500:         { name: "'70 FIAT 500",             brand: 'FIAT',     body: '#8bcfb1', accent: '#5f9d83', window: '#cfe1d8', shape: 'micro'    },
    international:    { name: "'75 INTERNATIONAL",        brand: 'IH',       body: '#e09a1f', accent: '#b87c10', window: '#bfd9d8', shape: 'truck'    },
}

// Brand badge color overrides the round "METAL" plate when the brand is famous
const BRAND_BADGES = {
    NISSAN:   { fg: '#cc0000', bg: '#f7ecd2' },
    CHEVY:    { fg: '#d4a022', bg: '#1a1a1a' },
    FORD:     { fg: '#0049b0', bg: '#f7ecd2' },
    DODGE:    { fg: '#c63027', bg: '#f7ecd2' },
    VOLVO:    { fg: '#0049b0', bg: '#f7ecd2' },
    PLYMOUTH: { fg: '#6e4a1f', bg: '#f7ecd2' },
    FIAT:     { fg: '#c63027', bg: '#f7ecd2' },
    IH:       { fg: '#cc0000', bg: '#f7ecd2' },
}

// Build a Matchbox-style blister-pack texture matching the real toy packaging:
// hanger tab, orange cardboard top, red MATCHBOX pill, road-trip side ribbon,
// numbered marker, green window with road + tree backdrop, toy car silhouette,
// white footer with car name.
function makeBlisterTexture(modelKey)
{
    const W = 384, H = 600
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')

    const model = CAR_MODELS[modelKey] || CAR_MODELS.nissan_pickup

    // ── Hanger tab (top) ────────────────────────────────────────────────────
    ctx.fillStyle = '#e8d59f'
    ctx.fillRect(W * 0.36, 0, W * 0.28, 38)
    // hanger hole
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(W / 2, 18, 9, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = 1
    ctx.stroke()

    // ── Orange/brown cardboard backer ──────────────────────────────────────
    const cardTop = 38
    const cardBot = H
    const grad = ctx.createLinearGradient(0, cardTop, 0, cardBot)
    grad.addColorStop(0,    '#c47538')
    grad.addColorStop(0.45, '#a85a26')
    grad.addColorStop(1,    '#8b4516')
    ctx.fillStyle = grad
    ctx.fillRect(0, cardTop, W, cardBot - cardTop)

    // grainy fibres
    for(let i = 0; i < 320; i++)
    {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,210,150,0.06)' : 'rgba(40,20,5,0.08)'
        ctx.fillRect(Math.random() * W, cardTop + Math.random() * (cardBot - cardTop), 2, 1)
    }

    // ── METAL · PARTS · PIECES · TOOL strip near hanger ────────────────────
    ctx.fillStyle = 'rgba(20,10,5,0.0)'
    ctx.font = '600 9px "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f7ecd2'
    ctx.fillText('METAL  ·  PARTS  ·  PIECES  ·  TOOL', W / 2, 56)

    // ── Brand badge top-left (Volvo / Chevy / Ford / Dodge / etc.) ─────────
    const badge = BRAND_BADGES[model.brand] || { fg: '#8b4516', bg: '#f7ecd2' }
    ctx.beginPath()
    ctx.arc(40, 90, 26, 0, Math.PI * 2)
    ctx.fillStyle = badge.bg
    ctx.fill()
    ctx.strokeStyle = '#8b4516'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = badge.fg
    ctx.font = '900 13px "Space Grotesk", sans-serif'
    ctx.fillText(model.brand, 40, 88)

    // ── Red MATCHBOX logo pill ─────────────────────────────────────────────
    const pillX = 78, pillY = 76, pillW = 240, pillH = 56
    ctx.fillStyle = '#d83a2f'
    roundRect(ctx, pillX, pillY, pillW, pillH, 12)
    ctx.fill()
    ctx.strokeStyle = '#f7ecd2'
    ctx.lineWidth = 4
    ctx.stroke()
    // gold underline
    ctx.fillStyle = '#f0c14b'
    ctx.fillRect(pillX + 16, pillY + pillH - 8, pillW - 32, 4)
    // wordmark
    ctx.fillStyle = '#f7ecd2'
    ctx.font = '900 36px "Space Grotesk", sans-serif'
    ctx.fillText('MATCHBOX', pillX + pillW / 2, pillY + pillH / 2 + 2)

    // ── Side ROAD TRIP ribbon (right edge) ─────────────────────────────────
    ctx.save()
    ctx.translate(W - 56, 200)
    ctx.fillStyle = '#d83a2f'
    ctx.fillRect(0, 0, 50, 110)
    // arrow notch on bottom
    ctx.beginPath()
    ctx.moveTo(0, 110); ctx.lineTo(25, 134); ctx.lineTo(50, 110)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#f7ecd2'
    ctx.font = '900 13px "Space Grotesk", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText('MBX', 25, 22)
    ctx.fillText('ROAD', 25, 50)
    ctx.fillText('TRIP', 25, 70)
    // small badge circle
    ctx.beginPath(); ctx.arc(25, 94, 11, 0, Math.PI * 2)
    ctx.fillStyle = '#f0c14b'; ctx.fill()
    ctx.restore()

    // ── Number marker (right side) ─────────────────────────────────────────
    ctx.fillStyle = '#f7ecd2'
    ctx.font = '900 16px "Space Grotesk", sans-serif'
    ctx.textAlign = 'center'
    const num = 1 + Math.abs(hashKey(modelKey + W) % 35)
    ctx.fillText(`${num}`,  W - 30, 360)
    ctx.fillText('—',       W - 30, 374)
    ctx.fillText('35',      W - 30, 390)

    // ── Green road-trip window backdrop ────────────────────────────────────
    const winX = 38, winY = 160, winW = W - 76 - 56, winH = 240
    const winGrad = ctx.createLinearGradient(0, winY, 0, winY + winH)
    winGrad.addColorStop(0,    '#bfd9c4')
    winGrad.addColorStop(0.5,  '#7fae73')
    winGrad.addColorStop(1,    '#4f7a3e')
    ctx.fillStyle = winGrad
    ctx.fillRect(winX, winY, winW, winH)
    // window outline
    ctx.strokeStyle = '#2a1d0a'
    ctx.lineWidth = 3
    ctx.strokeRect(winX, winY, winW, winH)

    // distant trees
    ctx.fillStyle = 'rgba(35, 60, 30, 0.85)'
    for(let i = 0; i < 12; i++)
    {
        const tx = winX + (i + 0.5) * (winW / 12) + (Math.random() - 0.5) * 6
        const th = 30 + Math.random() * 22
        const ty = winY + 80
        ctx.beginPath()
        ctx.moveTo(tx, ty + th)
        ctx.lineTo(tx + 10, ty)
        ctx.lineTo(tx + 20, ty + th)
        ctx.closePath(); ctx.fill()
    }
    // road curving across
    ctx.fillStyle = '#2a2a2a'
    ctx.beginPath()
    ctx.moveTo(winX,        winY + winH - 30)
    ctx.bezierCurveTo(winX + winW * 0.3, winY + winH - 90,
                      winX + winW * 0.65, winY + winH - 50,
                      winX + winW,        winY + winH - 20)
    ctx.lineTo(winX + winW, winY + winH)
    ctx.lineTo(winX,        winY + winH)
    ctx.closePath(); ctx.fill()
    // road centre line dashes
    ctx.fillStyle = '#f7ecd2'
    for(let i = 0; i < 8; i++)
    {
        const dx = winX + 20 + i * 30
        const dy = winY + winH - 26 - i * 6
        ctx.fillRect(dx, dy, 14, 3)
    }

    // ── Toy car drawn on top of the road, large + detailed ────────────────
    drawCar(ctx, winX + winW * 0.42, winY + winH - 60, model)

    // ── Blister bubble highlight (subtle gloss) ────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.ellipse(winX + winW / 2, winY + winH * 0.55, winW * 0.42, winH * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 2
    ctx.stroke()

    // ── White footer with car name ─────────────────────────────────────────
    const footerY = winY + winH + 12
    ctx.fillStyle = '#f7ecd2'
    ctx.fillRect(winX, footerY, winW, 40)
    ctx.fillStyle = '#1a1a1a'
    ctx.font = '900 18px "Space Grotesk", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(model.name, winX + winW / 2, footerY + 20)

    // ── Subtle drop-shadow band at bottom ──────────────────────────────────
    const bgrad = ctx.createLinearGradient(0, H - 60, 0, H)
    bgrad.addColorStop(0, 'rgba(0,0,0,0)')
    bgrad.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = bgrad
    ctx.fillRect(0, H - 60, W, 60)

    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    return tex
}

// Rounded-rect helper (canvas).
function roundRect(ctx, x, y, w, h, r)
{
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y,     x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x,     y + h, r)
    ctx.arcTo(x,     y + h, x,     y,     r)
    ctx.arcTo(x,     y,     x + w, y,     r)
    ctx.closePath()
}

// Deterministic key → small int
function hashKey(s)
{
    let h = 0
    for(let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
    return h
}

// Draw a stylized toy car silhouette at (cx, cy), branched by model.shape.
function drawCar(ctx, cx, cy, model)
{
    const carW = 150, carH = 70
    const x0 = cx - carW / 2, y0 = cy - carH
    const win = model.window || '#bfd9d8'

    ctx.save()
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.ellipse(cx, cy + 6, carW * 0.45, 7, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = model.body

    switch(model.shape)
    {
        case 'pickup':
            // cab + bed
            roundRect(ctx, x0 + 8,  y0 + 20, 60, 36, 6); ctx.fill()
            roundRect(ctx, x0 + 64, y0 + 30, 78, 26, 4); ctx.fill()
            ctx.fillStyle = win
            roundRect(ctx, x0 + 16, y0 + 26, 46, 18, 4); ctx.fill()
            ctx.fillStyle = model.accent
            ctx.fillRect(x0 + 8, y0 + 50, 134, 6)
            break

        case 'sports':
            // low + raked
            ctx.beginPath()
            ctx.moveTo(x0 + 6,   y0 + 56)
            ctx.lineTo(x0 + 26,  y0 + 26)
            ctx.lineTo(x0 + 100, y0 + 22)
            ctx.lineTo(x0 + 140, y0 + 32)
            ctx.lineTo(x0 + 146, y0 + 56)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = win
            ctx.beginPath()
            ctx.moveTo(x0 + 34, y0 + 32)
            ctx.lineTo(x0 + 56, y0 + 26)
            ctx.lineTo(x0 + 90, y0 + 26)
            ctx.lineTo(x0 + 96, y0 + 32)
            ctx.lineTo(x0 + 96, y0 + 40)
            ctx.lineTo(x0 + 34, y0 + 40)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = model.accent
            ctx.fillRect(x0 + 18, y0 + 50, 116, 4)
            break

        case 'truck':
            // wide + boxy
            roundRect(ctx, x0 + 4,   y0 + 16, 44, 40, 5); ctx.fill()
            roundRect(ctx, x0 + 48,  y0 + 24, 96, 32, 4); ctx.fill()
            ctx.fillStyle = win
            roundRect(ctx, x0 + 10, y0 + 22, 32, 18, 3); ctx.fill()
            ctx.fillStyle = model.accent
            ctx.fillRect(x0 + 4, y0 + 50, 140, 6)
            break

        case 'wagon':
            // long roofline with rear box
            ctx.beginPath()
            ctx.moveTo(x0 + 6,   y0 + 56)
            ctx.lineTo(x0 + 18,  y0 + 32)
            ctx.lineTo(x0 + 32,  y0 + 22)
            ctx.lineTo(x0 + 120, y0 + 22)
            ctx.lineTo(x0 + 140, y0 + 32)
            ctx.lineTo(x0 + 146, y0 + 56)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = win
            roundRect(ctx, x0 + 26, y0 + 28, 100, 16, 3); ctx.fill()
            // window divider (wagon middle pillar)
            ctx.fillStyle = model.body
            ctx.fillRect(x0 + 80, y0 + 28, 3, 16)
            ctx.fillStyle = model.accent
            ctx.fillRect(x0 + 12, y0 + 50, 128, 4)
            break

        case 'classic':
            // 1940s coupe — high curving fenders, separate cab
            ctx.beginPath()
            ctx.moveTo(x0 + 8,   y0 + 56)
            ctx.bezierCurveTo(x0 + 6,  y0 + 36, x0 + 30, y0 + 30, x0 + 50, y0 + 30)
            ctx.lineTo(x0 + 100, y0 + 30)
            ctx.bezierCurveTo(x0 + 122, y0 + 30, x0 + 144, y0 + 36, x0 + 142, y0 + 56)
            ctx.closePath(); ctx.fill()
            // domed roof
            ctx.beginPath()
            ctx.moveTo(x0 + 42, y0 + 30)
            ctx.bezierCurveTo(x0 + 50, y0 + 12, x0 + 100, y0 + 12, x0 + 108, y0 + 30)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = win
            ctx.beginPath()
            ctx.moveTo(x0 + 52, y0 + 28)
            ctx.bezierCurveTo(x0 + 58, y0 + 16, x0 + 96, y0 + 16, x0 + 102, y0 + 28)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = model.accent
            ctx.fillRect(x0 + 14, y0 + 50, 124, 4)
            // chrome grille
            ctx.fillStyle = '#cccccc'
            ctx.fillRect(x0 + carW - 18, y0 + 36, 12, 14)
            break

        case 'micro':
            // Fiat 500 — short + bubbly
            roundRect(ctx, x0 + 30, y0 + 20, 96, 36, 16); ctx.fill()
            ctx.fillStyle = win
            roundRect(ctx, x0 + 42, y0 + 24, 72, 18, 10); ctx.fill()
            ctx.fillStyle = model.accent
            ctx.fillRect(x0 + 30, y0 + 50, 96, 6)
            // visible canvas roof seam
            ctx.fillStyle = 'rgba(0,0,0,0.25)'
            ctx.fillRect(x0 + 78, y0 + 20, 2, 22)
            break

        default:   // sedan
            ctx.beginPath()
            ctx.moveTo(x0 + 6,   y0 + 56)
            ctx.lineTo(x0 + 22,  y0 + 32)
            ctx.lineTo(x0 + 38,  y0 + 24)
            ctx.lineTo(x0 + 108, y0 + 24)
            ctx.lineTo(x0 + 130, y0 + 32)
            ctx.lineTo(x0 + 144, y0 + 56)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = win
            ctx.beginPath()
            ctx.moveTo(x0 + 28, y0 + 32)
            ctx.lineTo(x0 + 44, y0 + 26)
            ctx.lineTo(x0 + 102, y0 + 26)
            ctx.lineTo(x0 + 118, y0 + 32)
            ctx.lineTo(x0 + 118, y0 + 44)
            ctx.lineTo(x0 + 28,  y0 + 44)
            ctx.closePath(); ctx.fill()
            ctx.fillStyle = model.accent
            ctx.fillRect(x0 + 14, y0 + 50, 124, 4)
    }

    // wheels (cream-on-black tire style)
    let wheelL = 28, wheelR = 122
    if(model.shape === 'micro')   { wheelL = 46; wheelR = 110 }
    if(model.shape === 'classic') { wheelL = 32; wheelR = 118 }
    for(const wx of [wheelL, wheelR])
    {
        ctx.fillStyle = '#1a1a1a'
        ctx.beginPath(); ctx.arc(x0 + wx, y0 + 58, 11, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#f7ecd2'
        ctx.beginPath(); ctx.arc(x0 + wx, y0 + 58, 5,  0, Math.PI * 2); ctx.fill()
    }

    // headlight
    ctx.fillStyle = '#fff5c2'
    ctx.beginPath(); ctx.arc(x0 + carW - 6, y0 + 44, 3, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
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

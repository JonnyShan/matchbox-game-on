import * as THREE from 'three'

// Direction-finder. Floats a glowing gold chevron above the player's car
// that always rotates to point at the nearest uncollected pickup.
// Also writes the distance into the CollectHUD if present.

const HOVER_HEIGHT  = 3.4   // m above the car
const ARROW_LEN     = 1.4   // m long
const PULSE_HZ      = 1.6

function buildArrow()
{
    const group = new THREE.Group()

    // Chevron made of cone (tip) + tapered box (tail)
    const tipGeo = new THREE.ConeGeometry(0.55, 0.9, 4)
    const tipMat = new THREE.MeshBasicMaterial({
        color:       0xffd76a,
        transparent: true,
        opacity:     1.0,
        depthWrite:  false,
    })
    const tip = new THREE.Mesh(tipGeo, tipMat)
    tip.rotation.z = -Math.PI / 2   // point along +X local
    tip.position.x = ARROW_LEN * 0.45
    group.add(tip)

    const tailGeo = new THREE.BoxGeometry(ARROW_LEN, 0.22, 0.22)
    const tailMat = new THREE.MeshBasicMaterial({
        color:       0xc78c1c,
        transparent: true,
        opacity:     1.0,
        depthWrite:  false,
    })
    const tail = new THREE.Mesh(tailGeo, tailMat)
    tail.position.x = -ARROW_LEN * 0.1
    group.add(tail)

    // Outline halo behind the chevron for visibility
    const haloGeo = new THREE.CircleGeometry(1.1, 24)
    const haloMat = new THREE.MeshBasicMaterial({
        color:       0xffd76a,
        transparent: true,
        opacity:     0.25,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
        side:        THREE.DoubleSide,
    })
    const halo = new THREE.Mesh(haloGeo, haloMat)
    halo.rotation.x = -Math.PI / 2   // lying flat below the chevron
    halo.position.z = -0.05
    group.add(halo)

    group.userData = { tip, tail, halo, tipMat, tailMat, haloMat }
    group.frustumCulled = false
    return group
}

export default class CollectArrow
{
    constructor(_options)
    {
        this.scene          = _options.scene
        this.physics        = _options.physics
        this.collectPickups = _options.collectPickups
        this.hud            = _options.hud || null

        this.group = buildArrow()
        this.scene.add(this.group)
        this._t = 0
        this._hidden = false
    }

    setHidden(hidden)
    {
        this._hidden = hidden
        this.group.visible = !hidden
    }

    // Lowest-cost active-pickup position lookup.
    _nearestPickup(carX, carY)
    {
        const items = this.collectPickups?._items
        if(!items || items.size === 0) return null
        let best = null
        let bestSq = Infinity
        for(const item of items.values())
        {
            const p = item.group.position
            const dx = p.x - carX
            const dy = p.y - carY
            const sq = dx * dx + dy * dy
            if(sq < bestSq) { bestSq = sq; best = { x: p.x, y: p.y, distSq: sq } }
        }
        return best
    }

    update(dt)
    {
        this._t += dt
        if(this._hidden) return

        const body = this.physics?.car?.chassis?.body
        if(!body) return

        const car = body.position
        const target = this._nearestPickup(car.x, car.y)

        if(!target)
        {
            // Nothing to point at — fade out
            this._setOpacity(0)
            this.hud?.setDistance?.(null)
            return
        }

        // Hover above the car, point in target direction
        const dx = target.x - car.x
        const dy = target.y - car.y
        const angle = Math.atan2(dy, dx)
        const dist  = Math.sqrt(target.distSq)

        // Bob vertically
        const bob = Math.sin(this._t * 0.0035) * 0.18

        this.group.position.set(car.x, car.y, car.z + HOVER_HEIGHT + bob)
        this.group.rotation.set(0, 0, angle)

        // Pulse opacity faster as we get closer (under 8m get-bright)
        const proximity = Math.max(0, Math.min(1, 1 - dist / 25))
        const pulse = 0.5 + 0.5 * Math.sin(this._t * 0.001 * Math.PI * 2 * PULSE_HZ)
        const op = 0.55 + 0.45 * pulse * (0.6 + 0.4 * proximity)
        this._setOpacity(op)

        // Scale halo with distance — bigger when far, tighter when near
        this.group.userData.halo.scale.setScalar(0.8 + Math.min(1.6, dist / 20))

        // Push distance to HUD if it wants it
        this.hud?.setDistance?.(dist)
    }

    _setOpacity(o)
    {
        const u = this.group.userData
        u.tipMat.opacity  = o
        u.tailMat.opacity = o
        u.haloMat.opacity = o * 0.35
    }

    destroy()
    {
        this.scene.remove(this.group)
    }
}

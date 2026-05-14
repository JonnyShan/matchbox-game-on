import * as THREE from 'three'

// Client-side mine visuals. The server is authoritative for placement,
// arming, trigger, and damage — we just render the puck, blink the LED,
// and play the explosion FX when the server broadcasts mineExplosion.

const PUCK_RADIUS = 0.55
const PUCK_HEIGHT = 0.18

function buildPuck(ownerColor)
{
    const group = new THREE.Group()

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(PUCK_RADIUS, PUCK_RADIUS, PUCK_HEIGHT, 14),
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
    )
    body.rotation.x = Math.PI / 2
    group.add(body)

    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(PUCK_RADIUS * 0.95, 0.05, 6, 24),
        new THREE.MeshBasicMaterial({ color: ownerColor }),
    )
    rim.position.z = PUCK_HEIGHT / 2 + 0.005
    group.add(rim)

    const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({
            color: 0xff2e4d, transparent: true, opacity: 0.95,
            blending: THREE.AdditiveBlending, depthWrite: false,
        }),
    )
    led.position.z = PUCK_HEIGHT / 2 + 0.08
    group.add(led)

    group.userData.led = led
    return group
}

export default class Mines
{
    constructor(_options)
    {
        this.scene   = _options.scene
        this.weapons = _options.weapons   // for explodeAt FX reuse

        this._mines = new Map()   // mineId → { mesh, ownerId, armedAt, exploded }
        this._t = 0
    }

    add(mineId, x, y, z, armedAt, ownerColorHex = 0xff2e4d)
    {
        if(this._mines.has(mineId)) return
        const mesh = buildPuck(ownerColorHex)
        mesh.position.set(x, y, z + PUCK_HEIGHT / 2)
        mesh.frustumCulled = false
        this.scene.add(mesh)
        this._mines.set(mineId, { mesh, armedAt, exploded: false })
    }

    explode(mineId, x, y, z)
    {
        const m = this._mines.get(mineId)
        if(m && !m.exploded)
        {
            m.exploded = true
            this.scene.remove(m.mesh)
            this._mines.delete(mineId)
        }
        // Reuse Weapons' explosion FX
        if(this.weapons?._explodeAt) this.weapons._explodeAt(x, y, z + 0.2)
    }

    expire(mineId)
    {
        const m = this._mines.get(mineId)
        if(!m) return
        this.scene.remove(m.mesh)
        this._mines.delete(mineId)
    }

    update(dt)
    {
        this._t += dt
        const now = Date.now()
        // Blink LED based on arming state
        for(const m of this._mines.values())
        {
            const led = m.mesh.userData.led
            if(!led) continue
            const armed = now >= m.armedAt
            const blinkHz = armed ? 5 : 1.6
            const op = 0.4 + 0.55 * (0.5 + 0.5 * Math.sin(this._t * blinkHz * 0.001 * Math.PI * 2))
            led.material.opacity = op
            led.material.color.setHex(armed ? 0xff2e4d : 0xffaa44)
        }
    }
}

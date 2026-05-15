import * as THREE from 'three'
import Materials from './Materials.js'
import Floor from './Floor.js'
import Shadows from './Shadows.js'
import Physics from './Physics.js'
import Objects from './Objects.js'
import Car from './Car.js'
import Areas from './Areas.js'
import Controls from './Controls.js'
import Sounds from './Sounds.js'
import RemoteCarManager from './RemoteCarManager.js'
import Minimap from './Minimap.js'
import Track from './Track.js'
import Arena, { ARENA_SPAWN_GRID } from './Arena.js'
import gsap from 'gsap'
import ControlsOverlay from '../ControlsOverlay.js'
import LapTimer from '../LapTimer.js'
import HUD from '../HUD.js'
import SkidMarks from './SkidMarks.js'
import Environment from './Environment.js'
import SmokeParticles from './SmokeParticles.js'
import BoostPads from './BoostPads.js'
import Weapons from './Weapons.js'
import HealthSystem from './HealthSystem.js'
import CombatPickups from './CombatPickups.js'
import HazardZones from './HazardZones.js'
import ArenaMinimap from './ArenaMinimap.js'
import { ARENA_PICKUPS } from './CombatPickups.js'
import Meteors from './Meteors.js'
import Mines from './Mines.js'
import Killfeed from './Killfeed.js'
import DamageNumbers from './DamageNumbers.js'
import CollectPickups from './CollectPickups.js'
import CollectHUD from './CollectHUD.js'
import { CAR_COLORS } from '../../../../shared/constants.js'

function escapeHtml(s)
{
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]))
}

export default class World
{
    constructor(_options)
    {
        this.config    = _options.config
        this.debug     = _options.debug
        this.resources = _options.resources
        this.time      = _options.time
        this.sizes     = _options.sizes
        this.camera    = _options.camera
        this.scene     = _options.scene
        this.renderer  = _options.renderer
        this.passes    = _options.passes
        this.network   = _options.network || null

        if(this.debug)
        {
            this.debugFolder = this.debug.addFolder('world')
            this.debugFolder.open()
        }

        this.container = new THREE.Object3D()
        this.container.matrixAutoUpdate = false

        this.setSounds()
        this.setControls()
        this.setFloor()
        this.setAreas()
        this.setRemoteCars()
        this.setStartingScreen()
    }

    // Called by Application when resources finish loading
    onResourcesReady()
    {
        this._resourcesReady = true
        this._tryStart()
    }

    // Called by Application (via LobbyUI callback) when solo mode lobby is submitted
    onSoloJoin()
    {
        this._playerJoined = true
        this._tryStart()
    }

    start()
    {
        window.setTimeout(() => { this.camera.pan.enable() }, 2000)

        // Mode flags — 'race' | 'combat' | 'collect'
        const mode    = this.config.gameMode || 'race'
        const race    = mode === 'race'
        const combat  = mode === 'combat'
        const collect = mode === 'collect'

        this.setReveal()
        this.setMaterials()
        this.setShadows()
        this.setPhysics()

        // Race uses the racetrack; Combat + Collect use the dedicated arena
        if(combat || collect) this.setArena()
        else                  this.setTrack()

        if(this.network) this._setupSnapshotSender()
        if(this.network) this._setupBumpHandling()
        this.setObjects()
        this.setCar()
        this.areas.car = this.car
        this._setupYouLabel()

        // Race uses the camera-following racetrack minimap;
        // Combat gets a fixed-view arena minimap (created later in setCombat)
        if(race) this.setMinimap()

        if(race)
        {
            this.setLapTimer()
            this.setSectorMarkers()
            this.setHUD()
            this._setupOffTrackDetection()
            this._setupWrongWayDetection()
            this._setupRaceEnd()
        }

        this.setSkidMarks()
        this.setSmokeParticles()

        // Boost pads are a racing element — only spawn them when there's a track
        if(race) this.setBoostPads()

        this.setEnvironment()
        this._setupRespawnFeedback()
        this._setupMuteButton()
        this._setupCameraEffects()
        this._setupJump()

        if(combat)
        {
            this.setCombat()
            this._setupCombatEnd()
        }

        if(collect)
        {
            this.setCollect()
        }
    }

    setCollect()
    {
        this._matchStartAt = Date.now()

        // Use server's pickup layout from room:joined
        this.collectPickups = new CollectPickups({
            scene:   this.scene,
            network: this.network,
        })

        // Pull initial state and spawn pickups
        const onState = (data) =>
        {
            const state = data.collectState
            if(state) this.collectPickups.spawnFromState(state)
            if(state?.matchEndAt) this._collectMatchEnd = state.matchEndAt
        }
        if(this._joinSnapshot) onState(this._joinSnapshot)
        else if(this.network) this.network.on('room:joined', onState)

        // HUD elements
        this._buildCollectHUD()
        // Top-right slots + bottom-center minimap & compass arrow
        this.collectHUD = new CollectHUD({
            network:        this.network,
            physics:        this.physics,
            collectPickups: this.collectPickups,
        })

        // Track my collected count for HUD
        this._myCollects = 0
        if(this.network)
        {
            this.network.on('collect:pickup', ({ byId, score, completed, byName }) =>
            {
                if(byId === this.network.localId)
                {
                    this._myCollects = score
                    this._flashCollect('+1', '#f0c14b')
                }
                else
                {
                    this._flashCollect(`${byName} grabbed one`, '#9e9e9e')
                }
                this._updateCollectHUD()
            })

            this.network.on('collect:finished', ({ winnerId, winnerName, reason, scores }) =>
            {
                this._showCollectComplete({
                    youWon:  winnerId === this.network.localId,
                    winner:  winnerName,
                    reason,
                    scores,
                })
            })
        }

        // Tick updates
        this.time.on('tick', () =>
        {
            const dt = Math.min(this.time.delta, 60)
            this.collectPickups.update(dt)
            this.collectHUD?.updateMinimap()
            this._updateCollectTimer()
        })
    }

    _buildCollectHUD()
    {
        const $hud = document.createElement('div')
        $hud.id = 'collect-hud'
        $hud.style.cssText = `
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 8px 18px;
            font-family: 'Space Grotesk', monospace;
            background: linear-gradient(180deg, #d83a2f 0%, #b02a22 100%);
            color: #f7ecd2;
            border: 2px solid #f0c14b;
            border-radius: 8px;
            z-index: 600;
            box-shadow: 0 4px 18px rgba(0,0,0,0.45);
            letter-spacing: 1px;
        `
        $hud.innerHTML = `
            <span style="font-size:10px;font-weight:700;letter-spacing:3px;opacity:0.85">MATCHBOX</span>
            <span id="collect-timer" style="font-size:24px;font-weight:900;min-width:60px;text-align:center">1:00</span>
            <span style="font-size:22px;font-weight:900">·</span>
            <span id="collect-count" style="font-size:18px;font-weight:700;letter-spacing:1px">0 / 10</span>
        `
        document.body.appendChild($hud)
        this._$collectHud = $hud

        const $flash = document.createElement('div')
        $flash.id = 'collect-flash'
        $flash.style.cssText = `
            position: fixed;
            top: 70px;
            left: 50%;
            transform: translateX(-50%);
            font-family: 'Space Grotesk', monospace;
            font-weight: 900;
            font-size: 28px;
            color: #f0c14b;
            text-shadow: 0 0 16px rgba(240,193,75,0.7), 0 2px 4px rgba(0,0,0,0.6);
            z-index: 600;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s, transform 0.3s;
        `
        document.body.appendChild($flash)
        this._$collectFlash = $flash
    }

    _flashCollect(text, color)
    {
        if(!this._$collectFlash) return
        this._$collectFlash.textContent = text
        this._$collectFlash.style.color = color
        this._$collectFlash.style.opacity = '1'
        this._$collectFlash.style.transform = 'translateX(-50%) translateY(0)'
        clearTimeout(this._collectFlashTimer)
        this._collectFlashTimer = setTimeout(() =>
        {
            this._$collectFlash.style.opacity = '0'
            this._$collectFlash.style.transform = 'translateX(-50%) translateY(-12px)'
        }, 1200)
    }

    _updateCollectHUD()
    {
        const $c = document.getElementById('collect-count')
        if($c) $c.textContent = `${this._myCollects} / 10`
    }

    _updateCollectTimer()
    {
        if(!this._collectMatchEnd) return
        const ms = Math.max(0, this._collectMatchEnd - Date.now() - (this.network?.serverTimeOffset || 0))
        const s  = Math.floor(ms / 1000)
        const $t = document.getElementById('collect-timer')
        if($t)
        {
            const mm = Math.floor(s / 60)
            const ss = String(s % 60).padStart(2, '0')
            $t.textContent = `${mm}:${ss}`
            if(s <= 10) $t.style.color = '#ffe066'
        }
    }

    _showCollectComplete({ youWon, winner, reason, scores })
    {
        const $screen   = document.getElementById('loading-screen')
        const $loading  = document.getElementById('mb-loading-overlay')
        const $result   = document.getElementById('mb-result-overlay')
        const $eyebrow  = document.getElementById('mb-result-eyebrow')
        const $score    = document.getElementById('mb-result-score')
        const $time     = document.getElementById('mb-result-time')
        const $lb       = document.getElementById('mb-result-leaderboard')
        const $btn      = document.getElementById('mb-result-btn')
        if(!$screen || !$result) return

        const localId   = this.network?.localId
        const me        = scores?.find(s => s.id === localId)
        const myCount   = me?.count ?? this._myCollects ?? 0
        const elapsedMs = me?.finishAt && this._matchStartAt
            ? me.finishAt - this._matchStartAt
            : (Date.now() - (this._matchStartAt || Date.now()))
        const seconds   = Math.max(0, elapsedMs / 1000).toFixed(1)

        if($eyebrow)
        {
            if(youWon)                  $eyebrow.textContent = 'COLLECTION COMPLETE'
            else if(reason === 'timer') $eyebrow.textContent = 'TIME UP'
            else                        $eyebrow.textContent = 'GAME OVER'
        }
        if($score) $score.textContent = `${myCount} / 10`
        if($time)
        {
            if(youWon) $time.textContent = `in ${seconds}s — Mighty Ace Adventure Edition unlocked`
            else       $time.textContent = `Winner: ${winner || '???'}`
        }

        // Leaderboard — sort by count desc, then earliest finishAt asc
        if($lb && Array.isArray(scores))
        {
            const sorted = [...scores].sort((a, b) =>
            {
                if(b.count !== a.count) return b.count - a.count
                const af = a.finishAt ?? Infinity
                const bf = b.finishAt ?? Infinity
                return af - bf
            })
            $lb.innerHTML = ''
            const matchStart = this._matchStartAt || Date.now()
            sorted.forEach((s, idx) =>
            {
                const li = document.createElement('li')
                const isMe = s.id === localId
                const isWinner = idx === 0
                if(isMe)     li.classList.add('me')
                if(isWinner) li.classList.add('winner')

                const rank   = document.createElement('span')
                const name   = document.createElement('span')
                const count  = document.createElement('span')
                const time   = document.createElement('span')
                rank.className  = 'lb-rank'
                name.className  = 'lb-name'
                count.className = 'lb-count'
                time.className  = 'lb-time'

                rank.textContent  = idx === 0 ? '🏆' : `#${idx + 1}`
                name.textContent  = `${s.name || '???'}${isMe ? ' (you)' : ''}`
                count.textContent = `${s.count}/10`
                if(s.finishAt)
                {
                    const t = Math.max(0, (s.finishAt - matchStart) / 1000)
                    time.textContent = `${t.toFixed(1)}s`
                }
                else
                {
                    time.textContent = '—'
                }

                li.appendChild(rank)
                li.appendChild(name)
                li.appendChild(count)
                li.appendChild(time)
                $lb.appendChild(li)
            })
        }

        if($btn) $btn.onclick = () => window.location.reload()

        // Name input: pre-fill from saved name + repaint leaderboard live as user types
        const $nameInput = document.getElementById('mb-result-name')
        if($nameInput)
        {
            const initialName = this.network?.localPlayerName || localStorage.getItem('mb:playerName') || ''
            $nameInput.value = initialName
            $nameInput.oninput = () =>
            {
                const v = $nameInput.value.trim()
                if(v) localStorage.setItem('mb:playerName', v)
                const $row = $lb?.querySelector('li.me .lb-name')
                if($row) $row.textContent = `${v || initialName || '???'} (you)`
            }
        }

        if($loading) $loading.style.display = 'none'
        $result.classList.add('visible')
        $screen.classList.add('is-result')
        $screen.style.display = 'flex'
        $screen.style.opacity = '0'
        requestAnimationFrame(() =>
        {
            $screen.style.transition = 'opacity 0.6s'
            $screen.style.opacity = '1'
        })
    }

    setReveal()
    {
        this.reveal = {}
        this.reveal.matcapsProgress = 0
        this.reveal.floorShadowsProgress = 0
        this.reveal.previousMatcapsProgress = null
        this.reveal.previousFloorShadowsProgress = null

        this.reveal.go = () =>
        {
            gsap.fromTo(this.reveal, { matcapsProgress: 0 }, { matcapsProgress: 1, duration: 3 })
            gsap.fromTo(this.reveal, { floorShadowsProgress: 0 }, { floorShadowsProgress: 1, duration: 3, delay: 0.5 })
            gsap.fromTo(this.shadows, { alpha: 0 }, { alpha: 0.5, duration: 3, delay: 0.5 })

            const spawn = this._serverSpawnPos || { x: 5, y: -35 }
            this.physics.car.chassis.body.sleep()
            this.physics.car.chassis.body.position.set(spawn.x, spawn.y, 12)
            this.physics.car.chassis.body.quaternion.set(0, 0, 0, 1)

            window.setTimeout(() =>
            {
                this.physics.car.chassis.body.wakeUp()
                if(this.network) this.network.playerReady()
            }, 300)

            gsap.fromTo(this.sounds.engine.volume, { master: 0 }, { master: 0.7, duration: 0.5, delay: 0.3, ease: 'power2.in' })
            window.setTimeout(() => { this.sounds.play('reveal') }, 400)

            if(this.controls.touch)
            {
                window.setTimeout(() => { this.controls.touch.reveal() }, 400)
            }

            if(!this.controls.touch)
            {
                const overlay = new ControlsOverlay()
                window.setTimeout(() => overlay.show(), 1500)
            }

            // Start lights then start lap timer
            window.setTimeout(() => this._showCountdown(), 800)
        }

        this.time.on('tick', () =>
        {
            if(this.reveal.matcapsProgress !== this.reveal.previousMatcapsProgress)
            {
                for(const _materialKey in this.materials.shades.items)
                {
                    this.materials.shades.items[_materialKey].uniforms.uRevealProgress.value = this.reveal.matcapsProgress
                }
                this.reveal.previousMatcapsProgress = this.reveal.matcapsProgress
            }

            if(this.reveal.floorShadowsProgress !== this.reveal.previousFloorShadowsProgress)
            {
                for(const _mesh of this.objects.floorShadows)
                {
                    _mesh.material.uniforms.uAlpha.value = this.reveal.floorShadowsProgress
                }
                this.reveal.previousFloorShadowsProgress = this.reveal.floorShadowsProgress
            }
        })
    }

    setStartingScreen()
    {
        this._resourcesReady = false
        this._playerJoined   = false

        // In solo mode, resources ready is the only gate (player "joins" via lobby submit)
        // In multiplayer, we also wait for room:joined (handled in setRemoteCars)

        this._tryStart = () =>
        {
            if(!this._resourcesReady || !this._playerJoined) return
            this._tryStart = () => {}  // prevent double-start
            this.start()
            window.setTimeout(() => { this.reveal.go() }, 600)
        }
    }

    setSounds()
    {
        this.sounds = new Sounds({ debug: this.debugFolder, time: this.time })
    }

    setControls()
    {
        this.controls = new Controls({
            config: this.config,
            sizes:  this.sizes,
            time:   this.time,
            camera: this.camera,
            sounds: this.sounds
        })
    }

    setMaterials()
    {
        this.materials = new Materials({ resources: this.resources, debug: this.debugFolder })
    }

    setFloor()
    {
        this.floor = new Floor({ debug: this.debugFolder })
        this.container.add(this.floor.container)
    }

    setShadows()
    {
        this.shadows = new Shadows({
            time:     this.time,
            debug:    this.debugFolder,
            renderer: this.renderer,
            camera:   this.camera
        })
        this.container.add(this.shadows.container)
    }

    setPhysics()
    {
        this.physics = new Physics({
            config:   this.config,
            debug:    this.debug,
            scene:    this.scene,
            time:     this.time,
            sizes:    this.sizes,
            controls: this.controls,
            sounds:   this.sounds
        })
        this.container.add(this.physics.models.container)
    }

    setObjects()
    {
        this.objects = new Objects({
            time:      this.time,
            resources: this.resources,
            materials: this.materials,
            physics:   this.physics,
            shadows:   this.shadows,
            sounds:    this.sounds,
            debug:     this.debugFolder
        })
        this.container.add(this.objects.container)
    }

    setCar()
    {
        this.car = new Car({
            time:      this.time,
            resources: this.resources,
            objects:   this.objects,
            physics:   this.physics,
            shadows:   this.shadows,
            materials: this.materials,
            controls:  this.controls,
            sounds:    this.sounds,
            renderer:  this.renderer,
            camera:    this.camera,
            debug:     this.debugFolder,
            config:    this.config,
            carColor:  this.config.carColor ?? 0
        })
        this.container.add(this.car.container)
    }

    setAreas()
    {
        this.areas = new Areas({
            config:    this.config,
            resources: this.resources,
            debug:     this.debug,
            renderer:  this.renderer,
            camera:    this.camera,
            car:       this.car,
            sounds:    this.sounds,
            time:      this.time
        })
        this.container.add(this.areas.container)
    }

    setTrack()
    {
        this.track = new Track({
            world:         this.physics.world,
            floorMaterial: this.physics.materials.items.floor,
            resources:     this.resources,
        })
        this.container.add(this.track.container)
    }

    setArena()
    {
        this.arena = new Arena({
            world:         this.physics.world,
            floorMaterial: this.physics.materials.items.floor,
            resources:     this.resources,
        })
        this.container.add(this.arena.container)

        // Use arena spawn grid for combat; spreads players around the south side
        const slot = (this._serverSpawnPos?._index ?? 0) % ARENA_SPAWN_GRID.length
        this._serverSpawnPos = ARENA_SPAWN_GRID[slot]
    }

    setLapTimer()
    {
        this.lapTimer = new LapTimer()

        if(this.track?.gateOrigin && this.track?.gateDir)
        {
            this.lapTimer.setGate(this.track.gateOrigin, this.track.gateDir)
        }

        // Add two sector checkpoints at ~33% and ~67% of the centerline
        const center = this.track?.centerPath
        if(center && center.length >= 3)
        {
            const N = center.length

            // Sector 1 gate: ~33% mark
            const i1    = Math.floor(N * 0.33)
            const prev1 = center[(i1 - 1 + N) % N]
            const next1 = center[(i1 + 1) % N]
            const dx1   = next1.x - prev1.x
            const dy1   = next1.y - prev1.y
            const l1    = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1
            this.lapTimer.addSector({ x: center[i1].x, y: center[i1].y }, { x: dx1 / l1, y: dy1 / l1 })

            // Sector 2 gate: ~67% mark
            const i2    = Math.floor(N * 0.67)
            const prev2 = center[(i2 - 1 + N) % N]
            const next2 = center[(i2 + 1) % N]
            const dx2   = next2.x - prev2.x
            const dy2   = next2.y - prev2.y
            const l2    = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1
            this.lapTimer.addSector({ x: center[i2].x, y: center[i2].y }, { x: dx2 / l2, y: dy2 / l2 })
        }

        this.lapTimer.on('sector', () =>
        {
            this.sounds?.play('uiArea', 0)
        })

        this.time.on('tick', () =>
        {
            if(this.physics && this.lapTimer._active)
            {
                this.lapTimer.tick(this.physics.car.chassis.body)
            }
        })
    }

    setSectorMarkers()
    {
        const gates = this.lapTimer?._sectorGates
        if(!gates?.length) return

        const COLORS = [0xff6600, 0x0066ff]
        const R      = 8.0   // distance from centerline to cone (just outside track wall)
        const H      = 1.4   // cone height
        const GEO    = new THREE.ConeGeometry(0.38, H, 6)

        gates.forEach((gate, i) =>
        {
            const { x, y } = gate.origin
            const { x: dx, y: dy } = gate.dir
            // Perpendicular direction (left of travel)
            const px = -dy, py = dx

            const mat = new THREE.MeshBasicMaterial({ color: COLORS[i] })

            for(const sign of [-1, 1])
            {
                const mesh = new THREE.Mesh(GEO, mat)
                mesh.position.set(x + px * R * sign, y + py * R * sign, H / 2)
                mesh.rotation.x = Math.PI / 2
                mesh.matrixAutoUpdate = false
                mesh.updateMatrix()
                this.container.add(mesh)
            }
        })
    }

    setHUD()
    {
        this.hud = new HUD({
            lapTimer: this.lapTimer,
            physics:  this.physics,
        })

        this.time.on('tick', () =>
        {
            if(this.hud && this.lapTimer._active)
            {
                this.hud.update()
            }
        })
    }

    setMinimap()
    {
        const $map = document.getElementById('mp-minimap')
        if($map) $map.style.display = 'block'

        this.minimap = new Minimap({
            physics:          this.physics,
            remoteCarManager: this.remoteCarManager || null,
            network:          this.network,
            localCarColor:    this.config.carColor ?? 0,
            trackOuter:       this.track?.outerPath  || null,
            trackInner:       this.track?.innerPath  || null,
            centerPath:       this.track?.centerPath || null,
        })

        this.time.on('tick', () => { this.minimap.update() })
    }

    setRemoteCars()
    {
        if(!this.network) return

        this.controls.network = this.network

        this._serverSpawnPos = null
        this.network.on('room:joined', (data) =>
        {
            this._serverSpawnPos = data.spawnPos
            this._joinSnapshot   = data        // includes collectState for collect mode
            if(data.collectState?.matchEndAt) this._collectMatchEnd = data.collectState.matchEndAt
            this._playerJoined = true
            this._tryStart?.()
        })

        this.remoteCarManager = new RemoteCarManager({
            scene:           this.scene,
            resources:       this.resources,
            network:         this.network,
            camera:          this.camera,
            sizes:           this.sizes,
            getPhysicsWorld: () => this.physics?.world,
        })

        this.time.on('tick', () => { this.remoteCarManager.update() })
    }

    _setupSnapshotSender()
    {
        let _lastSend = 0
        this.time.on('tick', () =>
        {
            if(!this.network || !this.physics) return
            const now = Date.now()
            if(now - _lastSend < 50) return
            _lastSend = now

            const body  = this.physics.car.chassis.body
            const infos = this.physics.car.vehicle.wheelInfos

            const wheels = infos.map(w => ({
                pos:  [w.worldTransform.position.x,   w.worldTransform.position.y,   w.worldTransform.position.z],
                quat: [w.worldTransform.quaternion.x, w.worldTransform.quaternion.y, w.worldTransform.quaternion.z, w.worldTransform.quaternion.w],
            }))

            this.network.sendSnapshot({
                pos:    [body.position.x,        body.position.y,        body.position.z],
                quat:   [body.quaternion.x,      body.quaternion.y,      body.quaternion.z,      body.quaternion.w],
                vel:    [body.velocity.x,        body.velocity.y,        body.velocity.z],
                angVel: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z],
                wheels,
            })
        })
    }

    _setupBumpHandling()
    {
        this.physics.car.onBump = (targetId, fromPos) =>
        {
            this.network.sendBump(targetId, fromPos)
            this._shakeCamera()
        }

        this.network.on('player:bumped', ({ fromPos }) =>
        {
            this.physics.car.receiveBump(fromPos)
            this.sounds.play('carHit', 10)
            this._shakeCamera()
        })
    }

    _shakeCamera(intensity = 0.5)
    {
        const canvas = document.querySelector('canvas')
        if(!canvas) return
        const i = Math.max(0, Math.min(1.5, intensity))
        const range = 10 + i * 16    // 10px → 34px
        const rot   = 0.6 + i * 0.9  // 0.6deg → 2.1deg
        const dur   = 0.25 + i * 0.15
        canvas.style.transition = 'none'
        canvas.style.transform  = `translate(${(Math.random() - 0.5) * range}px, ${(Math.random() - 0.5) * range}px) rotate(${(Math.random() - 0.5) * rot}deg)`
        requestAnimationFrame(() =>
        {
            canvas.style.transition = `transform ${dur}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`
            canvas.style.transform  = 'translate(0, 0) rotate(0deg)'
        })
    }

    _lookupRemoteColor(socketId)
    {
        // Remote car colors are stored on RemoteCar instances after player:joined
        const rc = this.remoteCarManager?.cars?.get(socketId)
        return rc?.carColor ?? 0
    }

    _setupYouLabel()
    {
        const $you = document.getElementById('mp-you')
        if(!$you) return

        $you.textContent   = this.network?.localPlayerName || this.config.playerName || 'YOU'
        $you.style.display = 'block'

        this.time.on('tick', () =>
        {
            if(!this.car?.chassis?.object) return

            const worldPos = this.car.chassis.object.position.clone()
            worldPos.z    += 1.5
            const projected = worldPos.project(this.camera.instance)

            if(projected.z > 1) { $you.style.display = 'none'; return }

            const x = (projected.x *  0.5 + 0.5) * this.sizes.viewport.width
            const y = (projected.y * -0.5 + 0.5) * this.sizes.viewport.height
            $you.style.display = 'block'
            $you.style.left    = `${x}px`
            $you.style.top     = `${y}px`
        })
    }

    setSkidMarks()
    {
        this.skidMarks = new SkidMarks({ physics: this.physics })
        this.container.add(this.skidMarks.container)
        this.time.on('tick', () =>
        {
            this.skidMarks.update()
            if(this.skidMarks.skidding && this.lapTimer?._active)
                this.sounds.play('screech', 0)
        })
    }

    setSmokeParticles()
    {
        this.smokeParticles = new SmokeParticles({ physics: this.physics, time: this.time })
        this.scene.add(this.smokeParticles.container)
        this.time.on('tick', () => { this.smokeParticles.update() })
    }

    setBoostPads()
    {
        const $boostFlash = document.getElementById('boost-flash')

        this.boostPads = new BoostPads({
            physics:  this.physics,
            time:     this.time,
            onBoost:  () =>
            {
                this.hud?.showBoost()
                if($boostFlash)
                {
                    $boostFlash.style.animation = 'none'
                    void $boostFlash.offsetWidth
                    $boostFlash.style.animation = 'boost-flash 0.6s ease-out forwards'
                }
            },
        })
        this.container.add(this.boostPads.container)
        this.time.on('tick', () => { this.boostPads.update() })
        if(this.minimap) this.minimap.boostPads = this.boostPads._pads.map(p => ({ x: p.x, y: p.y }))
    }

    _setupRespawnFeedback()
    {
        const $flash = document.getElementById('respawn-flash')

        this.controls.on('action', (name) =>
        {
            if(name !== 'reset' || !$flash) return
            $flash.style.animation = 'none'
            void $flash.offsetWidth
            $flash.style.animation = 'respawn-flash 0.5s ease-out forwards'
            this._shakeCamera()
        })
    }

    // Big arcade jump on Space — only fires when grounded; 600ms cooldown
    _setupJump()
    {
        const COOLDOWN_MS = 600
        const STRENGTH    = 375     // peak ~3.3m (halved again from ~6.5m)

        let lastJumpAt = 0

        this.controls.on('action', (name) =>
        {
            if(name !== 'jump') return
            if(this.healthSystem?.isDead?.()) return

            const now = Date.now()
            if(now - lastJumpAt < COOLDOWN_MS) return

            const body = this.physics?.car?.chassis?.body
            if(!body) return

            // Grounded check — small vertical speed AND low body z means
            // the car is sitting on some surface (floor, plateau, ramp, deck).
            // legacy cannon.js wheelInfo doesn't expose isInContact reliably,
            // so we infer ground contact from body kinematics instead.
            const vz       = body.velocity.z
            const z        = body.position.z
            const grounded = Math.abs(vz) < 4 && z < 3.5
            if(!grounded) return

            this.physics.car.jump(false, STRENGTH)
            lastJumpAt = now
            this.sounds?.play('uiArea', 0)
        })
    }

    setEnvironment()
    {
        this.environment = new Environment({
            resources: this.resources,
            renderer:  this.renderer,
            gameMode:  this.config.gameMode || 'arcade',
        })
        this.container.add(this.environment.container)
    }

    _setupCameraEffects()
    {
        const FOV_BASE  = 40
        const FOV_MAX   = 58
        const FOV_EASE  = 0.05

        let fovCurrent  = FOV_BASE

        const LOOK_MAX  = 4.0   // max look-ahead offset (world units)
        const LOOK_EASE = 0.07

        let lx = 0, ly = 0     // current eased look-ahead offset

        this.time.on('tick', () =>
        {
            if(!this.car?.chassis?.object) return

            const carPos = this.car.chassis.object.position

            // Speed-based FOV
            const vel   = this.physics.car.chassis.body.velocity
            const speed = Math.sqrt(vel.x ** 2 + vel.y ** 2)
            const norm  = Math.min(speed / 22, 1)

            fovCurrent += (THREE.MathUtils.lerp(FOV_BASE, FOV_MAX, norm) - fovCurrent) * FOV_EASE
            this.camera.instance.fov = fovCurrent
            this.camera.instance.updateProjectionMatrix()

            // Steering look-ahead: project a bit in the car's lateral direction
            const quat  = this.physics.car.chassis.body.quaternion
            const hx    =  1 - 2 * (quat.y * quat.y + quat.z * quat.z)
            const hy    =  2 * (quat.x * quat.y + quat.z * quat.w)
            // Car's right direction: (hy, -hx) in XY plane
            const steer = (this.controls.actions.right ? 1 : 0) - (this.controls.actions.left ? 1 : 0)
            const ahead = norm * steer * LOOK_MAX

            const txTarget = carPos.x + hy  * ahead
            const tyTarget = carPos.y - hx  * ahead

            lx += (txTarget - lx) * LOOK_EASE
            ly += (tyTarget - ly) * LOOK_EASE

            this.camera.target.x = lx
            this.camera.target.y = ly
        })
    }

    // ── Combat (Twisted Metal mode) ──────────────────────────────────────────

    setCombat()
    {
        // ── Weapon system (visual + remote spawn only; server validates all hits) ──
        this.weapons = new Weapons({
            scene:            this.scene,
            physics:          this.physics,
            centerPath:       this.track?.centerPath || [],
            remoteCarManager: this.remoteCarManager || null,
            onFire: () =>
            {
                this.sounds?.play('carHit', 12)
            },
            onFired: (x, y, z, dx, dy) =>
            {
                if(this.network) this.network.sendMissileFired(x, y, z, dx, dy)
            },
        })

        // ── Mines (visual + drop intent; server resolves everything) ──
        this.mines = new Mines({ scene: this.scene, weapons: this.weapons })

        // ── Killfeed + floating damage numbers ──
        this.killfeed      = new Killfeed({ network: this.network })
        this.damageNumbers = new DamageNumbers({ scene: this.scene, network: this.network })

        // ── Receive remote missiles, mines, explosions, deaths ──
        if(this.network)
        {
            // Spawn visual missile from server broadcast — both local AND remote use this
            // path so the missile we see is the one the server is actually simulating
            this.network.on('combat:missile', ({ fromId, x, y, z, dx, dy }) =>
            {
                if(fromId === this.network.localId) return  // local fire already spawned its own visual
                this.weapons.spawnRemoteMissile(x, y, z, dx, dy)
            })

            this.network.on('combat:explosion', ({ x, y, z }) =>
            {
                this.weapons._explodeAt(x, y, z)
            })

            this.network.on('combat:carDestroyed', ({ fromId, x, y, z, vx, vy, color }) =>
            {
                this._destroyRemoteCar(fromId, x, y, z, vx, vy, color)
            })

            // Mines
            this.network.on('combat:mineDropped', ({ mineId, fromId, x, y, z, armedAt }) =>
            {
                const colorIdx = this._lookupRemoteColor(fromId)
                const hex = parseInt((CAR_COLORS[colorIdx] || '#ff2e4d').slice(1), 16)
                this.mines.add(mineId, x, y, z, armedAt, hex)
            })

            this.network.on('combat:mineExplosion', ({ mineId, x, y, z }) =>
            {
                this.mines.explode(mineId, x, y, z)
                this._shakeCamera()
            })

            this.network.on('combat:mineExpired', ({ mineId }) =>
            {
                this.mines.expire(mineId)
            })
        }

        // ── Health system (presentational — listens to server events) ──
        this.healthSystem = new HealthSystem({
            physics:  this.physics,
            network:  this.network,
            spawnPos: this._serverSpawnPos || { x: 5, y: -35 },
        })

        // ── Pickups ──
        this.combatPickups = new CombatPickups({
            scene:   this.scene,
            physics: this.physics,
            layout:  (this.config.gameMode === 'combat') ? 'arena' : 'track',   // combat = arena pickups; race never gets here
            onCollect: ({ type, value }) =>
            {
                if(type === 'ammo')
                {
                    this.weapons.addAmmo(value)
                    this._showCombatPickup(`+${value} AMMO`, '#ff8800')
                }
                if(type === 'health')
                {
                    this.healthSystem.heal(value)
                    this._showCombatPickup(`+${value} HP`, '#2ecc71')
                }
                this.sounds?.play('uiArea', 0)
                this._updateCombatHUD()
            },
        })

        // ── Controls: F key fires, B key drops mine ──
        this.controls.on('action', (name) =>
        {
            if(name === 'fire')
            {
                if(this.healthSystem?.isInvulnerable?.())
                {
                    this._showCombatPickup('SPAWN INVULN — CAN\'T FIRE', '#888')
                    return
                }
                const ok = this.weapons.fire()
                if(!ok && this.weapons.ammo <= 0)
                    this._showCombatPickup('NO AMMO', '#e74c3c')
                if(ok) this._updateCombatHUD()
            }
            else if(name === 'mine')
            {
                if(this.healthSystem?.isInvulnerable?.() || this.healthSystem?.isDead?.()) return
                const body = this.physics.car.chassis.body
                if(!body) return
                // Drop slightly behind the car along its -X local axis (which is rear in body frame)
                const q = body.quaternion
                const hx = 1 - 2 * (q.y * q.y + q.z * q.z)
                const hy = 2 * (q.x * q.y + q.z * q.w)
                const len = Math.sqrt(hx * hx + hy * hy) || 1
                const dx = -hx / len, dy = -hy / len
                const px = body.position.x + dx * 1.6
                const py = body.position.y + dy * 1.6
                if(this.network) this.network.sendMineDrop(px, py, 0.1)
                this.sounds?.play('uiArea', 0)
            }
        })

        // ── Health events (driven by server combat:hp/death/respawn) ──
        this.healthSystem.on('damage', ({ hp, amount }) =>
        {
            this._updateCombatHUD()
            // Camera shake scales with damage taken
            const intensity = Math.min(1, amount / 50)
            this._shakeCamera(intensity)
            this._flashDamage()
        })

        this.healthSystem.on('healed', () => { this._updateCombatHUD() })

        this.healthSystem.on('death', ({ killerName, source }) =>
        {
            this._updateCombatHUD()
            this._destroyLocalCar()

            const $ov = document.getElementById('death-overlay')
            if($ov) $ov.classList.add('visible')
            const $sub   = document.getElementById('death-sub')
            const $timer = document.getElementById('death-timer')
            // Heavier shake on death
            this._shakeCamera(1.0)
            setTimeout(() => this._shakeCamera(0.6), 80)
            // Show killer attribution
            if($sub && killerName)
            {
                const icon = source === 'mine' ? '💣' : source === 'meteor' ? '☄️' : '🚀'
                $sub.innerHTML = `Killed by <strong>${escapeHtml(killerName)}</strong> ${icon} · Respawning in <span id="death-timer">3</span>...`
            }
            let t = 3
            const tick = () =>
            {
                const t2 = document.getElementById('death-timer')
                if(t2) t2.textContent = t
                if(t > 0) { t--; setTimeout(tick, 1000) }
            }
            tick()
        })

        this.healthSystem.on('respawn', () =>
        {
            // Reset ammo back to starting count on respawn
            if(this.weapons) this.weapons.ammo = 10
            this._updateCombatHUD()
            this._showLocalCar()
            const $ov = document.getElementById('death-overlay')
            if($ov) $ov.classList.remove('visible')
        })

        // ── Show combat HUD ──
        const $hp  = document.getElementById('hp-container')
        const $wpn = document.getElementById('weapon-status')
        if($hp)  $hp.style.display  = 'block'
        if($wpn) $wpn.style.display = 'block'
        this._updateCombatHUD()

        // Show the touch fire button if the user is on a touch device
        this.controls.touch?.showFire?.()

        // ── Hazard zones (boost + healing) — only meaningful inside the arena ──
        this.hazardZones = new HazardZones({
            scene:        this.scene,
            physics:      this.physics,
            healthSystem: this.healthSystem,
        })

        // ── Arena minimap (fixed top-down view) ──
        const $map = document.getElementById('mp-minimap')
        if($map) $map.style.display = 'block'

        this.arenaMinimap = new ArenaMinimap({
            physics:          this.physics,
            remoteCarManager: this.remoteCarManager,
            localCarColor:    this.config.carColor ?? 0,
            pickups:          ARENA_PICKUPS,
            hazards:          this.hazardZones.getMinimapZones(),
        })

        // ── Meteor shower — server-driven so all clients see the same impacts ──
        this.meteors = new Meteors({
            scene:        this.scene,
            physics:      this.physics,
            healthSystem: this.healthSystem,
            weapons:      this.weapons,
            sounds:       this.sounds,
            onShake:      () => this._shakeCamera(),
        })

        if(this.network)
        {
            this.network.on('combat:meteor', ({ x, y }) =>
            {
                this.meteors?.spawnAt(x, y)
            })
        }

        // ── Tick ──
        this.time.on('tick', () =>
        {
            const dt = Math.min(this.time.delta, 60)
            this.weapons.update(dt)
            this.combatPickups.update(dt)
            this.hazardZones?.update(dt)
            this.arenaMinimap?.update(dt)
            this.meteors?.update(dt)
            this.mines?.update(dt)
            this.damageNumbers?.update(dt)
            // Visual cue: car flickers during spawn invuln
            if(this.car?.chassis?.object && this.healthSystem)
            {
                const inv = this.healthSystem.isInvulnerable()
                if(inv)
                {
                    const flicker = Math.sin(Date.now() * 0.025) > 0
                    this.car.chassis.object.visible = flicker
                }
                else if(!this._dead && this.car.chassis.object.visible === false)
                {
                    this.car.chassis.object.visible = true
                }
            }
        })
    }

    _updateCombatHUD()
    {
        const hp   = this.healthSystem?.hp ?? 100
        const ammo = this.weapons?.ammo   ?? 0

        const $fill  = document.getElementById('hp-fill')
        const $val   = document.getElementById('hp-val')
        const $ammo  = document.getElementById('weapon-ammo')

        if($fill)
        {
            $fill.style.width = `${hp}%`
            $fill.style.background =
                hp > 60 ? '#2ecc71' :
                hp > 30 ? '#f39c12' : '#e74c3c'
        }
        if($val)  $val.textContent  = hp
        if($ammo) $ammo.textContent = `×${ammo}`
    }

    _flashDamage()
    {
        const $flash = document.getElementById('respawn-flash')
        if(!$flash) return
        $flash.style.animation = 'none'
        void $flash.offsetWidth
        $flash.style.animation = 'respawn-flash 0.4s ease-out forwards'
    }

    _showCombatPickup(text, color)
    {
        const $note = document.getElementById('hud-lap-note')
        if(!$note) return
        $note.textContent   = text
        $note.style.color   = color
        $note.style.opacity = '1'
        clearTimeout(this._pickupNoteTimer)
        this._pickupNoteTimer = setTimeout(() =>
        {
            if($note) $note.style.opacity = '0'
        }, 2000)
    }

    _destroyLocalCar()
    {
        const body = this.physics?.car?.chassis?.body
        if(!body) return
        const px = body.position.x, py = body.position.y, pz = body.position.z
        const vx = body.velocity.x, vy = body.velocity.y

        const bodyColor = [
            0xff3333, 0x3366ff, 0x33cc66, 0xff8833,
            0xaa44ff, 0x33cccc, 0xff66aa, 0xeeeeee,
        ][this.config.carColor ?? 0] || 0xff3333

        // Massive local explosion
        this.weapons.explodeCar(px, py, pz, vx, vy, bodyColor)
        this.sounds?.play('carHit', 18)
        this._shakeCamera()
        setTimeout(() => this._shakeCamera(), 80)
        setTimeout(() => this._shakeCamera(), 180)

        // Hide local car meshes
        if(this.car?.chassis?.object) this.car.chassis.object.visible = false
        this.car?.wheels?.items?.forEach(w => { w.visible = false })

        // Sync to other players
        if(this.network) this.network.sendCarDestroyed(px, py, pz, vx, vy, bodyColor)
    }

    _showLocalCar()
    {
        if(this.car?.chassis?.object) this.car.chassis.object.visible = true
        this.car?.wheels?.items?.forEach(w => { w.visible = true })
    }

    _destroyRemoteCar(id, x, y, z, vx, vy, color)
    {
        // Big explosion at remote position
        this.weapons.explodeCar(x, y, z, vx, vy, color)
        this._shakeCamera()  // distant shake

        // Hide that remote car for 3s (matches RESPAWN_MS)
        const car = this.remoteCarManager?.cars?.get(id)
        if(car)
        {
            car.setVisible?.(false)
            setTimeout(() => car.setVisible?.(true), 3000)
        }
    }

    _setupRaceEnd()
    {
        const TOTAL_LAPS = 5
        const lapTimes   = []     // { ms, invalid }

        this.lapTimer.on('lap', ({ lapMs, lapCount, invalid }) =>
        {
            lapTimes.push({ ms: lapMs, invalid })

            if(lapCount >= TOTAL_LAPS)
            {
                this.lapTimer.stop()
                // Small delay so the per-lap summary card shows first
                setTimeout(() => this._showRaceComplete(lapTimes, TOTAL_LAPS), 1800)
            }
        })
    }

    _showRaceComplete(lapTimes, totalLaps)
    {
        const $overlay = document.getElementById('race-complete')
        if(!$overlay) return

        const validTimes = lapTimes.filter(l => !l.invalid)
        const bestMs     = validTimes.length ? Math.min(...validTimes.map(l => l.ms)) : null
        const totalMs    = validTimes.reduce((s, l) => s + l.ms, 0)

        // Fill lap list
        const $list = document.getElementById('rc-laps')
        if($list)
        {
            $list.innerHTML = ''
            lapTimes.forEach((lap, i) =>
            {
                const li   = document.createElement('li')
                li.className = 'rc-lap-row'
                if(lap.invalid)                           li.classList.add('rc-lap-invalid')
                else if(!lap.invalid && lap.ms === bestMs) li.classList.add('rc-lap-best')

                const num  = document.createElement('span')
                num.className   = 'rc-lap-num'
                num.textContent = `LAP ${i + 1}`

                const time = document.createElement('span')
                time.className   = 'rc-lap-time'
                time.textContent = lap.invalid ? 'INVALID' : LapTimer.fmt(lap.ms)

                li.appendChild(num)
                li.appendChild(time)
                $list.appendChild(li)
            })
        }

        const $sub    = document.getElementById('rc-sub')
        const $footer = document.getElementById('rc-footer')
        if($sub)    $sub.textContent    = bestMs ? `Best  ${LapTimer.fmt(bestMs)}` : ''
        if($footer) $footer.textContent = validTimes.length ? `Total  ${LapTimer.fmt(totalMs)}` : ''

        const $again = document.getElementById('rc-again')
        if($again) $again.onclick = () => window.location.reload()

        $overlay.classList.add('visible')
    }

    _setupOffTrackDetection()
    {
        const center = this.track.centerPath
        if(!center || center.length === 0) return

        const HALF_WIDTH    = 7       // track half-width (14m / 2)
        const BUFFER        = 2.5     // extra margin before drag starts
        const THRESHOLD_SQ  = (HALF_WIDTH + BUFFER) ** 2
        const INVALID_MS    = 3000    // continuous off-track time before lap invalidation

        const $note  = document.getElementById('hud-lap-note')
        let offTrack    = false
        let noteShown   = false
        let offTrackMs  = 0
        let lapMarkedInvalid = false

        this.lapTimer.on('lap', () => { offTrackMs = 0; lapMarkedInvalid = false })

        this.time.on('tick', () =>
        {
            if(!this.lapTimer?._active || !this.physics) return

            const body = this.physics.car.chassis.body
            const px   = body.position.x
            const py   = body.position.y

            // Find closest centerline point
            let minSq  = Infinity
            for(const pt of center)
            {
                const dx = pt.x - px
                const dy = pt.y - py
                const sq = dx * dx + dy * dy
                if(sq < minSq) minSq = sq
            }

            const wasOff = offTrack
            offTrack = minSq > THRESHOLD_SQ

            const dt = Math.min(this.time.delta, 60)

            if(offTrack)
            {
                // Halve speed every 2 seconds off-track
                const factor = Math.pow(0.5, dt / 2000)
                body.velocity.x *= factor
                body.velocity.y *= factor

                // Accumulate and check for invalidation
                offTrackMs += dt
                if(!lapMarkedInvalid && offTrackMs >= INVALID_MS)
                {
                    lapMarkedInvalid = true
                    this.lapTimer.invalidate()
                    if($note)
                    {
                        $note.textContent   = '⛔ LAP INVALID'
                        $note.style.color   = '#e74c3c'
                        $note.style.opacity = '1'
                        noteShown = true
                    }
                }
            }
            else
            {
                offTrackMs = 0  // reset counter when back on track
            }

            // Show/hide "OFF TRACK" note (only if lap not already marked invalid)
            if(offTrack && !wasOff && !lapMarkedInvalid && $note)
            {
                $note.textContent   = '⚠ OFF TRACK'
                $note.style.color   = '#e67e22'
                $note.style.opacity = '1'
                noteShown = true
            }
            else if(!offTrack && wasOff && noteShown && !lapMarkedInvalid && $note)
            {
                $note.style.opacity = '0'
                noteShown = false
            }
        })
    }

    _setupWrongWayDetection()
    {
        const center = this.track.centerPath
        if(!center || center.length === 0) return

        const $el = document.getElementById('wrong-way')
        if(!$el) return

        let score = 0   // accumulated "wrongness" ms — show indicator above threshold

        this.time.on('tick', () =>
        {
            if(!this.lapTimer?._active || !this.physics) return

            const dt   = Math.min(this.time.delta, 60)
            const body = this.physics.car.chassis.body
            const vel  = body.velocity
            const px   = body.position.x
            const py   = body.position.y

            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y)
            if(speed < 3)
            {
                score = Math.max(score - dt * 3, 0)
            }
            else
            {
                // Find closest centerline point and its tangent
                let minSq  = Infinity
                let minIdx = 0
                for(let i = 0; i < center.length; i++)
                {
                    const dx = center[i].x - px
                    const dy = center[i].y - py
                    const sq = dx * dx + dy * dy
                    if(sq < minSq) { minSq = sq; minIdx = i }
                }
                const N    = center.length
                const prev = center[(minIdx - 1 + N) % N]
                const next = center[(minIdx + 1)     % N]
                const tx   = next.x - prev.x
                const ty   = next.y - prev.y
                const tlen = Math.sqrt(tx * tx + ty * ty) || 1

                const dotVelTrack = (vel.x * tx + vel.y * ty) / (speed * tlen)

                if(dotVelTrack < -0.65)
                    score = Math.min(score + dt, 1500)
                else
                    score = Math.max(score - dt * 2, 0)
            }

            $el.style.display = score > 900 ? 'block' : 'none'
        })
    }

    _setupMuteButton()
    {
        const $btn = document.getElementById('btn-mute')
        if(!$btn) return
        $btn.style.display = 'flex'
        $btn.textContent   = this.sounds.isMuted() ? '🔇' : '🔊'
        $btn.addEventListener('click', () =>
        {
            this.sounds.toggleMute()
            $btn.textContent = this.sounds.isMuted() ? '🔇' : '🔊'
        })
    }

    _showCountdown()
    {
        const $overlay = document.getElementById('start-lights-overlay')
        const pods     = [0, 1, 2, 3, 4].map(i => document.getElementById(`sl-${i}`))
        if(!$overlay || pods.some(p => !p)) return

        $overlay.style.display    = 'block'
        $overlay.style.animation  = ''
        $overlay.style.opacity    = '1'
        pods.forEach(p => p.className = 'sl-pod')

        // Light each pod red 600ms apart
        pods.forEach((pod, i) =>
        {
            setTimeout(() => pod.classList.add('red'), i * 600)
        })

        // After all are red, hold briefly then go green and fade
        const allRedAt = pods.length * 600
        setTimeout(() =>
        {
            pods.forEach(p => { p.classList.remove('red'); p.classList.add('green') })

            setTimeout(() =>
            {
                $overlay.style.animation = 'sl-fade 0.55s ease-out forwards'
                setTimeout(() =>
                {
                    $overlay.style.display = 'none'
                    pods.forEach(p => p.className = 'sl-pod')
                    if(this.lapTimer)  this.lapTimer.start()
                    if(this.hud)       this.hud.show()
                }, 560)
            }, 600)
        }, allRedAt + 400)
    }

    // ── Combat: kill counter + win condition (first to 5) ───────────────────

    _setupCombatEnd()
    {
        const TARGET_KILLS = 5
        this._kills = 0
        this._combatOver = false

        const $kc = document.getElementById('kill-counter')
        if($kc) $kc.classList.add('visible')
        this._updateKillCounter(0, TARGET_KILLS)

        // Server-authoritative kill attribution — combat:death includes attackerKills
        // for the player who scored the kill. We pick out the events where killerId
        // matches our local id and increment our own counter.
        if(this.network)
        {
            this.network.on('combat:death', ({ killerId, attackerKills }) =>
            {
                if(this._combatOver) return
                if(killerId !== this.network.localId) return
                this._kills = attackerKills
                this._updateKillCounter(this._kills, TARGET_KILLS)
                this._showCombatPickup?.(`+1 KILL`, '#FF2E4D')

                if(this._kills >= TARGET_KILLS)
                {
                    this._combatOver = true
                    setTimeout(() => this._showCombatComplete(this._kills), 1000)
                }
            })
        }
    }

    _updateKillCounter(kills, target)
    {
        const $val = document.getElementById('kc-value')
        if($val) $val.textContent = kills
    }

    _showCombatComplete(kills)
    {
        const $overlay = document.getElementById('race-complete')
        if(!$overlay) return

        const $trophy = $overlay.querySelector('.rc-trophy')
        const $title  = $overlay.querySelector('.rc-title')
        const $sub    = document.getElementById('rc-sub')
        const $list   = document.getElementById('rc-laps')
        const $footer = document.getElementById('rc-footer')

        if($trophy) $trophy.textContent = '🏆'
        if($title)  $title.textContent  = 'VICTORY'
        if($sub)    $sub.textContent    = `${kills} kills · last car running`
        if($list)   $list.innerHTML     = ''
        if($footer) $footer.textContent = 'Free-for-all complete'

        const $again = document.getElementById('rc-again')
        if($again) $again.onclick = () => window.location.reload()

        $overlay.classList.add('visible')
    }
}

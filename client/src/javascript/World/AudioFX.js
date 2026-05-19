// Procedural sound effects via the Web Audio API. No external assets required —
// all sounds are synthesized at play-time from sine/triangle/square oscillators.
// Keeps the bundle slim AND survives any audio-asset removal.

const NOTES = {
    // C major pentatonic, ladder for collect chime
    'C5':  523.25,
    'D5':  587.33,
    'E5':  659.25,
    'G5':  783.99,
    'A5':  880.00,
    'C6': 1046.50,
    'D6': 1174.66,
    'E6': 1318.51,
}
const LADDER = ['C5','D5','E5','G5','A5','C6','D6','E6','G5','C6']  // 10 notes for 10 cars

export default class AudioFX
{
    constructor()
    {
        this.ctx = null
        this._muted = false
        this._lastCollect = 0
        this._ensureContextOnGesture()
    }

    _ensureContextOnGesture()
    {
        const init = () =>
        {
            if(this.ctx) return
            try
            {
                const AC = window.AudioContext || window.webkitAudioContext
                this.ctx = new AC()
            }
            catch { /* no audio support */ }
        }
        // First user input unlocks audio in most browsers
        ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
            window.addEventListener(ev, init, { once: true, passive: true })
        )
    }

    setMuted(b) { this._muted = !!b }

    _gainNode(level = 0.25, attack = 0.005, release = 0.12, duration = 0.18, startAt = 0)
    {
        const g = this.ctx.createGain()
        const t = this.ctx.currentTime + startAt
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(level, t + attack)
        g.gain.linearRampToValueAtTime(level, t + duration - release)
        g.gain.linearRampToValueAtTime(0, t + duration)
        return { node: g, stopAt: t + duration + 0.01 }
    }

    _osc(freq, type = 'sine', detune = 0, startAt = 0)
    {
        const o = this.ctx.createOscillator()
        o.type = type
        o.frequency.value = freq
        o.detune.value = detune
        const t = this.ctx.currentTime + startAt
        o.start(t)
        return { node: o, startAt: t }
    }

    _play({ freq, type = 'sine', level = 0.22, duration = 0.18, attack = 0.005, release = 0.12, detune = 0, startAt = 0 })
    {
        if(this._muted || !this.ctx) return
        const { node: osc, startAt: t } = this._osc(freq, type, detune, startAt)
        const { node: gain, stopAt }    = this._gainNode(level, attack, release, duration, startAt)
        osc.connect(gain).connect(this.ctx.destination)
        osc.stop(stopAt)
    }

    // ── Public sound triggers ────────────────────────────────────────────────

    // Countdown beep — short blip per number (3, 2, 1)
    countdownBeep(num)
    {
        if(!this.ctx) return
        const map = { 3: 440, 2: 523.25, 1: 659.25 }
        const f = map[num] ?? 440
        this._play({ freq: f, type: 'triangle', duration: 0.18, level: 0.25 })
        // little harmonic
        this._play({ freq: f * 2, type: 'sine', duration: 0.18, level: 0.08 })
    }

    // GO horn — louder triumphant blast
    countdownGo()
    {
        if(!this.ctx) return
        const base = 880
        this._play({ freq: base,       type: 'sawtooth', duration: 0.45, level: 0.20, attack: 0.01, release: 0.2 })
        this._play({ freq: base * 1.5, type: 'triangle', duration: 0.45, level: 0.14, attack: 0.01, release: 0.2 })
        this._play({ freq: base * 0.5, type: 'sine',     duration: 0.45, level: 0.12, attack: 0.01, release: 0.2 })
    }

    // Collect ladder — note rises per consecutive pickup, resets if >2s gap
    collectChime(idx)
    {
        if(!this.ctx) return
        const now = performance.now()
        const reset = now - this._lastCollect > 2000
        this._lastCollect = now
        const noteIdx = Math.min(LADDER.length - 1, reset ? 0 : (idx % LADDER.length))
        const f = NOTES[LADDER[noteIdx]] || 523.25
        // Main tone
        this._play({ freq: f, type: 'triangle', duration: 0.22, level: 0.22, attack: 0.005, release: 0.18 })
        // Sparkle harmonic up an octave
        this._play({ freq: f * 2, type: 'sine', duration: 0.22, level: 0.10, attack: 0.005, release: 0.18 })
        // Add a tiny fifth for body
        this._play({ freq: f * 1.5, type: 'sine', duration: 0.22, level: 0.06, attack: 0.005, release: 0.18 })
    }

    // Warning tick (last 10s of timer)
    timerTick(urgent = false)
    {
        if(!this.ctx) return
        const f = urgent ? 880 : 440
        this._play({ freq: f, type: 'square', duration: 0.05, level: urgent ? 0.18 : 0.08, attack: 0.001, release: 0.03 })
    }

    // Victory fanfare (on win)
    fanfare()
    {
        if(!this.ctx) return
        const seq = [523.25, 659.25, 783.99, 1046.5, 1318.51]
        seq.forEach((f, i) =>
        {
            this._play({ freq: f,       type: 'triangle', duration: 0.18, level: 0.20, startAt: i * 0.08 })
            this._play({ freq: f * 1.5, type: 'sine',     duration: 0.18, level: 0.08, startAt: i * 0.08 })
        })
    }
}

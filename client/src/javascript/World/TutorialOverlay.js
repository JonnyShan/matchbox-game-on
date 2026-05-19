// First-time tutorial overlay. Shows controls + objective during pre-match
// countdown. Dismisses on any key/click or after timeout. localStorage flag
// prevents replays unless user clears storage.

const STORAGE_KEY = 'mb:tutorialSeen'
const AUTO_DISMISS_MS = 9000

export default class TutorialOverlay
{
    constructor()
    {
        if(localStorage.getItem(STORAGE_KEY)) return
        this._build()
    }

    _build()
    {
        const $root = document.createElement('div')
        $root.id = 'mb-tutorial'
        $root.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 750;
            font-family: 'Space Grotesk', sans-serif;
            color: #f7ecd2;
            backdrop-filter: blur(4px);
            opacity: 0;
            transition: opacity 0.35s ease;
            pointer-events: all;
        `
        $root.innerHTML = `
            <div style="
                background: rgba(20,12,5,0.92);
                border: 3px solid #f0c14b;
                border-radius: 18px;
                padding: 24px 32px;
                max-width: 540px;
                width: 90vw;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0,0,0,0.7);
            ">
                <div style="color:#f0c14b;font-size:11px;letter-spacing:5px;font-weight:800;margin-bottom:6px;">HOW TO PLAY</div>
                <div style="font-size:28px;font-weight:900;letter-spacing:2px;margin-bottom:16px;text-shadow:2px 2px 0 #1a1a1a;">
                    COLLECT 10 CARS<br>IN 60 SECONDS
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;text-align:left;">
                    <div style="background:rgba(247,236,210,0.06);border:1px solid rgba(240,193,75,0.3);border-radius:10px;padding:12px;">
                        <div style="font-size:9px;letter-spacing:3px;color:#f0c14b;font-weight:800;margin-bottom:6px;">DRIVE</div>
                        <div style="font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:1px;line-height:1.6;">
                            <kbd style="background:#1a1a1a;padding:2px 8px;border-radius:4px;border:1px solid #f0c14b;color:#f0c14b">W A S D</kbd> move<br>
                            <kbd style="background:#1a1a1a;padding:2px 8px;border-radius:4px;border:1px solid #f0c14b;color:#f0c14b">SHIFT</kbd> boost<br>
                            <kbd style="background:#1a1a1a;padding:2px 8px;border-radius:4px;border:1px solid #f0c14b;color:#f0c14b">SPACE</kbd> jump
                        </div>
                    </div>
                    <div style="background:rgba(247,236,210,0.06);border:1px solid rgba(240,193,75,0.3);border-radius:10px;padding:12px;">
                        <div style="font-size:9px;letter-spacing:3px;color:#f0c14b;font-weight:800;margin-bottom:6px;">COLLECT</div>
                        <div style="font-size:12px;line-height:1.5;color:rgba(247,236,210,0.85);">
                            Drive into the <strong style="color:#f0c14b">gold beams</strong> to grab Matchbox cars. Watch the bottom-center compass — it always points to the nearest car.
                        </div>
                    </div>
                </div>

                <div style="font-size:11px;color:rgba(247,236,210,0.55);letter-spacing:2px;margin-bottom:14px;">
                    AVOID MUD PUDDLES — THEY SLOW YOU DOWN
                </div>

                <button id="mb-tut-go" style="
                    background: linear-gradient(180deg, #ee3a2f 0%, #c92a22 100%);
                    color: #f7ecd2;
                    border: 3px solid #f7ecd2;
                    border-radius: 10px;
                    padding: 10px 28px;
                    font-family: 'Space Grotesk', sans-serif;
                    font-weight: 900;
                    font-size: 14px;
                    letter-spacing: 3px;
                    cursor: pointer;
                    box-shadow: 0 6px 0 #6b1410;
                ">GOT IT</button>
            </div>
        `
        document.body.appendChild($root)
        this.$root = $root

        requestAnimationFrame(() => { $root.style.opacity = '1' })

        const dismiss = () =>
        {
            localStorage.setItem(STORAGE_KEY, '1')
            $root.style.opacity = '0'
            setTimeout(() => $root.remove(), 380)
            document.removeEventListener('keydown', dismissOnce)
            clearTimeout(autoTimer)
        }
        const dismissOnce = (e) => { if(e.key !== 'Shift' && e.key !== 'Control') dismiss() }

        $root.querySelector('#mb-tut-go').addEventListener('click', dismiss)
        document.addEventListener('keydown', dismissOnce)
        const autoTimer = setTimeout(dismiss, AUTO_DISMISS_MS)
    }
}

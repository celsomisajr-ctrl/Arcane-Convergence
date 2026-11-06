# Arcane Convergence

**Play:** https://celsomisajr-ctrl.github.io/Arcane-Convergence/

A standalone 3D mage duel greybox. Fight an AI rival in a best-of-three match.

```sh
npm ci
npm run dev
```

Pick one of five mages before the match. Your mage's colour fixes its element for the whole match:

| Mage | Element | Ultimate | Beats | Weak to |
|---|---|---|---|---|
| Red | Fire | A roaring torrent of flame | Gold, Light | Frost, Nature |
| Yellow | Gold Threads | Threads that slow and drain mana | Frost, Nature | Fire, Light |
| Blue | Frost | A crystal shield that blocks beams and reflects bolts | Light, Fire | Gold, Nature |
| White | Light | A piercing beam that cuts through Frost shields | Nature, Gold | Fire, Frost |
| Green | Nature | Vines and poison: damage over time and a short root | Fire, Frost | Gold, Light |

Every mage casts by weaving threads in their colour; each skill adds its own effect on top. The AI rival gets a random mage each round, never your colour. (Online 1v1 is planned: one mage per player.)

**Controls (Mobile Legends style).** The camera is a fixed 3/4 view from above. On touchscreens, touch anywhere on the left side for a floating joystick. Tap the Basic attack to fire at the rival and Blink to dodge. Blink sits in the small battle-spell slot. Skills 1–3 are locked until each mage's kit is defined; the element beam that used to be Skill 1 has been removed from play (its channel and beam-clash code remain in `src/sim.ts`, unused). Phones play in landscape.

On desktop, WASD moves and the mouse aims. Left click is the basic attack, and Space or F blinks. Hold R to aim the Ultimate at the cursor, release to cast, and press Esc to cancel.

**The Ultimate: the Weave.** Fill the ring, then drag the Ultimate button onto the arena to place a circle within range. Drag it onto Cancel to call it off.
- **Gather (0.7 s):** you rise with your arms out while threads stream in from the hall. A hit in this phase interrupts the Weave and refunds half the ring.
- **Channel (up to 3 s):** waves of threads lash into the circle. The joystick (or WASD) steers it, and you stay rooted.
- **Release:** a final burst that stuns. It fires when the ring runs out, or early when you tap the Ultimate again.

Each element changes the payload: Hell Fire burns, Giant Sword slows and drops a blade, Sharp Blizzard freezes on release, Soul Drain heals you, and Huge Rocks roots and drops boulders. The rival casts its Weave on you, steers it after you, and steps out of yours. Your circle is drawn in your colour; the rival's is drawn as a red warning.

The simulation in `src/sim.ts` advances serializable duel state at 60 ticks per second from per-mage commands. The AI supplies commands separately. The Three.js view reads simulation state and handles camera and spell effects. The browser entry point owns match flow and timing.

## Build and GitHub Pages

Run `npm run build` to type-check and produce `dist/`, then `npm run preview` to preview the build locally. Vite uses relative asset URLs so the output can be hosted at a GitHub Pages repository subpath. Every push to `main` runs the tests, builds, and publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves (`.github/workflows/pages.yml`). Pull requests run the tests and build (`ci.yml`).

The slice uses procedural geometry and colors. Audio, finished character art and effects, and physical-device performance validation remain for later passes.

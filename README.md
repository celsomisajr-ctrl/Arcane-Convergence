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

**Controls.** WASD moves, the mouse aims in free-aim mode, and Q toggles the default lock-on. Click (or tap **Ultimate**) once to unleash your Ultimate; it pours until your mana runs out, and another click releases it early with a final burst. Right click fires an interrupting bolt and Space blinks. When beams clash, your Ultimate holds itself: click/tap Ultimate (or press E) once per beat as the marker crosses the bright band; blink to break away. On touchscreens, move with the virtual stick and use the on-screen buttons with auto-aim; phones play in landscape.

The simulation in `src/sim.ts` advances serializable duel state at 60 ticks per second from per-mage commands. The AI supplies commands separately. The Three.js view reads simulation state and handles camera and spell effects. The browser entry point owns match flow and timing.

## Build and GitHub Pages

Run `npm run build` to type-check and produce `dist/`, then `npm run preview` to preview the build locally. Vite uses relative asset URLs so the output can be hosted at a GitHub Pages repository subpath. Every push to `main` runs the tests, builds, and publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves (`.github/workflows/pages.yml`). Pull requests run the tests and build (`ci.yml`).

The slice uses procedural geometry and colors. Audio, finished character art and effects, and physical-device performance validation remain for later passes.

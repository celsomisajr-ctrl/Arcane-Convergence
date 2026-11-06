# Arcane Convergence

A standalone 3D mage duel greybox. Fight an AI rival in a best-of-three match.

```sh
npm ci
npm run dev
```

WASD moves, the mouse aims in free aim mode, and Q toggles the default lock-on. Hold left click to channel, right click to interrupt with a bolt, and press Space to blink. Use 1–3 to select an element when idle. During a clash, keep holding channel and tap E once per beat as the marker crosses the bright band. On touchscreens, move with the virtual stick and use the on-screen buttons with auto-aim.

Fire deals direct damage, Gold Threads slow and drain mana, and Frost blocks and reflects bolts. Fire beats Gold, Gold beats Frost, and Frost beats Fire in a clash. Releasing a charged channel early outside a clash launches a weaker projectile.

The simulation in `src/sim.ts` advances serializable duel state at 60 ticks per second from per-mage commands. The AI supplies commands separately. The Three.js view reads simulation state and handles camera and spell effects. The browser entry point owns match flow and timing.

## Build and GitHub Pages

Run `npm run build` to type-check and produce `dist/`, then `npm run preview` to preview the build locally. Vite uses relative asset URLs so the output can be hosted at a GitHub Pages repository subpath. A future Pages workflow can build with `npm ci && npm run build` and deploy `dist/` after publishing is approved.

The slice uses procedural geometry and colors. Audio, finished character art and effects, and physical-device performance validation remain for later passes.

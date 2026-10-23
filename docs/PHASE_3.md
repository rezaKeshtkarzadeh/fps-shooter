# Phase 3 — Weapons and Combat

Build a data-driven weapon system on top of the existing player controller.

Implement three distinct initial primary weapons and a secondary pistol. Keep weapon identities and statistics configurable so the exact initial weapon selection can be refined without rewriting the weapon system.

Requirements:
- Weapon switching and ammunition management
- Magazine capacity, reserve ammunition, reload timing, and firing cooldowns
- Aim Down Sights (ADS) with smooth transitions
- Weapon-specific recoil, spread, and movement penalties
- First-person weapon positioning and reload animations
- Hitscan firing for suitable weapons and physical projectiles where appropriate
- Raycast-based hit detection with distinct head, torso, arm, and leg hit regions
- Damage falloff based on weapon and distance
- Clear hit feedback and kill events
- Typed weapon definitions and configurable damage parameters

Separate visual effects from authoritative gameplay calculations. Ensure each shot is processed only once and prevent firing during invalid states.

Use temporary but clearly distinguishable weapon models if final assets are unavailable. Test firing, reloading, switching, hit detection, and damage calculations.
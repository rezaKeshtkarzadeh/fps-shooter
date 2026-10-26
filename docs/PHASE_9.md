# Phase 9: Stabilization, Profiling, Testing & Production Hardening

Phase 9 transitions the tactical shooter codebase from feature-complete development to production-grade stability, zero-leak memory management, deterministic 60fps execution, and verifiable offline readiness. No new gameplay systems or mechanical features are introduced in this phase.

---

## 1. Zero-Allocation Tick Architecture & Garbage Collection Optimization

Frequent dynamic instantiations inside the high-frequency tick loop ($60\text{ Hz}$ physics and render loops) trigger browser V8 Garbage Collection (GC) pauses, resulting in micro-stutter and frame spikes.

### Memory Optimization Requirements:
* **Zero `new` in Loops:** Prohibit dynamic allocations (`new THREE.Vector3()`, `new THREE.Quaternion()`, `new RAPIER.Ray()`, or closure callback allocations) inside `update()`, `fixedUpdate()`, or raycast traversal loops.
* **Reusable Scratchpad Pattern:** All spatial queries and matrix calculations must use module-level or static scratchpad instances:
  ```typescript
  // Canonical Scratchpad Pattern
  const _scratchVec3A = new THREE.Vector3();
  const _scratchVec3B = new THREE.Vector3();
  const _scratchQuat = new THREE.Quaternion();
  const _scratchRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  ```
* **Object Pooling:** Projectiles (grenades), audio buffer nodes, kill feed entries, and HUD notifications must recycle instances through fixed-capacity FIFO pools.

---

## 2. Resource Disposal & Memory Leak Prevention

Unmanaged scene reloads and entity deletions lead to GPU VRAM leaks, orphan physics colliders, and browser WebGL context losses.

### Explicit Cleanup Protocol:
Every subsystem must implement a deterministic `dispose()` lifecycle:
1. **Three.js Graphics Assets:**
   * Invoke `.dispose()` on all geometries, textures, render targets, and material instances.
   * Remove child meshes from parents and clear references to decouple from the scene graph.
2. **Rapier3D Physics Entities:**
   * Explicitly call `world.removeRigidBody(body)` and `world.removeCollider(collider, false)` for eliminated targets, exploded grenades, and breached barriers.
3. **Web Audio Resources:**
   * Disconnect all intermediate `GainNode`, `PannerNode`, and `BiquadFilterNode` instances prior to dereferencing.
   * Clear active intervals and timeouts bound to audio loops.
4. **DOM Event Listeners:**
   * Remove global window/document listeners (`pointerdown`, `keydown`, `keyup`, `blur`, `resize`, `pointerlockchange`) upon teardown.

---

## 3. Strict Compiler Validation & Build Audit

The build and type integrity must pass automated validation without warnings or runtime overrides.

### Verification Criteria:
* **TypeScript Strict Mode:** Execute `tsc --noEmit` under `strict: true`. Eliminate all `any` casting, implicit returns, and unhandled `undefined`/`null` access paths.
* **WASM Binary Integrity:** Ensure `@dimforge/rapier3d-compat` loads the `.wasm` binary correctly in both local dev server and optimized production build (`npm run build`).
* **Bundle Analysis:** Verify that all assets (audio files, textures, greybox models) are packaged into the distribution folder or resolved via relative paths without external CDN dependencies.
* **Offline Operation:** Disconnect active network interfaces; reload the production bundle locally to guarantee $100\%$ offline gameplay without external asset fetches or dropped fonts.

---

## 4. Quantitative Stress Testing & Edge-Case Scenarios

The codebase must undergo automated and manual stress testing under worst-case combat loads:

### Test Scenarios:
| Test Scenario | Stress Condition | Acceptance Threshold |
|---|---|---|
| **Max AI Combat Load** | 10 active bots in simultaneous combat + pathfinding | Frame-time $\le 16.6\text{ ms}$ ($\ge 60\text{ fps}$), zero unhandled exceptions |
| **Explosive Saturation** | 4 simultaneous frag grenade detonations near cover | No Rapier CCD tunneling, no GC frame drop below $55\text{ fps}$ |
| **Pathfinding Obstruction** | Completely barricade all 3 combat lanes with obstacles | A* path failure resolves gracefully to hold/suppress; zero infinite loops |
| **Spawn Trap Flooding** | Place 5 enemies within $10\text{ m}$ of candidate spawn points | Dynamic spawn engine disqualifies all compromised nodes, selects safest fallback |
| **Continuous Match Loop** | 15-minute continuous TDM match with respawns | Heap memory growth $\le 15\text{ MB}$ over baseline (zero linear memory leaks) |
| **Stance Transition Stress** | Rapidly spam `Z`, `C`, and `Space` beneath low ceilings ($1.3\text{ m}$) | Zero clipping into ceiling geometry; clearance sweeps reject stand reliably |

---

## 5. Deliverable Audit Report Structure

Upon completing stabilization and verification, compile the final project report covering:

1. **System Implementation Summary:** Comprehensive audit of character locomotion, dual-camera viewmodel gunplay, modular military base map, tactical AI perception/squad coordination, health/equipment kinematics, TDM match loop/HUD, and spatial 3D audio.
2. **Root-Cause Bug Fix Log:** Detailed list of fixed runtime defects, edge-case race conditions, and physics tunneling issues.
3. **Build & Test Metrics:** Verification pass status across `npm run build`, `tsc --noEmit`, average frame rates, and heap memory profiles.
4. **Known Limitations:** Documented trade-offs (e.g., procedural asset fallbacks vs. high-poly skeletal meshes).
5. **Local Run Guide:** Deterministic commands to install, build, and run the project locally.
6. **Future Roadmap:** Prioritized architectural extensions (e.g., networked multiplayer client-prediction, procedural destruction chunking).
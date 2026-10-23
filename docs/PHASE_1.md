# Phase 1: Architectural Audit & Essential Technical Refinements

While the standard Phase 1 specification covers the basic setup, building a tactical FPS with MW2019-grade tactile responsiveness requires addressing five critical architectural bottlenecks before writing code. Neglecting these will force major refactors in Phase 2 and Phase 4.

## 1. Character Controller Strategy (Rapier3D)

A raw dynamic rigid body (applying impulses/forces to a sphere or capsule) produces floating, unpredictable edge collisions, and erratic stair traversal.

* **Requirement:** Do not use raw dynamic bodies for the player. Implement Rapier's built-in **`KinematicCharacterController`** (`world.createCharacterController`).

* **Required Configurations:**

  * `enableAutostep(maxHeight, minWidth, includeDynamicBodies)`: Ensures smooth stair stepping without manual velocity jumps.

  * `setSlideEnabled(true)`: Enables predictable sliding along walls.

  * `setMaxSlopeClimbAngle(angle)`: Prevents climbing steep inclines.

  * `setMinSlopeSlideAngle(angle)`: Handles sliding down un-walkable slopes.

  * `enableSnapToGround(distance)`: Prevents airborne floating when running down ramps or stairs.

## 2. Frame-Rate Independent Physics Loop (Fixed Timestep Accumulator)

Modern client displays range from 60Hz to 144Hz+. Running physics directly inside `requestAnimationFrame(delta)` causes game logic, jump height, and gravity to scale unpredictably with refresh rate and frame drops.

* **Requirement:** Decouple physics from the rendering loop using a **Fixed Timestep Accumulator** pattern running at a fixed $60\text{ Hz}$ ($\Delta t_{\text{fixed}} \approx 0.0166\text{ s}$):
  

  $$
  \text{accumulator} += \min(\Delta t_{\text{frame}}, 0.1)
  $$

  $$
  \text{while (accumulator} \ge \Delta t_{\text{fixed}}\text{) \{ physics.step(); accumulator } -= \Delta t_{\text{fixed}}\text{; \}}
  $$

* A maximum delta clamp ($\le 0.1\text{ s}$) is required to prevent the "spiral of death" during severe frame drops.

## 3. Decoupled Camera & Player Hierarchy

Applying mouse look directly to the Three.js `Camera` breaks future mechanics (camera shake, weapon recoil, head bobbing, and tactical sprint viewmodels).

* **Requirement:** Enforce a strict 3-tier scene hierarchy from day one:

  ```
  PlayerRoot (Capsule Collider position + Horizontal Yaw only)
  └── CameraPivot / SpringArm (Vertical translation for Crouch, Slide, & Head Bob)
      └── CameraPitch (Vertical look angle clamping: -89° to +89°)
          ├── Three.js Camera
          └── ViewModelAnchor (Mount point for weapons and hands in Phase 2)
  
  ```

* **Rationale:** Weapon recoil can offset `CameraPitch` without altering player movement direction, and head bobbing can displace `CameraPivot` without misaligning the hitscan raycast origin.

## 4. Collision Layers and Filtering (Bitmasks)

Introducing bots, hitscan queries, grenades, and penetration in Phases 2–4 will break collision queries if all colliders share generic default flags.

* **Requirement:** Establish standard 16-bit collision groups in `gameConfig.ts` during Phase 1:

  * `GROUP_ENVIRONMENT = 0x0001`

  * `GROUP_PLAYER      = 0x0002`

  * `GROUP_BOT         = 0x0004`

  * `GROUP_PROJECTILE  = 0x0008`

  * `GROUP_HITSCAN     = 0x0010`

* Configure player colliders with explicit interaction masks (`memberships` and `filters`).

## 5. Input State Management & Focus Loss

In browser-based shooters, pressing `W` and hitting `ESC` or Alt-Tabbing causes the browser to drop the `keyup` event, resulting in permanently stuck movement keys.

* **Requirement:**

  * Attach a `window.addEventListener('blur', ...)` handler inside `InputManager` to instantly reset all active key states to `false`.

  * Pair the `PointerLockControls` with state transitions to pause or resume player input processing cleanly.

## Refined Phase 1 Implementation Checklist

1. \[x\] **Vite & WASM Config:** Build setup supporting `@dimforge/rapier3d-compat` and modern ES modules.

2. \[x\] **Project Structure:** Fully typed modular directories (`core`, `player`, `weapons`, `world`, `ui`, `config`).

3. \[x\] **Physics Engine:** Fixed-timestep Rapier loop with accumulator and clamp.

4. \[x\] **Movement Controller:** `KinematicCharacterController` capsule with slope clamping, auto-stepping, and ground snap.

5. \[x\] **Camera Rig:** Decoupled `PlayerRoot -> Pivot -> Pitch -> Camera` hierarchy with mouse look and pitch clamps.

6. \[x\] **Input Engine:** Pointer Lock API integration with `blur` safety resets.

7. \[x\] **Test Arena (Greybox):** Ground plane, boundary walls, multi-step stairs, an inclined ramp, and elevated blocks for testing clearance and step-ups.

8. \[x\] **Configuration Layer:** Centralized `gameConfig.ts` exposing speed, acceleration, friction, mouse sensitivity, and capsule dimensions.
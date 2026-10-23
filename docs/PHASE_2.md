# Phase 2: Locomotion State Machine, Traversal Math & Kinematic Specifications

Implementing an authentic, weighty MW2019-grade character controller in Three.js and Rapier3D requires solving non-trivial kinematic, trigonometric, and collision-sweeping problems. The following architectural and mathematical refinements must be enforced.

---

## 1. Input Architecture & Toggle-to-Action Protocol

To match competitive tactical shooter conventions, all movement actions (except directional movement) follow a **Toggle-to-Action** paradigm.

### Input Mapping Specifications:
* **Directional Movement (`WASD`):** Continuous hold input. Releasing all directional keys immediately breaks out of `SPRINT` and `TACTICAL_SPRINT`, resetting player state back to `STAND / WALK`.
* **Crouch / Slide (`C` - Toggle):**
  * When in `STAND / WALK`: Toggles to `CROUCH`.
  * When in `CROUCH`: Toggles back to `STAND` (subject to ceiling clearance).
  * When in `SPRINT` or `TACTICAL_SPRINT`: Immediately triggers `SLIDE`.
* **Universal Prone (`Z` - Toggle):**
  * Operates universally from **any** state (`STAND`, `WALK`, `CROUCH`, `SPRINT`, `TACTICAL_SPRINT`, `SLIDE`).
  * If triggered from `SPRINT` or `TACTICAL_SPRINT`, momentum is preserved as an inertial dive (Dolphin Dive / Drop-shot decay over $\approx 0.35\text{ s}$) while the capsule height drops.
  * Pressing `Z` while in `PRONE` attempts to toggle back to `STAND`. If standing clearance is blocked, it resolves down to `CROUCH` if clearance allows, or remains in `PRONE`.
* **Sprint & Tactical Sprint (`LeftShift` - Multi-Tap Timing):**
  * **Single Tap:** Toggles `SPRINT`.
  * **Double Tap ($\Delta t_{\text{tap}} \le 300\text{ ms}$):** Toggles `TACTICAL_SPRINT`.
* **Jump & Traversal (`Space` - Action):**
  * When grounded: Initiates `JUMP`.
  * When in air and facing an obstacle: Triggers `MANTLE`.
  * When climbing a ladder: Pushes off with rear impulse.
  * **When in `SLIDE`:** Executes an authentic **Slide Cancel**, terminating slide momentum and snapping stance to `STAND`.

---

## 2. Stance Height Management & Clearance Sweeps

Dynamically changing the Rapier character collider height (Standing: $1.8\text{ m}$, Crouch: $1.2\text{ m}$, Prone: $0.4\text{ m}$) introduces clipping and stuck states under low ceilings.

### Requirements:
* **Multi-Tier Clearance Sweep:** Before executing any transition from a lower stance to a higher stance (e.g., `PRONE -> STAND` via `Z` toggle):
  1. Cast a vertical upward ray/swept shape from the current capsule base to check for standing clearance:
     $$H_{\text{clearance}} \ge H_{\text{stand}} + \epsilon \quad (1.85\text{ m})$$
  2. If blocked, test crouch clearance:
     $$H_{\text{clearance}} \ge H_{\text{crouch}} + \epsilon \quad (1.25\text{ m})$$
     If crouch clearance passes, transition to `CROUCH` instead of standing.
  3. If both fail, the state transition **must be rejected** and the player forced to remain in the lower stance.
* **Capsule Anchor Continuity:** The bottom hemisphere of the capsule must remain pinned to ground contact during height changes; scale or shift the capsule center upward relative to the feet origin to prevent falling through floors or jittering.

---

## 3. Sliding Physics & Slide-Cancel Mechanics

Sliding in MW2019 is momentum-dependent, directional-locked, affected by surface incline, and can be actively canceled.

### Mathematical Formulation:
1. **Entry Threshold:** Triggered when pressing `C` while in `SPRINT` or `TACTICAL_SPRINT` and grounded:
   $$\vec{v}_{\text{entry}} = \vec{v}_{\text{current}} \times 1.25$$
2. **Directional Steering Damping:** While sliding, mouse yaw must not instantly redirect linear momentum. The velocity vector dampens toward the camera forward vector at a restricted angular rate ($\omega_{\text{max}} \approx 1.5\text{ rad/s}$).
3. **Incline & Friction Dynamics:** During fixed tick $\Delta t$:
   $$\vec{a}_{\text{friction}} = -\mu_{\text{slide}} \cdot g \cdot \hat{v}$$
   $$\vec{a}_{\text{slope}} = g \cdot (\hat{n}_{\text{ground}} \times \hat{v}) \times \hat{n}_{\text{ground}}$$
   $$\vec{v}(t + \Delta t) = \vec{v}(t) + (\vec{a}_{\text{friction}} + \vec{a}_{\text{slope}}) \Delta t$$
4. **Exit & Cancellation Triggers:**
   * **Natural Decay:** When $\|\vec{v}\| < v_{\text{min\_slide}} \approx 2.5\text{ m/s}$ or slide duration exceeds $1.4\text{ s}$, drop automatically into `CROUCH`.
   * **Crouch Toggle (`C`):** Pressing `C` during slide immediately transitions to `CROUCH`.
   * **Universal Prone (`Z`):** Pressing `Z` during slide transitions to `PRONE` with remaining momentum decay.
   * **MW2019 Slide Cancel (`Space`):** Pressing `Space` during slide immediately breaks out of slide inertia, resets the slide cooldown, and transitions into `STAND` (subject to ceiling clearance), allowing immediate sprint re-engagement.

---

## 4. Mantle & Vault Traversal (Dual-Ray Detection)

Obstacle traversal cannot rely on simple physics collisions. It requires a deterministic multi-ray scanner and procedural root-motion translation over tall obstacles.

### Detection Algorithm:
1. **Forward Impact Ray (Wall Check):** Raycast forward from chest level ($y_0 + 1.2\text{ m}$) along camera horizontal forward $\vec{d}_{\text{fwd}}$ for distance $L_1 \le 0.8\text{ m}$.
   * Identifies wall contact point $\vec{P}_{\text{wall}}$ and wall normal $\vec{n}_{\text{wall}}$.
2. **Downward Sweep (Ledge Top Check):** Cast a vertical downward ray from elevated origin:
   $$\vec{P}_{\text{top\_origin}} = \vec{P}_{\text{wall}} - (\vec{n}_{\text{wall}} \cdot 0.35\text{ m}) + \vec{u}_{\text{up}} \cdot 2.2\text{ m}$$
   * Identifies ledge landing point $\vec{P}_{\text{ledge}}$.
   * Mantle height: $H_{\text{mantle}} = \vec{P}_{\text{ledge}}.y - \vec{P}_{\text{feet}}.y$.
   * Valid mantle range: $0.6\text{ m} \le H_{\text{mantle}} \le 1.8\text{ m}$.
3. **Clearance Check:** Swept sphere ($r = 0.4\text{ m}$) at $\vec{P}_{\text{destination}} = \vec{P}_{\text{ledge}} + \vec{u}_{\text{up}} \cdot 0.9\text{ m}$ to verify player body clearance.
4. **Trajectory Curve:** During mantle ($t \in [0, 1]$ over duration $\approx 0.45\text{ s}$), disable standard KCC movement and interpolate `PlayerRoot` using a quadratic Bézier curve:
   $$\vec{B}(t) = (1-t)^2 \vec{P}_{\text{start}} + 2(1-t)t \vec{P}_{\text{apex}} + t^2 \vec{P}_{\text{destination}}$$
   where $\vec{P}_{\text{apex}} = (\vec{P}_{\text{start}}.x, \vec{P}_{\text{ledge}}.y + 0.2, \vec{P}_{\text{start}}.z)$.
5. **Mantle Exit:** Upon reaching destination ($t=1.0$), set stance to `CROUCH` or `STAND` based on overhead clearance.

---

## 5. Ladder Interaction Kinematics

Ladder traversal requires overriding gravity and projecting user movement inputs directly onto the ladder plane.

### Kinematics:
* **Detection:** Raycast or volume overlap with `GROUP_ENVIRONMENT` labeled as ladder tag.
* **Input Projection:** Zero out standard gravity. Vertical climbing velocity is driven by:
  $$v_y = (\vec{input}_{\text{WASD}} \cdot \vec{d}_{\text{ladder\_fwd}}) \times v_{\text{climb}}$$
* **Dismount Triggers:**
  * Reaching the top ledge (transition to small forward vault step).
  * Pressing `SPACE` (jump backward off ladder with impulse $-\vec{n}_{\text{ladder}} \times 4.0\text{ m/s}$).

---

## 6. Movement Finite State Machine (FSM)

To prevent invalid physics overlapping, player state must be enforced by a strict FSM:

```
                      [ Z Key (Universal Toggle) ]
          ┌────────────────────────────────────────────────────────┐
          │                                                        ▼
   [STAND / WALK] <────── C Key (Toggle) ──────> [CROUCH] <──> [PRONE]
      │    ▲
      │    │ (Release WASD / Press Shift again)
      ▼    │
   [SPRINT] (Single Shift)
      │
      ├── (Double-tap Shift) ──> [TACTICAL_SPRINT]
      │                                │
      ├──────── (C Key on Sprint) ─────┤
      ▼                                ▼
   [SLIDE] <───────────────────────────┘
      │
      ├── Space Key (Slide Cancel) ──────────────> [STAND]
      ├── C Key / Finished / Speed < 2.5 m/s ────> [CROUCH]
      └── Z Key ─────────────────────────────────> [PRONE] (Inertial Drop)

   [JUMP / IN_AIR] ── (Detect Ledge) ──> [MANTLE] ──> [CROUCH / STAND]
   [LADDER] ─────── (Space Key) ───────> [JUMP / IN_AIR] (Kick-off)
```

### Transition & Control Matrix:

| Current State | Input Action | Condition / Logic | Target State |
| :--- | :--- | :--- | :--- |
| **STAND / WALK** | `Shift` (Single) | Moving forward ($\vec{v}_{\text{in}} \cdot \hat{d} \ge 0.7$) | `SPRINT` |
| **STAND / WALK** | `Shift` (Double-tap) | $\Delta t_{\text{tap}} \le 300\text{ ms}$ & Stamina > 0 | `TACTICAL_SPRINT` |
| **STAND / WALK** | `C` (Toggle) | Always allowed | `CROUCH` |
| **ANY GROUNDED** | `Z` (Toggle) | Universal toggle; applies momentum decay if sprinting | `PRONE` |
| **PRONE** | `Z` (Toggle) | Upward sweep: Stand if clear, else Crouch if clear | `STAND` / `CROUCH` |
| **SPRINT / TAC_SPRINT** | `C` (Toggle) | Grounded & forward momentum | `SLIDE` |
| **SPRINT / TAC_SPRINT** | Release `WASD` | Input vector magnitude $\approx 0$ | `STAND / WALK` |
| **SLIDE** | `Space` | **Slide Cancel** (Aborts momentum, resets slide cooldown) | `STAND` |
| **SLIDE** | `C` or $\|\vec{v}\| < 2.5$ | Natural speed decay or crouch toggle | `CROUCH` |
| **IN_AIR** | Trace obstacle | $0.6\text{ m} \le H_{\text{mantle}} \le 1.8\text{ m}$ & top clear | `MANTLE` |

---

## 7. Procedural Camera Kinematics (Weight & Inertia)

Rather than artificial screen shake, camera immersion relies on restrained, mathematically sound procedural offsets:
* **Crouch/Prone Transitions:** Smooth damp camera pivot height using critically damped spring ($k = 18\text{ rad/s}$):
  $$y_{\text{cam}}(t) = \text{DampedSpring}(y_{\text{cam}}, y_{\text{target}}, v_{\text{spring}}, \zeta=1.0, \omega=18.0)$$
* **Slide Dutch Roll:** Apply slight procedural roll ($\theta_{\text{roll}} \approx -2.5^\circ$) in the direction of lateral momentum.
* **Head Bobbing:** Dual-axis Lissajous curve applied to `CameraPivot` when grounded and moving:
  $$x_{\text{bob}} = A_x \cos(\omega_{\text{bob}} \cdot t)$$
  $$y_{\text{bob}} = A_y \sin(2 \omega_{\text{bob}} \cdot t)$$
  where $\omega_{\text{bob}}$ scales proportionally with linear speed.
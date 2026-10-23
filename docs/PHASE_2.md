# Phase 2: Locomotion State Machine, Traversal Math & Kinematic Specifications

Implementing an authentic, weighty MW2019-grade character controller in Three.js and Rapier3D requires solving non-trivial kinematic, trigonometric, and collision-sweeping problems. The following architectural and mathematical refinements must be enforced.

---

## 1. Stance Height Management & Clearance Sweeps

Dynamically changing the Rapier character collider height (Standing: $1.8\text{ m}$, Crouch: $1.2\text{ m}$, Prone: $0.4\text{ m}$) introduces clipping and stuck states under low ceilings.

### Requirements:
* **Ceiling Clearance Check:** Before executing any transition from a lower stance to a higher stance (e.g., `PRONE -> CROUCH`, `CROUCH -> STAND`, `SLIDE -> STAND`), fire an upward raycast or swept shape from the current capsule base:
  $$\text{Target Clearance} = H_{\text{target}} + \epsilon \quad (\epsilon = 0.05\text{ m})$$
  If an obstacle intersects within this distance, the stance transition **must be rejected** and the player forced to remain in the lower stance.
* **Capsule Anchor Continuity:** The bottom hemisphere of the capsule must remain pinned to ground contact during height changes; scale or shift the capsule center upward relative to the feet origin to prevent falling through floors or jittering.

---

## 2. Sliding Physics & Friction Model

Sliding in MW2019 is momentum-dependent, directional-locked, and affected by surface incline.

### Mathematical Formulation:
1. **Entry Threshold:** Triggered only if player is in `SPRINT` or `TACTICAL_SPRINT` and grounded:
   $$\vec{v}_{\text{entry}} = \vec{v}_{\text{current}} \times 1.25$$
2. **Directional Steering Damping:** While sliding, mouse yaw must not instantly redirect linear momentum. The velocity vector dampens toward the camera forward vector at a restricted angular rate ($\omega_{\text{max}} \approx 1.5\text{ rad/s}$).
3. **Incline & Friction Dynamics:** During fixed tick $\Delta t$:
   $$\vec{a}_{\text{friction}} = -\mu_{\text{slide}} \cdot g \cdot \hat{v}$$
   $$\vec{a}_{\text{slope}} = g \cdot (\hat{n}_{\text{ground}} \times \hat{v}) \times \hat{n}_{\text{ground}}$$
   $$\vec{v}(t + \Delta t) = \vec{v}(t) + (\vec{a}_{\text{friction}} + \vec{a}_{\text{slope}}) \Delta t$$
4. **Exit Threshold:** When $\|\vec{v}\| < v_{\text{min\_slide}} \approx 2.5\text{ m/s}$ or slide duration exceeds $1.4\text{ s}$, automatically drop into `CROUCH` stance.

---

## 3. Mantle & Vault Traversal (Dual-Ray Detection)

Obstacle traversal cannot rely on simple physics collisions. It requires a deterministic multi-ray scanner and procedural root-motion translation.

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

---

## 4. Ladder Interaction Kinematics

Ladder traversal requires overriding gravity and projecting user movement inputs directly onto the ladder plane.

### Kinematics:
* **Detection:** Raycast or volume overlap with `GROUP_ENVIRONMENT` labeled as ladder tag.
* **Input Projection:** Zero out standard gravity. Vertical climbing velocity is driven by:
  $$v_y = (\vec{input}_{\text{WASD}} \cdot \vec{d}_{\text{ladder\_fwd}}) \times v_{\text{climb}}$$
* **Dismount Triggers:**
  - Reaching the top ledge (transition to small forward vault step).
  - Pressing `SPACE` (jump backward off ladder with impulse $-\vec{n}_{\text{ladder}} \times 4.0\text{ m/s}$).

---

## 5. Movement Finite State Machine (FSM)

To prevent invalid physics overlapping, player state must be enforced by a strict FSM:

```
[STAND] <=========> [CROUCH] <=========> [PRONE]
   │                   ▲
   ├──> [SPRINT] ──────┘ (Crouch key pressed)
   │       │
   │       └──> [TACTICAL_SPRINT] ──> [SLIDE]
   │                                     │
   ├──> [JUMP / IN_AIR]                  │ (Velocity < 2.5 m/s)
   │          │                          ▼
   │          └──> [MANTLE] ───────> [CROUCH]
   └──> [LADDER]
```

### State Constraints:
* **Tactical Sprint Condition:** Valid only when moving forward ($\vec{v}_{\text{input}} \cdot \hat{d}_{\text{look}} \ge \cos(25^\circ) \approx 0.90$). Maximum duration $3.0\text{ s}$, followed by an exhaustion cooldown ($4.0\text{ s}$) where only regular sprint is allowed.
* **Air Control Damping:** Horizontal acceleration while `IN_AIR` is limited to $20\%$ of grounded acceleration to prevent unrealistically sharp mid-air redirection.

---

## 6. Procedural Camera Kinematics (Weight & Inertia)

Rather than artificial screen shake, camera immersion relies on restrained, mathematically sound procedural offsets:
* **Crouch/Prone Transitions:** Smooth damp camera pivot height using critically damped spring ($k = 18\text{ rad/s}$):
  $$y_{\text{cam}}(t) = \text{DampedSpring}(y_{\text{cam}}, y_{\text{target}}, v_{\text{spring}}, \zeta=1.0, \omega=18.0)$$
* **Slide Dutch Roll:** Apply slight procedural roll ($\theta_{\text{roll}} \approx -2.5^\circ$) in the direction of lateral momentum.
* **Head Bobbing:** Dual-axis Lissajous curve applied to `CameraPivot` when grounded and moving:
  $$x_{\text{bob}} = A_x \cos(\omega_{\text{bob}} \cdot t)$$
  $$y_{\text{bob}} = A_y \sin(2 \omega_{\text{bob}} \cdot t)$$
  where $\omega_{\text{bob}}$ scales proportionally with linear speed.
# Phase 7: Team Deathmatch, Dynamic Respawn Evaluation & Military HUD Architecture

Implementing a competitive, bug-free Team Deathmatch (TDM) match loop in a browser WebGL/Rapier3D runtime requires deterministic match lifecycle states, zero-DOM performance budgeting for the HUD, mathematical spawn point validation to prevent spawn camping, and dynamic minimap acoustic pings. The following specifications must be enforced.

---

## 1. Match State Machine & Lifecycle Flow

To decouple UI menus, player controls, and simulation states, the match must be governed by an authoritative `MatchStateMachine`:

```
[PRE_MATCH] (Loadout selection & bot spawn warmup)
     │
     ▼
[IN_PROGRESS] <======== Esc Key ========> [PAUSED]
     │                                     (Pointer lock released, timeScale = 0)
     ├── Match Time Expired OR Score Limit Reached
     ▼
[POST_MATCH] (Scoreboard, MVP, Winner Declaration, and Input Lockout)
```

### State Constraints:
* **`PAUSED`:** Sets simulation delta $\Delta t = 0$, unbinds WASD input listeners, unlocks `document.exitPointerLock()`, and mounts the modal pause menu without dropping Three.js textures or physics memory.
* **`IN_PROGRESS`:** Re-acquires Pointer Lock upon clicking "Resume" or entering canvas bounds. Fixed-timestep Rapier loop resumes deterministically.
* **Victory / Defeat Conditions:**
  * Score limit reached: $Score_{\text{team}} \ge Score_{\text{target}}$ (e.g., 50 or 75 kills).
  * Time expired ($t_{\text{remaining}} \le 0$): Team with higher score wins. If scores are equal, resolve to `DRAW`.

---

## 2. Dynamic Spawn Point Selection Algorithm

Because tactical shooters feature fast TTK and **no temporary invulnerability shields**, raw random spawning causes instant spawn traps. Every candidate spawn point $\vec{S}_i$ from the map metadata is evaluated in real time:

### Scoring Formulation:
$$\text{Score}(S_i) = w_{\text{enemy}} \cdot D_{\text{enemy\_min}} - w_{\text{los}} \cdot \text{InSightLine} + w_{\text{ally}} \cdot D_{\text{ally\_avg}} - w_{\text{danger}} \cdot \text{DangerScore}$$

Where:
* $D_{\text{enemy\_min}} = \min_{e \in \text{Enemies}} \|\vec{S}_i - \vec{P}_e\|$: If $D_{\text{enemy\_min}} < 15.0\text{ m}$, the spawn point is **disqualified** ($\text{Score} = -\infty$).
* $\text{InSightLine} \in \{0, 1\}$: Raycast test from all active enemy eye anchors to $\vec{S}_i + \vec{u}_{\text{up}} \cdot 1.5\text{ m}$. If visible, $\text{InSightLine} = 1$ (Weight: $w_{\text{los}} = 1000.0$, strictly penalizing open sightlines).
* $D_{\text{ally\_avg}}$: Promotes regrouping with teammates while discouraging solitary spawn isolation (Weight: $w_{\text{ally}} = 0.5$).
* $\text{DangerScore} = \sum_{g \in \text{ActiveGrenades}} \frac{1}{\|\vec{S}_i - \vec{P}_g\| + 0.1}$: Heavily penalizes points near active frag fuses or recent elimination coordinates.

The candidate node with the maximum positive score is selected:
$$\vec{S}_{\text{optimal}} = \arg\max_{S_i} \text{Score}(S_i)$$

---

## 3. High-Performance HUD Architecture (Zero-DOM Reflow)

Updating multiple HTML DOM elements (such as `<div>` coordinates or border widths) at 60–120 Hz triggers continuous browser layout repaints and garbage collection stalls.

### Rendering Architecture:
* **Canvas Overlay / Direct Transform Layer:**
  * Dynamic elements (Crosshair, Minimap, Compass) are drawn on a single 2D overlay `<canvas>` or transformed using hardware-accelerated CSS (`transform: translate3d(...)` and direct `node.nodeValue` mutations).
* **Kill Feed Engine:**
  * FIFO queue capped at 4 simultaneous entries.
  * Entries fade out via CSS opacity transitions over $4.0\text{ s}$ and are recycled through an object pool.

---

## 4. Dynamic Crosshair Geometry

The crosshair lines adjust dynamically according to stance, horizontal velocity, and weapon recoil:

### Mathematical Formulation:
$$\text{Gap}(t) = \text{BaseGap} + k_{\text{move}} \cdot \|\vec{v}_{\text{horizontal}}\| + k_{\text{recoil}} \cdot \theta_{\text{kick}} - k_{\text{stance}}$$

Where:
* $\text{BaseGap} = 6.0\text{ px}$.
* $k_{\text{move}} = 1.8\text{ px/(m/s)}$.
* $k_{\text{recoil}} = 12.0\text{ px/deg}$ (driven by the active viewmodel recoil offset).
* $k_{\text{stance}} = 2.0\text{ px}$ (Crouch) or $4.0\text{ px}$ (Prone).
* **ADS Behavior:** While transitioning to Aim Down Sights, crosshair opacity $\alpha_{\text{crosshair}}$ interpolates to $0.0$ over $0.12\text{ s}$.

---

## 5. Tactical Minimap & Acoustic Ping Rules

To enforce fair competitive intelligence and prevent illegitimate enemy wallhacks:

1. **Teammates:** Displayed continuously with position and orientation arrow.
2. **Enemies (Acoustic Ping):**
   * Default state: Hidden.
   * When firing an unsuppressed weapon: Emits a red blip at enemy coordinates.
   * Direct Line of Sight: Appears as an active blip while visible to any ally.
   * Decay Model: Blips fade out linearly over $2.5\text{ s}$ via an alpha curve:
     $$\alpha_{\text{blip}}(t) = \max\left(0, 1 - \frac{t_{\text{since\_ping}}}{2.5}\right)$$
3. **Map Coordinate Transformation:**
   $$\begin{bmatrix} x_{\text{hud}} \\ y_{\text{hud}} \end{bmatrix} = \begin{bmatrix} \cos(\theta_{\text{cam}}) & -\sin(\theta_{\text{cam}}) \\ \sin(\theta_{\text{cam}}) & \cos(\theta_{\text{cam}}) \end{bmatrix} \begin{bmatrix} (x_{\text{world}} - x_{\text{player}}) \cdot s \\ (z_{\text{world}} - z_{\text{player}}) \cdot s \end{bmatrix}$$
   where $s$ is the minimap zoom scale factor.

---

## 6. Scoring Matrix & Kill Resolution

Events dispatch through an authoritative `CombatEventBus`:

| Event | Points Awarded | Condition |
|---|---|---|
| **Standard Elimination** | $+100$ | Final lethal shot landed on enemy |
| **Headshot Bonus** | $+25$ | Lethal shot hit `HEAD` hitbox collider |
| **Assist** | $+25\text{--}50$ | Dealt $\ge 25\text{ HP}$ damage to an enemy eliminated by a teammate within $4.0\text{ s}$ |
| **Longshot** | $+25$ | Lethal hit distance $d \ge 35.0\text{ m}$ |

Death cycle enforces a $3.5\text{ s}$ respawn timer during which the camera transitions to an elevated third-person orbit over the player's defeat coordinates before triggering $\vec{S}_{\text{optimal}}$ respawn.
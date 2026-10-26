# Phase 5: Advanced Tactical Bot AI, Spatial Perception & Squad Coordination

Implementing authentic, competitive tactical AI in a single-threaded WebGL/Rapier3D runtime requires balancing high-frequency movement against computationally expensive spatial queries. To avoid frame drops while preventing simplistic or "cheating" AI behavior, the following mathematical formulations, spatial evaluation algorithms, and scheduling architectures must be enforced.

---

## 1. Computational Budgeting & Time-Slicing Architecture

Running field-of-view raycasts, pathfinding, and cover evaluations for 6 to 10 bots on every 60 Hz frame will cause significant frame rate degradation. Processing must be decoupled into three frequency tiers:

```
[ Tier 1: Fixed Tick (60 Hz) ] -> Kinematic translation, physics collisions, steering forces
[ Tier 2: Sensory Tick (10 Hz) ] -> FOV checks, line-of-sight raycasts, auditory parsing
[ Tier 3: Tactical Tick (2 Hz) ]  -> Behavior tree evaluation, A* path planning, cover scoring
```

### Time-Slicing Rules:
- **Round-Robin Spatial Queries:** Only a single bot may invoke a full $A^*$ path reconstruction or comprehensive cover scan per frame.
- **Raycast Throttling:** Environmental visibility checks use a cached query token with a minimum refresh latency:
  $$\Delta t_{\text{vision}} \ge 100\text{ ms}$$
- **Path Caching:** Paths are recalculated only upon waypoint invalidation, target position deviation $> 4.0\text{ m}$, or environmental barrier destruction (`ON_ENVIRONMENT_MUTATED`).

---

## 2. Sensory Perception Models

Bots must perceive the world through deterministic physical and trigonometric checks without omniscience.

### 2.1 Optical Perception (Field-of-View & Obstruction)
A target at position $\vec{P}_{\text{target}}$ is optically perceived by a bot at $\vec{P}_{\text{bot}}$ with eye height $y_{\text{eye}} = 1.6\text{ m}$ and forward look vector $\hat{d}_{\text{forward}}$ if and only if all three conditions hold:

1. **Distance Gate:**
   $$\|\vec{P}_{\text{target}} - \vec{P}_{\text{bot}}\| \le R_{\text{max\_view}} \quad (40.0\text{ m})$$
2. **Horizontal Angle Gate:**
   $$\frac{(\vec{P}_{\text{target}} - \vec{P}_{\text{bot}}) \cdot \hat{d}_{\text{forward}}}{\|\vec{P}_{\text{target}} - \vec{P}_{\text{bot}}\|} \ge \cos\left(\frac{\theta_{\text{FOV}}}{2}\right) \quad (\theta_{\text{FOV}} = 110^\circ)$$
3. **Raycast Clearance:**
   A physics raycast from $\vec{P}_{\text{bot}} + (0, y_{\text{eye}}, 0)$ to the target chest hitbox intersects no `GROUP_ENVIRONMENT` colliders before hitting the target.

### 2.2 Acoustic Perception & Sound Attenuation
Weapons, footsteps, and explosive barriers emit auditory pulses registered onto an `AcousticDispatcher`. A sound with origin $\vec{P}_{\text{sound}}$ and source intensity $I_0$ is audible if received intensity exceeds threshold $I_{\text{threshold}} = 0.05$:

$$I_{\text{received}} = \frac{I_0}{1.0 + \alpha_{\text{decay}} \cdot \|\vec{P}_{\text{sound}} - \vec{P}_{\text{bot}}\|^2} \cdot \prod \beta_{\text{occlusion}}$$

* $\beta_{\text{occlusion}} = 0.4$ for each solid barrier intersecting the direct sound path.
* **Perceived Vector with Uncertainty:** Instead of exact coordinates, the bot receives an estimated vector containing directional gaussian noise:
  $$\vec{P}_{\text{perceived}} = \vec{P}_{\text{sound}} + \mathcal{N}(0, \sigma^2) \cdot \hat{u}_{\text{tangent}}, \quad \sigma \propto \|\vec{P}_{\text{sound}} - \vec{P}_{\text{bot}}\|$$

---

## 3. Tactical Cover Evaluation & Scoring Formula

When under fire, bots search nearby `TacticalNode` candidates within search radius $R_{\text{search}} \le 18\text{ m}$ and score each candidate node $k$:

$$\text{Score}(k) = w_{\text{occ}} \cdot S_{\text{occ}}(k) - w_{\text{dist}} \cdot D_{\text{bot}}(k) + w_{\text{flank}} \cdot \Phi_{\text{flank}}(k) - w_{\text{threat}} \cdot D_{\text{threat}}(k)$$

### Component Definitions:
1. **Occlusion Binary ($S_{\text{occ}}$):** 
   $$S_{\text{occ}}(k) = \begin{cases} 1.0 & \text{if ray}(\vec{P}_{\text{threat}}, \vec{P}_k) \text{ intersects geometry} \\ 0.0 & \text{otherwise} \end{cases}$$
2. **Normalized Distance to Bot ($D_{\text{bot}}$):**
   $$D_{\text{bot}}(k) = \frac{\|\vec{P}_k - \vec{P}_{\text{bot}}\|}{R_{\text{search}}}$$
3. **Flank Angle Advantage ($\Phi_{\text{flank}}$):**
   $$\Phi_{\text{flank}}(k) = \max\left(0, \hat{d}_{\text{threat\_view}} \cdot \frac{\vec{P}_k - \vec{P}_{\text{threat}}}{\|\vec{P}_k - \vec{P}_{\text{threat}}\|}\right)$$
   (Favors positions outside the threat's forward cone of view).
4. **Weights:** $w_{\text{occ}} = 5.0$, $w_{\text{dist}} = 1.5$, $w_{\text{flank}} = 2.0$, $w_{\text{threat}} = 1.0$.

The candidate node maximizing $\text{Score}(k)$ is selected. If no node provides occlusion ($S_{\text{occ}} = 0$), the bot defaults to an aggressive suppression or retreat stance.

---

## 4. Humanized Aim Mechanics & Angular Clamping

Bots must not snap instantly onto targets. Aim kinematics are governed by angular velocity limits and distance-scaled spread.

### Aim Kinematics:
1. **Angular Slew Rate Clamping:** The look vector rotates toward the target vector $\hat{d}_{\text{target}}$ at maximum rate $\omega_{\text{max}}$:
   $$\theta_{\text{delta}} = \arccos(\hat{d}_{\text{current}} \cdot \hat{d}_{\text{target}})$$
   $$\hat{d}(t + \Delta t) = \text{Slerp}\left(\hat{d}_{\text{current}}, \hat{d}_{\text{target}}, \min\left(1.0, \frac{\omega_{\text{max}} \cdot \Delta t}{\theta_{\text{delta}}}\right)\right)$$
2. **Aim Dispersion (Distance Scaling):** When firing, an offset angle $\theta_{\text{err}}$ is injected into the firing ray:
   $$\theta_{\text{err}} \sim \mathcal{N}\left(0, \kappa_{\text{difficulty}} \cdot \sqrt{D_{\text{target}}}\right)$$

---

## 5. Shared Squad Blackboard & Coordinated Roles

To simulate military teamwork, allied bots link to a shared `SquadBlackboard`.

```
                    ┌───────────────────────────┐
                    │      SquadBlackboard      │
                    │  - Threat Priority List   │
                    │  - LKP (Last Known Pos)   │
                    │  - Reserved Cover Nodes   │
                    └─────────────┬─────────────┘
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
[Bot 1: Assault]         [Bot 2: Support]           [Bot 3: Flank]
- Pushes LKP             - Suppressive Fire         - Takes Alternate Lane
- Closes distance        - Remains in Mid-Cover     - Attacks from Blindside
```

### Dynamic Role Allocation:
- **Assault:** Directly engages threat within optimal weapon range ($10\text{--}20\text{ m}$).
- **Support:** Holds secondary cover, fires continuous burst rounds to suppress enemy cover positions.
- **Flank:** Queries secondary navigation routes (e.g., Lane C while engagement occurs in Lane B) to achieve flank angle $> 60^\circ$.
- **Node Reservation:** When a bot claims a cover node, it flags the node in `SquadBlackboard` so allied bots filter it out during their search pass.

---

## 6. Local Separation & Collision Avoidance (RVO / Boids)

To prevent bots clustering or stacking inside narrow choke points and doorways ($W = 2.5\text{ m}$), a repulsive separation force is applied to kinematic horizontal velocity:

$$\vec{F}_{\text{sep}} = \sum_{j \ne i}^{N_{\text{allies}}} \frac{\vec{P}_i - \vec{P}_j}{\|\vec{P}_i - \vec{P}_j\|^2} \cdot k_{\text{sep}} \quad \left(\text{for } \|\vec{P}_i - \vec{P}_j\| < R_{\text{avoid}} = 1.8\text{ m}\right)$$

$$\vec{v}_{\text{final}} = \vec{v}_{\text{nav}} + \vec{F}_{\text{sep}}$$

---

## 7. Difficulty Calibration Parameters

| Parameter | Easy | Medium | Hard |
| :--- | :--- | :--- | :--- |
| **Reaction Latency ($t_{\text{react}}$)** | $550\text{--}700\text{ ms}$ | $300\text{--}400\text{ ms}$ | $150\text{--}220\text{ ms}$ |
| **Aim Slew Rate ($\omega_{\text{max}}$)** | $90^\circ/\text{s}$ | $180^\circ/\text{s}$ | $320^\circ/\text{s}$ |
| **Aim Dispersion Constant ($\kappa$)** | $0.08$ | $0.035$ | $0.012$ |
| **Cover Usage Frequency** | Low ($30\%$) | Balanced ($75\%$) | Strict ($95\%$) |
| **Acoustic Noise Deviation ($\sigma$)** | High ($\pm 8\text{ m}$) | Moderate ($\pm 3.5\text{ m}$) | Low ($\pm 1.0\text{ m}$) |
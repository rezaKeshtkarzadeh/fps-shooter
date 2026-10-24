# Phase 3: Weapon Architecture, Ballistics & Viewmodel Specifications

Building a weighty MW2019-style gunplay system in Three.js and Rapier3D requires deterministic raycasting, mathematical recoil recovery, procedural viewmodel kinematics, and compound hitboxes. The following specifications must be enforced.

---

## 1. Dual-Camera Viewmodel Pipeline (Anti-Clipping)

To eliminate weapon clipping through world geometry and maintain consistent FOV across different weapon scales:
- **Scene Separation:** Split rendering into two distinct camera passes sharing the same root transform:
  1. **World Camera:** Dynamic gameplay FOV ($70^\circ - 110^\circ$), standard near/far planes ($0.1\text{ m}$ to $1000\text{ m}$).
  2. **Viewmodel Camera:** Fixed rendering FOV ($60^\circ$), ultra-close near plane ($0.01\text{ m}$ to $10\text{ m}$).
- **Render Order:**
  ```typescript
  renderer.autoClear = false;
  renderer.clear();
  renderer.render(worldScene, worldCamera);
  renderer.clearDepth(); // Prevents weapon geometry from intersecting world colliders
  renderer.render(viewmodelScene, viewmodelCamera);
  ```

---

## 2. Compound Hitbox Hierarchy & Damage Multipliers

Characters and bots must not rely on single-capsule hit detection. Attach compound Rapier3D colliders to an authoritative entity hierarchy:

### Hitbox Layout & Multipliers:
| Zone | Collider Geometry | Collision Filter | Multiplier |
| :--- | :--- | :--- | :--- |
| **HEAD** | Sphere ($r = 0.18\text{ m}$) | `GROUP_HITSCAN` | $2.0\times$ |
| **TORSO** | Capsule ($r = 0.22\text{ m}, h = 0.55\text{ m}$) | `GROUP_HITSCAN` | $1.2\times$ |
| **STOMACH** | Box ($0.38 \times 0.25 \times 0.22\text{ m}$) | `GROUP_HITSCAN` | $1.0\times$ |
| **LIMBS** | Capsules (Arms: $r=0.09$, Legs: $r=0.12$) | `GROUP_HITSCAN` | $0.8\times$ |

*Note: Raycast queries must filter against `GROUP_HITSCAN`, record the closest impact point, resolve the specific child collider's zone tag, and compute final damage in a single authoritative pass.*

---

## 3. Distance-Dependent Damage Falloff

Damage scales smoothly across weapon-specific engagement brackets:

$$
\text{Dist} = \|\vec{P}_{\text{impact}} - \vec{P}_{\text{muzzle}}\|
$$

$$
t_{\text{drop}} = \text{clamp}\left(\frac{\text{Dist} - D_{\text{near}}}{D_{\text{far}} - D_{\text{near}}}, 0.0, 1.0\right)
$$

$$
\text{BaseDamage} = D_{\text{max}} - t_{\text{drop}} \cdot (D_{\text{max}} - D_{\text{min}})
$$

$$
\text{FinalDamage} = \text{BaseDamage} \times \text{Multiplier}_{\text{hitbox}}
$$

- $D_{\text{near}}$: Max-damage threshold distance.
- $D_{\text{far}}$: Minimum-damage threshold distance.

---

## 4. Procedural Recoil, Camera Kick & Elastic Recovery

Recoil operates on two layers: procedural viewmodel translation and rotational camera kick with recovery.

### Procedural Spring Kinematics (2nd Order):
$$
\vec{a}_{\text{spring}} = -k \cdot (\vec{x} - \vec{x}_{\text{target}}) - c \cdot \vec{v}
$$
$$
\vec{v}(t + \Delta t) = \vec{v}(t) + \vec{a}_{\text{spring}} \cdot \Delta t
$$
$$
\vec{x}(t + \Delta t) = \vec{x}(t) + \vec{v}(t + \Delta t) \cdot \Delta t
$$
*(Tuned parameters: Stiffness $k \approx 180$, Damping $c \approx 22$).*

### Camera Recoil Accumulation & Recovery:
- Each shot injects an instantaneous angular delta $(\Delta \theta_{\text{pitch}}, \Delta \theta_{\text{yaw}})$.
- Pitch kick follows a directional bias ($\theta_{\text{pitch}} > 0$), while yaw includes pseudo-random horizontal dispersion ($\theta_{\text{yaw}} \in [-\sigma, \sigma]$).
- **Elastic Recovery:** When trigger is released, accumulated kick $\vec{\theta}_{\text{accum}}$ interpolates back toward zero via damped spring:
  $$
  \vec{\theta}_{\text{accum}}(t + \Delta t) = \text{SmoothDamp}(\vec{\theta}_{\text{accum}}, \vec{0}, \omega_{\text{recovery}})
  $$
- *Guard Rule:* If player inputs active manual mouse look countering the kick, subtract the user input delta from $\vec{\theta}_{\text{accum}}$ to prevent downward over-correction.

---

## 5. Viewmodel Dynamics: Sway, Bob & ADS Transition

To achieve the weighty MW2019 tactile response, viewmodel positions are driven dynamically:

- **Mouse Sway (Lag):**
  $$
  \Delta \vec{R}_{\text{sway}} = \begin{pmatrix} -\text{Clamp}(\Delta y_{\text{mouse}} \cdot \alpha, -0.05, 0.05) \\ -\text{Clamp}(\Delta x_{\text{mouse}} \cdot \alpha, -0.05, 0.05) \\ \text{Clamp}(\Delta x_{\text{mouse}} \cdot \beta, -0.03, 0.03) \end{pmatrix}
  $$
- **ADS Interpolation (Aim Down Sights):**
  $$
  \vec{P}_{\text{viewmodel}} = \text{lerp}(\vec{P}_{\text{hip}}, \vec{P}_{\text{ads}}, t_{\text{ads}}), \quad t_{\text{ads}} \in [0, 1]
  $$
  $$
  \text{FOV}_{\text{world}} = \text{lerp}(\text{FOV}_{\text{base}}, \text{FOV}_{\text{weapon\_zoom}}, t_{\text{ads}})
  $$
  *(Use smoothstep curve for $t_{\text{ads}}$ over duration $\approx 0.18\text{ s} - 0.28\text{ s}$).*

---

## 6. FSM Integration & Action Guards

Weapons must strictly synchronize with the movement state machine (`MovementFSM`):

| Movement State | Weapon Behavior | Firing Allowed? |
| :--- | :--- | :--- |
| **STAND / WALK / CROUCH** | Normal Hipfire or ADS | **YES** |
| **SPRINT** | Weapon lowered ($-\vec{u}_{\text{up}} \cdot 0.1$, Pitch down $15^\circ$) | **NO** (Triggers Sprint-to-Fire delay) |
| **TACTICAL_SPRINT** | Weapon raised pointing up (MW2019 style) | **NO** (Triggers longer recovery delay) |
| **SLIDE** | Hipfire allowed, ADS restricted/penalized | **YES** (Increased spread) |
| **MANTLE / LADDER** | Weapon holstered/hidden | **NO** |

- **Sprint-to-Fire Delay:** Transitioning from `SPRINT` to firing requires a hardware cooldown ($t_{\text{s2f}} \approx 200\text{ ms}$) before the first shot raycast can fire.
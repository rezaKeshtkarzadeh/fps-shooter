# Phase 6: Health Regeneration, Tactical Loadouts & Projectile Ballistics

Implementing robust survival mechanics, throwables, and equipment parity between the player and tactical AI bots requires deterministic physical continuous collision detection (CCD), non-linear health recovery, multi-point blast wave occlusion, and optical-acoustic flashbang degradation models. The following engineering specifications must be enforced.

## 1. Projectile Kinematics & Continuous Collision Detection (CCD)

Grenades are fast-moving, small-radius rigid bodies ($v_0 \approx 18\text{--}24\text{ m/s}, r \approx 0.08\text{ m}$). Standard discrete collision queries will cause tunneling through thin walls and geometry seams.

### Physics Requirements:
* **Collider Specifications:** `RAPIER.ColliderDesc.ball(0.08)` configured with:
  * Restitution: $e = 0.42$ (elastic bounce decay).
  * Friction: $\mu = 0.65$ (stops rolling within 1–2 bounces).
  * Linear Damping: $d_L = 0.15$.
  * Angular Damping: $d_A = 0.35$.
  * **Continuous Collision Detection (CCD):** Must explicitly invoke `colliderDesc.setCcdEnabled(true)` and dynamic rigid body creation to eliminate high-velocity wall clipping.
* **Launch Velocity Formulation:**
  $$\vec{v}_{\text{throw}} = (\hat{d}_{\text{look}} \cdot \cos(10^\circ) + \hat{u}_{\text{up}} \cdot \sin(10^\circ)) \times v_{\text{launch}} + \vec{v}_{\text{thrower\_horizontal}}$$
  where $v_{\text{launch}} = 20.0\text{ m/s}$ (Frag) or $24.0\text{ m/s}$ (Flash), factoring in thrower horizontal velocity momentum.

---

## 2. Multi-Point Blast Wave & Occlusion Tracing (Frag Grenade)

Radial damage cannot rely on a single center-point raycast, as low cover (waist-high walls) would either block damage entirely or ignore the exposed head.

### Blast Dynamics:
* **Fuse Timer:** $t_{\text{fuse}} = 3.25\text{ s}$ from throw initialization.
* **Blast Radius:** $R_{\text{blast}} = 7.5\text{ m}$.
* **Damage Curve Formulation:**
  For an unoccluded distance $d \le R_{\text{blast}}$:
  $$Damage_{\text{raw}}(d) = Damage_{\text{max}} \cdot \left(1 - \frac{d}{R_{\text{blast}}}\right)^2$$
  where $Damage_{\text{max}} = 140\text{ HP}$ (lethal within $d \le 3.2\text{ m}$).

### Multi-Point Occlusion Algorithm:
For each damageable entity within $R_{\text{blast}}$, fire three separate raycasts from the explosion epicenter $\vec{P}_{\text{exp}}$ to:
1. Head Anchor: $\vec{P}_{\text{target}} + \vec{u}_{\text{up}} \cdot (H - 0.1\text{ m})$ (Weight: $w_{\text{head}} = 0.35$)
2. Torso Anchor: $\vec{P}_{\text{target}} + \vec{u}_{\text{up}} \cdot (0.6 \cdot H)$ (Weight: $w_{\text{torso}} = 0.45$)
3. Feet Anchor: $\vec{P}_{\text{target}} + \vec{u}_{\text{up}} \cdot 0.1\text{ m}$ (Weight: $w_{\text{feet}} = 0.20$)

$$\text{ExposureRatio} = \sum_{k \in \{\text{head, torso, feet}\}} w_k \cdot [1 - \text{RayBlocked}(\vec{P}_{\text{exp}}, \vec{P}_k)]$$
$$Damage_{\text{final}} = Damage_{\text{raw}}(d) \cdot \text{ExposureRatio}$$

---

## 3. Optical & Acoustic Flashbang Model

Flashbangs degrade combat capability through visual whitewash and acoustic disorientation (tinnitus). Both players and AI bots must obey identical degradation curves.

### Exposure Formulation:
1. **Distance Attenuation ($R_{\text{flash}} = 14.0\text{ m}$):**
   $$F_{\text{dist}} = \text{clamp}\left(1 - \frac{d}{R_{\text{flash}}}, 0, 1\right)$$
2. **Angular Facing Attenuation:**
   Let $\hat{d}_{\text{look}}$ be the receiver's look vector and $\hat{d}_{\text{toFlash}} = \frac{\vec{P}_{\text{flash}} - \vec{P}_{\text{eye}}}{\|\vec{P}_{\text{flash}} - \vec{P}_{\text{eye}}\|}$.
   $$\cos(\theta) = \hat{d}_{\text{look}} \cdot \hat{d}_{\text{toFlash}}$$
   $$F_{\text{angle}} = \text{clamp}\left(\frac{\cos(\theta) + 1}{2}, 0.25, 1.0\right)$$
   *(Looking completely away still inflicts $25\%$ severity via acoustic disorientation).*
3. **Occlusion Check:**
   Fire direct raycast $\vec{P}_{\text{flash}} \to \vec{P}_{\text{eye}}$ against `GROUP_ENVIRONMENT`. If occluded, $F_{\text{occlusion}} = 0$.
4. **Total Flash Severity:**
   $$S_{\text{flash}} = F_{\text{dist}} \times F_{\text{angle}} \times F_{\text{occlusion}}$$

### Gameplay Impact:
* **Player:** Full-screen whiteout opacity $\alpha = S_{\text{flash}}$, decaying non-linearly over duration $T_{\text{flash}} = 4.5 \cdot S_{\text{flash}}\text{ s}$, accompanied by high-pitch tinnitus and muffled environmental audio.
* **AI Bots:** When $S_{\text{flash}} > 0.3$:
  * Vision sensory update tick disabled for $T_{\text{flash}}$.
  * Aim slew speed reduced by $80\%$.
  * State forced into blind retreat or static crouched hip-fire suppression.

---

## 4. Health Kinematics & Regeneration Model

To adhere strictly to tactical shooter principles, no supplementary armor shields exist. TTK is deterministic, and recovery occurs only through disengagement.

### Mathematical Formulation:
* **Max Health:** $HP_{\text{max}} = 100\text{ HP}$.
* **Out-of-Combat Delay ($T_{\text{regen\_delay}}$):** $5.0\text{ s}$.
* **Regeneration Rate ($R_{\text{regen}}$):** $35.0\text{ HP/s}$.
* **State Logic:**
  * Any inbound damage resets the regen timer: $t_{\text{since\_last\_damage}} = 0.0\text{ s}$.
  * When $t_{\text{since\_last\_damage}} \ge T_{\text{regen\_delay}}$ and $HP < HP_{\text{max}}$:
    $$HP(t + \Delta t) = \min(HP_{\text{max}}, HP(t) + R_{\text{regen}} \cdot \Delta t)$$
* **Vignette & Audio Feedback:**
  * When $HP < 40$: Trigger pulsed red edge vignette, desaturate peripheral color, and trigger heartbeat audio loop ($f_{\text{pulse}} \propto \frac{100 - HP}{60}$).
  * Vignette opacity fades out linearly as $HP$ recovers above $75$.

---

## 5. Preset Loadout Configurations & Equipment Caps

Data-driven class templates define initial loadouts, equipment cooldowns, and pickup constraints.

```typescript
export interface LoadoutConfig {
  id: string;
  name: string;
  primaryWeaponId: 'M4A1' | 'MP5' | 'AX50';
  secondaryWeaponId: 'P1911';
  equipment: {
    fragCount: number;      // Default: 1, Max: 2
    flashCount: number;     // Default: 2, Max: 2
    throwCooldown: number;  // 1.2s between throws
  };
  reserveAmmo: {
    primary: number;        // e.g., M4: 180, MP5: 150, AX50: 30
    secondary: number;      // e.g., 1911: 45
  };
}
```

### Preset Classes:
1. **Assault:** M4A1 ($30/180$) + 1911 ($15/45$) | 1 Frag, 2 Flash.
2. **Breacher (CQB):** MP5 ($30/150$) + 1911 ($15/45$) | 2 Frag, 1 Flash.
3. **Marksman:** AX-50 ($5/30$) + 1911 ($15/45$) | 1 Frag, 2 Flash.

---

## 6. Pickup Lifecycle & Spatial Overlap Queries

Discarded ammo caches and equipment dropped upon death must not bloat memory or stall the physics tick.

* **Sensor Colliders:** Pickups use `RAPIER.ColliderDesc.cuboid(0.3, 0.2, 0.3).setSensor(true)` with collision group `GROUP_PROJECTILE`.
* **Collection Policy:** Passive proximity sweep on player/bot base position. Collection instantly replenishes:
  * Primary ammo: $+1$ reserve magazine.
  * Secondary ammo: $+1$ reserve magazine.
  * Equipment: $+1$ Frag or Flash (subject to maximum loadout caps).
* **Despawn Timer:** Pickups despawn automatically after $30.0\text{ s}$ via an unlinked pool manager to prevent GC overhead.
# Phase 8: Tactical Audio Architecture & First-Person Animation Pipeline

Achieving MW2019-grade tactile combat in WebGL requires deterministic spatial acoustics, Web Audio API context lifecycle management, procedural viewmodel animation blending, and acoustic ray-traced occlusion linked to bot perception. The following specifications must be enforced.

---

## 1. Web Audio Context Lifecycle & Browser Autoplay Policy

Browsers strictly block the `AudioContext` from running prior to an explicit user gesture. Unhandled autoplay policies cause silent matches, desynchronized sound cues, or broken promises.

### Lifecycle Architecture:
* **Lazy Initialization & Gesture Binding:**
  * Initialize an authoritative `AudioManager` instance in a `suspended` state:
    ```typescript
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    ```
  * Bind a global, one-time listener across `pointerdown`, `keydown`, and Pointer Lock requests (`canvas.requestPointerLock`):
    ```typescript
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    ```
* **Audio Bus Architecture:**
  Direct routing through grouped `GainNode` sub-mixes before feeding into `audioCtx.destination`:
  ```
  [Source Nodes: Shots, Steps, Voices]
            │
            ├──> [Master Gain] ──────> [audioCtx.destination]
            │         ▲
            │         ├── [SFX Bus Gain] (Weapons, Explosions, Footsteps)
            │         ├── [Voice Bus Gain] (Callouts & Radio)
            │         └── [UI Bus Gain] (Hitmarkers, Score alerts)
  ```
* **Strict Rule:** **No combat background music.** The soundscape must prioritize environmental realism, threat identification, and acoustic clarity.

---

## 2. 3D Spatial Audio & Distance Attenuation Models

Every non-player sound (enemy footsteps, gunshots, explosions, ricochets) must be spatialize using Web Audio `PannerNode` with HRTF panning.

### Panning Configuration:
* `panningModel`: `'HRTF'` (Head-Related Transfer Function for vertical, lateral, and rear differentiation).
* `distanceModel`: `'inverse'`.

### Attenuation Formulation (Inverse Distance Clamped):
$$Gain(d) = \text{clamp}\left(\frac{d_{\text{ref}}}{d_{\text{ref}} + \text{rolloff} \cdot (\max(d, d_{\text{ref}}) - d_{\text{ref}})}, 0, 1\right)$$

### Acoustic Profiles:
1. **Footsteps:**
   * $d_{\text{ref}} = 2.0\text{ m}, d_{\text{max}} = 22.0\text{ m}, \text{rolloff} = 1.4$.
2. **Unsuppressed Gunfire:**
   * $d_{\text{ref}} = 8.0\text{ m}, d_{\text{max}} = 85.0\text{ m}, \text{rolloff} = 0.8$.
3. **Explosions (Frag Grenades):**
   * $d_{\text{ref}} = 12.0\text{ m}, d_{\text{max}} = 120.0\text{ m}, \text{rolloff} = 0.6$.

---

## 3. Ray-Traced Acoustic Occlusion (Wall Muffling)

Combatants behind structural cover must not be heard with open-air clarity. Sound passing through physical geometry experiences high-frequency attenuation and gain drop.

### Occlusion Algorithm:
For any active 3D sound event located at $\vec{P}_{\text{sound}}$ relative to player ear position $\vec{P}_{\text{listener}}$:
1. Fire a single direct raycast $\vec{P}_{\text{sound}} \to \vec{P}_{\text{listener}}$ through Rapier3D against `GROUP_ENVIRONMENT`.
2. **If unoccluded (Direct Line of Sight):**
   * Biquad filter cutoff frequency: $f_{\text{cutoff}} = 20000\text{ Hz}$ (bypass / transparent).
   * Direct transmission gain: $k_{\text{occlusion}} = 1.0$.
3. **If occluded (Through Geometry):**
   * Insert a `BiquadFilterNode` (`type: 'lowpass'`):
     $$f_{\text{cutoff}} = 750\text{ Hz} \quad (\text{muffled low-end thump})$$
   * Reduce perceived gain:
     $$k_{\text{occlusion}} = 0.55$$

---

## 4. Dynamic Surface Footsteps & Cadence Engine

Footstep timing and audio timbre are coupled to movement stance and ground collision tags.

### Ground Material Query:
A vertical downward raycast ($L = 0.2\text{ m}$) from the bottom of the character capsule retrieves the surface tag:
* `CONCRETE`: Sharp, high-frequency slap.
* `METAL_GRATE`: Resonant, high-pitch metallic clank.
* `DIRT`: Dull, low-frequency crunch.
* `WOOD`: Hollow mid-tone impact.

### Cadence Timing (Step Intervals):
| Locomotion State | Step Interval ($\Delta t_{\text{step}}$) | Sound Radius ($R_{\text{hear}}$) |
|---|---|---|
| **WALK** | $520\text{ ms}$ | $10.0\text{ m}$ |
| **SPRINT** | $340\text{ ms}$ | $18.0\text{ m}$ |
| **TACTICAL_SPRINT** | $250\text{ ms}$ | $28.0\text{ m}$ |
| **CROUCH** | $680\text{ ms}$ | $4.5\text{ m}$ (near-silent) |

Each step event dispatches an acoustic ping directly into the AI `ThreatBlackboard` from Phase 5.

---

## 5. Procedural First-Person Viewmodel Kinematics

Rather than relying entirely on heavy baked bone animations, the viewmodel reacts dynamically to movement physics, falling inertia, and aiming states via spring-damper equations.

### 1. Landing Impact (Drop Punch):
When transitioning from `IN_AIR` to grounded with downward velocity $v_{\text{fall}}$:
$$\Delta y_{\text{drop}} = -\min(v_{\text{fall}} \cdot 0.035, 0.16\text{ m})$$
The viewmodel snaps down and returns to equilibrium via a critically damped spring ($\zeta = 1.0, \omega = 22\text{ rad/s}$):
$$\vec{p}(t + \Delta t) = \text{DampedSpring}(\vec{p}, \vec{p}_{\text{rest}}, \vec{v}_{\text{spring}}, \zeta=1.0, \omega=22.0)$$

### 2. Movement Sway & Roll:
* While walking or sprinting, add procedural roll banking:
  $$\theta_{\text{roll}} = -\text{clamp}(v_{\text{lateral}} \cdot 0.015, -0.05, 0.05)\text{ rad}$$
* In `TACTICAL_SPRINT`, translate the viewmodel anchor to the high-ready carry pose:
  $$\vec{P}_{\text{tac\_offset}} = (+0.08\text{ m}, +0.05\text{ m}, -0.12\text{ m}), \quad \vec{R}_{\text{tac\_offset}} = (-25^\circ, +15^\circ, -30^\circ)$$

### 3. ADS Procedural Alignment:
* Transitioning to ADS interpolates viewmodel transform to weapon optical sight align vector $\vec{P}_{\text{sight}}$ using an exponential smooth step ($T_{\text{ads}} \approx 0.18\text{ s}$).
* Bobbing and sway amplitudes are multiplied by $0.08$ during ADS to preserve reticle stability.

---

## 6. Lightweight Audio Caching & Memory Management

To maintain instant loading and prevent garbage collection stalls during fire exchanges:
* **AudioBuffer Pooling:** Pre-decode short `.ogg`/`.mp3` clips into in-memory `AudioBuffer` objects at initialization.
* **Fire-and-Forget Sound Nodes:** Instances use `AudioBufferSourceNode` created on demand and automatically collected upon completion via `source.onended = () => source.disconnect()`.
import * as THREE from 'three';

/**
 * 2nd-Order Damped Spring for viewmodel procedural kick.
 * a_spring = -k * (x - x_target) - c * v
 * v(t+dt) = v(t) + a_spring * dt
 * x(t+dt) = x(t) + v(t+dt) * dt
 *
 * Stiffness k ≈ 180, Damping c ≈ 22 (per spec).
 */
export class SpringVector3 {
  public position: THREE.Vector3 = new THREE.Vector3();
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public target: THREE.Vector3 = new THREE.Vector3();

  private _stiffness: number;
  private _damping: number;
  private _tempAccel: THREE.Vector3 = new THREE.Vector3();

  constructor(stiffness: number = 180, damping: number = 22) {
    this._stiffness = stiffness;
    this._damping = damping;
  }

  public update(dt: number): void {
    // a = -k * (x - target) - c * v
    this._tempAccel.copy(this.position).sub(this.target).multiplyScalar(-this._stiffness);
    this._tempAccel.addScaledVector(this.velocity, -this._damping);

    // v += a * dt
    this.velocity.addScaledVector(this._tempAccel, dt);

    // x += v * dt
    this.position.addScaledVector(this.velocity, dt);
  }

  /** Apply an instantaneous impulse (used for per-shot kick). */
  public applyImpulse(impulse: THREE.Vector3): void {
    this.velocity.add(impulse);
  }

  public reset(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.target.set(0, 0, 0);
  }
}

/**
 * Camera Recoil Accumulation & Elastic Recovery (Phase 3 Section 4).
 * Each shot injects (deltaPitch, deltaYaw).
 * On trigger release: accumulated kick smoothly decays toward zero.
 * Guard Rule: if player manually counters with mouse, subtract from accumulator.
 */
export class CameraRecoilSystem {
  /** Accumulated recoil offset (pitch = X, yaw = Y) in radians */
  public accumulated: THREE.Vector2 = new THREE.Vector2();
  private _recoverySpeed: number = 8.0;
  private _isFiring: boolean = false;

  public setRecoverySpeed(speed: number): void {
    this._recoverySpeed = speed;
  }

  public setFiring(isFiring: boolean): void {
    this._isFiring = isFiring;
  }

  /**
   * Inject a single-shot recoil kick.
   * pitchKick > 0 means camera pitches UP.
   * yawKick is random horizontal dispersion.
   */
  public addShotRecoil(pitchKick: number, yawKick: number): void {
    this.accumulated.x += pitchKick;
    this.accumulated.y += yawKick;
  }

  /**
   * Update elastic recovery. Called every fixed tick.
   * When not firing, accumulated recoil decays toward zero.
   * Returns the delta to apply to camera look this tick.
   */
  public update(dt: number, userMouseDeltaY: number): { deltaPitch: number; deltaYaw: number } {
    let deltaPitch = 0;
    let deltaYaw = 0;

    if (!this._isFiring && (Math.abs(this.accumulated.x) > 0.0001 || Math.abs(this.accumulated.y) > 0.0001)) {
      // Elastic recovery (smooth damp toward zero)
      const decay = 1 - Math.exp(-this._recoverySpeed * dt);
      const recoveryPitch = this.accumulated.x * decay;
      const recoveryYaw = this.accumulated.y * decay;

      deltaPitch = -recoveryPitch;
      deltaYaw = -recoveryYaw;

      this.accumulated.x -= recoveryPitch;
      this.accumulated.y -= recoveryYaw;
    }

    // Guard Rule: subtract player's active downward mouse look from accumulator
    // (prevents over-correction when player is already pulling down)
    if (userMouseDeltaY > 0 && this.accumulated.x > 0) {
      // Player is looking down (positive deltaY in screen space = pitching down)
      const subtract = Math.min(this.accumulated.x, userMouseDeltaY * 0.0022);
      this.accumulated.x -= subtract;
    }

    return { deltaPitch, deltaYaw };
  }

  public reset(): void {
    this.accumulated.set(0, 0);
    this._isFiring = false;
  }
}

/**
 * Viewmodel Mouse Sway (Phase 3 Section 5).
 * Adds weapon lag based on mouse movement deltas.
 * deltaR_sway = (-clamp(dy * alpha), -clamp(dx * alpha), clamp(dx * beta))
 */
export class ViewmodelSway {
  public currentSway: THREE.Vector3 = new THREE.Vector3();
  private _swayAlpha: number = 0.003;    // rotation sway sensitivity
  private _swayBeta: number = 0.002;     // roll sway sensitivity
  private _maxSway: number = 0.05;
  private _maxRoll: number = 0.03;
  private _returnSpeed: number = 8.0;

  public update(dt: number, mouseDX: number, mouseDY: number): void {
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const targetX = -clamp(mouseDY * this._swayAlpha, -this._maxSway, this._maxSway);
    const targetY = -clamp(mouseDX * this._swayAlpha, -this._maxSway, this._maxSway);
    const targetZ = clamp(mouseDX * this._swayBeta, -this._maxRoll, this._maxRoll);

    // Smooth towards target
    const lerpFactor = 1 - Math.exp(-this._returnSpeed * dt);
    this.currentSway.x += (targetX - this.currentSway.x) * lerpFactor;
    this.currentSway.y += (targetY - this.currentSway.y) * lerpFactor;
    this.currentSway.z += (targetZ - this.currentSway.z) * lerpFactor;
  }

  public reset(): void {
    this.currentSway.set(0, 0, 0);
  }
}

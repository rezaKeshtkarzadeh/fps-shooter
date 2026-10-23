import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.ts';

/**
 * Decoupled 3-Tier Camera Hierarchy with Phase 2 Procedural Kinematics:
 * PlayerRoot (Capsule Collider position + Horizontal Yaw only)
 * └── CameraPivot / SpringArm (Critically Damped Spring for Stances + Lissajous Head Bob)
 *     └── CameraPitch (Vertical look angle clamping + Slide Dutch Roll on Z)
 *         ├── Three.js Camera
 *         └── ViewModelAnchor (Mount point for weapons and hands)
 */
export class PlayerRoot {
  public root: THREE.Group;
  public cameraPivot: THREE.Group;
  public cameraPitch: THREE.Group;
  public camera: THREE.PerspectiveCamera;
  public viewModelAnchor: THREE.Group;

  private _pitch: number = 0;
  private _yaw: number = 0;

  // Spring kinematics for CameraPivot height
  private _currentEyeHeight: number = GAME_CONFIG.stances.stand.eyeHeight;
  private _targetEyeHeight: number = GAME_CONFIG.stances.stand.eyeHeight;
  private _eyeHeightVelocity: number = 0;

  // Dutch roll (tilt on Z)
  private _currentRoll: number = 0;
  private _targetRoll: number = 0;

  // Lissajous Head Bob
  private _bobTimer: number = 0;
  private _currentBobX: number = 0;
  private _currentBobY: number = 0;

  constructor(aspectRatio: number) {
    this.root = new THREE.Group();
    this.root.name = 'PlayerRoot';

    this.cameraPivot = new THREE.Group();
    this.cameraPivot.name = 'CameraPivot';
    this.cameraPivot.position.set(0, this._currentEyeHeight, 0);
    this.root.add(this.cameraPivot);

    this.cameraPitch = new THREE.Group();
    this.cameraPitch.name = 'CameraPitch';
    this.cameraPivot.add(this.cameraPitch);

    this.camera = new THREE.PerspectiveCamera(
      GAME_CONFIG.camera.fov,
      aspectRatio,
      GAME_CONFIG.camera.near,
      GAME_CONFIG.camera.far
    );
    this.camera.name = 'FirstPersonCamera';
    this.cameraPitch.add(this.camera);

    this.viewModelAnchor = new THREE.Group();
    this.viewModelAnchor.name = 'ViewModelAnchor';
    this.cameraPitch.add(this.viewModelAnchor);
  }

  public setTargetEyeHeight(height: number): void {
    this._targetEyeHeight = height;
  }

  public setTargetRoll(rollRadians: number): void {
    this._targetRoll = rollRadians;
  }

  /**
   * Applies mouse look input with strict pitch clamping
   */
  public handleLookInput(deltaX: number, deltaY: number): void {
    const sens = GAME_CONFIG.camera.mouseSensitivity;

    this._yaw -= deltaX * sens;
    this._yaw = ((this._yaw + Math.PI) % (2 * Math.PI)) - Math.PI;
    this.root.rotation.y = this._yaw;

    this._pitch -= deltaY * sens;
    this._pitch = Math.max(
      GAME_CONFIG.camera.minPitch,
      Math.min(GAME_CONFIG.camera.maxPitch, this._pitch)
    );
    this.cameraPitch.rotation.x = this._pitch;
  }

  /**
   * Updates camera procedural kinematics (Spring damp, Lissajous bob, Dutch roll)
   */
  public updateKinematics(delta: number, horizontalSpeed: number, isGrounded: boolean): void {
    // 1. Critically Damped Spring for Camera Pivot Height
    const omega = GAME_CONFIG.camera.springFrequency;
    const f = 1.0 + 2.0 * omega * delta;
    const det = f + omega * omega * delta * delta;

    this._currentEyeHeight =
      (f * this._currentEyeHeight +
        delta * this._eyeHeightVelocity +
        omega * omega * delta * delta * this._targetEyeHeight) /
      det;

    this._eyeHeightVelocity =
      (this._eyeHeightVelocity +
        omega * omega * delta * (this._targetEyeHeight - this._currentEyeHeight)) /
      det;

    // 2. Dutch Roll Smoothing on CameraPitch.rotation.z
    this._currentRoll = THREE.MathUtils.lerp(this._currentRoll, this._targetRoll, delta * 12.0);
    this.cameraPitch.rotation.z = this._currentRoll;

    // 3. Dual-Axis Lissajous Head Bobbing
    const bobConfig = GAME_CONFIG.camera.headBob;
    if (isGrounded && horizontalSpeed > 0.5) {
      const speedFactor = Math.min(2.0, horizontalSpeed / GAME_CONFIG.movement.walkSpeed);
      this._bobTimer += delta * bobConfig.baseFrequency * speedFactor;

      const targetBobX = bobConfig.amplitudeX * Math.cos(this._bobTimer) * speedFactor;
      const targetBobY = bobConfig.amplitudeY * Math.sin(2 * this._bobTimer) * speedFactor;

      this._currentBobX = THREE.MathUtils.lerp(this._currentBobX, targetBobX, delta * 10.0);
      this._currentBobY = THREE.MathUtils.lerp(this._currentBobY, targetBobY, delta * 10.0);
    } else {
      // Smoothly settle bob to zero when idle or airborne
      this._currentBobX = THREE.MathUtils.lerp(this._currentBobX, 0, delta * 8.0);
      this._currentBobY = THREE.MathUtils.lerp(this._currentBobY, 0, delta * 8.0);
    }

    // Apply combined vertical translation and horizontal bob to CameraPivot
    this.cameraPivot.position.set(
      this._currentBobX,
      this._currentEyeHeight + this._currentBobY,
      0
    );
  }

  public setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  public getHorizontalForward(out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this._yaw), 0, -Math.cos(this._yaw)).normalize();
  }

  public getHorizontalRight(out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.cos(this._yaw), 0, -Math.sin(this._yaw)).normalize();
  }

  public get yaw(): number {
    return this._yaw;
  }

  public get pitch(): number {
    return this._pitch;
  }

  public get eyeHeight(): number {
    return this._currentEyeHeight;
  }
}

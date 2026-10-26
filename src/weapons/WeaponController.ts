import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { WeaponDefinition, HitZone } from './types.ts';
import { calculateDamage } from './types.ts';
import { WeaponStateMachine, type WeaponState } from './WeaponStateMachine.ts';
import { ViewmodelRenderer } from './ViewmodelRenderer.ts';
import { SpringVector3, CameraRecoilSystem, ViewmodelSway } from './RecoilSystem.ts';
import { HitboxTarget } from './HitboxTarget.ts';
import { ALL_WEAPONS } from './weaponConfigs.ts';
import { CollisionGroups, createInteractionGroups } from '../config/gameConfig.ts';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import type { LocomotionState } from '../player/LocomotionFSM.ts';
import { AcousticManager } from '../ai/perception/AcousticManager.ts';

export interface WeaponFeedback {
  weaponName: string;
  weaponSlot: string;
  fireMode: string;
  weaponState: WeaponState;
  ammoMag: number;
  ammoMagCapacity: number;
  ammoReserve: number;
  isADS: boolean;
  adsProgress: number;
  hitmarkerTimer: number;
  killmarkerTimer: number;
  lastHitDamage: number;
  lastHitZone: HitZone | null;
  reloadProgress: number;
}

export class WeaponController {
  private _viewmodel: ViewmodelRenderer;
  private _wsm: WeaponStateMachine;
  private _springKick: SpringVector3;
  private _cameraRecoil: CameraRecoilSystem;
  private _sway: ViewmodelSway;
  private _physicsWorld: PhysicsWorld;
  private _targets: HitboxTarget[] = [];
  private _botHitResolver: ((colliderHandle: number, distance: number, def: WeaponDefinition) => { hit: boolean; killed: boolean; damage: number; zone: HitZone } | null) | null = null;

  // ADS
  private _adsProgress: number = 0; // 0 = hip, 1 = fully ADS
  private _isAdsRequested: boolean = false;

  // Firing & Trigger state
  private _isTriggerHeld: boolean = false;
  private _triggerWasHeldLastTick: boolean = false;

  // Weapon switching
  private _currentWeaponIndex: number = 0;
  private _weaponMeshes: Map<string, THREE.Group> = new Map();

  // Viewmodel procedural positions
  private _currentViewmodelPos: THREE.Vector3 = new THREE.Vector3();
  private _currentViewmodelRot: THREE.Euler = new THREE.Euler();
  private _targetViewmodelPos: THREE.Vector3 = new THREE.Vector3();
  private _targetViewmodelRot: THREE.Vector3 = new THREE.Vector3();

  // Feedback state
  private _hitmarkerTimer: number = 0;
  private _killmarkerTimer: number = 0;
  private _lastHitDamage: number = 0;
  private _lastHitZone: HitZone | null = null;

  // Camera look injection reference
  private _applyRecoilCallback: ((deltaPitch: number, deltaYaw: number) => void) | null = null;

  constructor(
    renderer: THREE.WebGLRenderer,
    worldCamera: THREE.PerspectiveCamera,
    physicsWorld: PhysicsWorld
  ) {
    this._physicsWorld = physicsWorld;
    this._viewmodel = new ViewmodelRenderer(renderer, worldCamera);
    this._wsm = new WeaponStateMachine(ALL_WEAPONS[0]);
    this._springKick = new SpringVector3(180, 22);
    this._cameraRecoil = new CameraRecoilSystem();
    this._sway = new ViewmodelSway();

    // Initialize weapon meshes
    for (const def of ALL_WEAPONS) {
      const mesh = this._viewmodel.createGreyboxWeapon(def.meshScale, def.meshColor);
      this._weaponMeshes.set(def.id, mesh);
    }

    // Set initial weapon
    const initialMesh = this._weaponMeshes.get(ALL_WEAPONS[0].id)!;
    this._viewmodel.setWeaponMesh(initialMesh);
    this._resetViewmodelToHip();
  }

  public get viewmodelRenderer(): ViewmodelRenderer {
    return this._viewmodel;
  }

  public setRecoilCallback(cb: (deltaPitch: number, deltaYaw: number) => void): void {
    this._applyRecoilCallback = cb;
  }

  public setBotHitResolver(resolver: (colliderHandle: number, distance: number, def: WeaponDefinition) => { hit: boolean; killed: boolean; damage: number; zone: HitZone } | null): void {
    this._botHitResolver = resolver;
  }

  public registerTarget(target: HitboxTarget): void {
    this._targets.push(target);
  }

  // --- Input Setters ---
  public setTriggerHeld(held: boolean): void {
    this._isTriggerHeld = held;
    this._cameraRecoil.setFiring(held);
  }

  public setAdsRequested(requested: boolean): void {
    this._isAdsRequested = requested;
  }

  public tryReload(): void {
    this._wsm.tryReload();
  }

  /**
   * Selects a specific weapon slot (0 to 3) or relative delta.
   */
  public selectWeapon(index: number): void {
    if (index < 0 || index >= ALL_WEAPONS.length || index === this._currentWeaponIndex) return;
    this._currentWeaponIndex = index;
    const newDef = ALL_WEAPONS[this._currentWeaponIndex];
    this._wsm.equipWeapon(newDef);
    this._cameraRecoil.reset();
    this._springKick.reset();
    this._adsProgress = 0;

    const mesh = this._weaponMeshes.get(newDef.id)!;
    this._viewmodel.setWeaponMesh(mesh);
    this._cameraRecoil.setRecoverySpeed(newDef.recoil.recoverySpeed);
  }

  public cycleWeapon(direction: number): void {
    const nextIndex =
      (this._currentWeaponIndex + direction + ALL_WEAPONS.length) % ALL_WEAPONS.length;
    this.selectWeapon(nextIndex);
  }

  /**
   * Fixed physics tick (120 Hz). Handles firing, FSM sync, recoil recovery.
   */
  public fixedUpdate(
    fixedDelta: number,
    locoState: LocomotionState,
    cameraOrigin: { x: number; y: number; z: number },
    cameraForward: THREE.Vector3,
    mouseDeltaY: number
  ): void {
    const def = this._wsm.definition;

    // 1. Sync weapon FSM with locomotion (passing combat intent for instant ADS or Hipfire)
    this._wsm.syncWithLocomotion(locoState, this._isAdsRequested || this._isTriggerHeld);
    this._wsm.update(fixedDelta);

    // 2. Update target dummies (hit flash, respawns)
    for (const target of this._targets) {
      target.update(fixedDelta);
    }

    // 3. Firing logic (auto vs semi-auto) - Only Ladder blocks firing
    const isTriggerJustPressed = this._isTriggerHeld && !this._triggerWasHeldLastTick;
    const wantsToFire = def.fireMode === 'auto' ? this._isTriggerHeld : isTriggerJustPressed;

    const canFireInLocomotion = locoState !== 'LADDER';

    if (wantsToFire && this._wsm.canFire && canFireInLocomotion) {
      const didFire = this._wsm.tryFire();
      if (didFire) {
        this._onShot(def, cameraOrigin, cameraForward, locoState);
      }
    }

    // Auto-reload when mag empty and trigger pressed
    if (isTriggerJustPressed && this._wsm.ammo.currentMag <= 0 && this._wsm.state === 'IDLE') {
      this._wsm.tryReload();
    }

    this._triggerWasHeldLastTick = this._isTriggerHeld;

    // 4. ADS interpolation (smooth gradual aiming in all states including Mantle, Slide, Air, Sprint)
    const canAds =
      locoState !== 'LADDER' &&
      this._wsm.state !== 'HOLSTERED' &&
      this._wsm.state !== 'RELOADING';

    if (this._isAdsRequested && canAds) {
      this._adsProgress = Math.min(1, this._adsProgress + fixedDelta / def.ads.adsTime);
    } else {
      this._adsProgress = Math.max(0, this._adsProgress - fixedDelta / def.ads.adsTime);
    }

    // 5. Camera recoil elastic recovery
    const recoilDelta = this._cameraRecoil.update(fixedDelta, mouseDeltaY);
    if ((recoilDelta.deltaPitch !== 0 || recoilDelta.deltaYaw !== 0) && this._applyRecoilCallback) {
      this._applyRecoilCallback(recoilDelta.deltaPitch, recoilDelta.deltaYaw);
    }

    // 6. Spring kick kinematics update
    this._springKick.update(fixedDelta);

    // 7. Hitmarker timers decay
    if (this._hitmarkerTimer > 0) this._hitmarkerTimer -= fixedDelta;
    if (this._killmarkerTimer > 0) this._killmarkerTimer -= fixedDelta;
  }

  /**
   * Render-frame update for smooth viewmodel sway, ADS, and FOV interpolation.
   */
  public renderUpdate(
    frameDelta: number,
    locoState: LocomotionState,
    mouseDX: number,
    mouseDY: number,
    worldCamera: THREE.PerspectiveCamera,
    baseFov: number
  ): void {
    const def = this._wsm.definition;

    // 1. Mouse sway
    this._sway.update(frameDelta, mouseDX, mouseDY);

    // 2. Compute target viewmodel position/rotation based on state
    this._computeViewmodelTarget(locoState, def);

    // 3. Smooth interpolation toward target
    const lerpSpeed = 12.0;
    const lerpFactor = 1 - Math.exp(-lerpSpeed * frameDelta);

    this._currentViewmodelPos.lerp(this._targetViewmodelPos, lerpFactor);

    this._currentViewmodelRot.x +=
      (this._targetViewmodelRot.x - this._currentViewmodelRot.x) * lerpFactor;
    this._currentViewmodelRot.y +=
      (this._targetViewmodelRot.y - this._currentViewmodelRot.y) * lerpFactor;
    this._currentViewmodelRot.z +=
      (this._targetViewmodelRot.z - this._currentViewmodelRot.z) * lerpFactor;

    // 4. Apply combined offsets to weapon group
    const wg = this._viewmodel.weaponGroup;
    wg.position.copy(this._currentViewmodelPos);
    wg.position.add(this._springKick.position);
    wg.position.x += this._sway.currentSway.y * 0.3;
    wg.position.y += this._sway.currentSway.x * 0.3;

    wg.rotation.set(
      this._currentViewmodelRot.x + this._sway.currentSway.x + this._springKick.position.x * 2,
      this._currentViewmodelRot.y + this._sway.currentSway.y,
      this._currentViewmodelRot.z + this._sway.currentSway.z
    );

    // 5. ADS FOV zoom (smoothstep curve)
    const t = this._smoothstep(this._adsProgress);
    const targetFov = baseFov + (def.ads.adsFov - baseFov) * t;
    worldCamera.fov = targetFov;
    worldCamera.updateProjectionMatrix();

    // 6. Sync viewmodel camera with world camera
    this._viewmodel.syncCamera();
    this._viewmodel.update(frameDelta);
  }

  /**
   * Shot firing: injects camera kick, spring impulse, and executes raycast.
   */
  private _onShot(
    def: WeaponDefinition,
    cameraOrigin: { x: number; y: number; z: number },
    cameraForward: THREE.Vector3,
    locoState: LocomotionState
  ): void {
    // 0. Trigger visual muzzle flash
    this._viewmodel.triggerMuzzleFlash();
    AcousticManager.getInstance().emitSound('GUNSHOT', cameraOrigin, 60.0, 1.0, 'PLAYER');

    // 1. Camera recoil kick
    const pitchKick =
      def.recoil.pitchPerShot + (Math.random() - 0.5) * 2 * def.recoil.pitchVariance;
    const yawKick = (Math.random() - 0.5) * 2 * def.recoil.yawVariance;

    this._cameraRecoil.addShotRecoil(pitchKick, yawKick);

    if (this._applyRecoilCallback) {
      this._applyRecoilCallback(pitchKick, yawKick);
    }

    // 2. Viewmodel spring kick (backward + upward)
    this._springKick.applyImpulse(
      new THREE.Vector3(
        def.recoil.kickUpRotation * 0.5,
        0,
        def.recoil.kickBackDistance * 8
      )
    );

    // 3. Direction with spread (higher in slide or hipfire)
    const fireDir = cameraForward.clone();
    let spreadAngle = this._adsProgress > 0.8 ? 0.001 : 0.015;
    if (locoState === 'SLIDE') {
      spreadAngle *= def.slideSpreadMultiplier;
    }

    if (spreadAngle > 0.001) {
      const rx = (Math.random() - 0.5) * spreadAngle;
      const ry = (Math.random() - 0.5) * spreadAngle;
      fireDir.x += rx;
      fireDir.y += ry;
      fireDir.normalize();
    }

    // 4. Hitscan raycast
    this._performHitscan(def, cameraOrigin, fireDir);
  }

  /**
   * Raycast hitscan query against environment and hitbox targets.
   */
  private _performHitscan(
    def: WeaponDefinition,
    origin: { x: number; y: number; z: number },
    direction: THREE.Vector3
  ): void {
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(origin.x, origin.y, origin.z),
      new RAPIER.Vector3(direction.x, direction.y, direction.z)
    );

    const filterGroups = createInteractionGroups(
      CollisionGroups.GROUP_HITSCAN,
      CollisionGroups.GROUP_HITSCAN | CollisionGroups.GROUP_ENVIRONMENT | CollisionGroups.GROUP_BOT
    );

    const hit = this._physicsWorld.world.castRayAndGetNormal(
      ray,
      500,
      true,
      undefined,
      filterGroups
    );

    if (!hit) return;

    const distance = hit.timeOfImpact;

    // Check hit tactical bots
    if (this._botHitResolver) {
      const botHit = this._botHitResolver(hit.collider.handle, distance, def);
      if (botHit && botHit.hit) {
        this._lastHitDamage = botHit.damage;
        this._lastHitZone = botHit.zone;
        this._hitmarkerTimer = 0.2;
        if (botHit.killed) {
          this._killmarkerTimer = 0.45;
        }
        return;
      }
    }

    // Check hit target dummies
    for (const target of this._targets) {
      const zone = target.resolveHitZone(hit.collider.handle);
      if (zone) {
        const damage = calculateDamage(distance, def.damage, zone);
        const result = target.applyDamage(damage, zone);

        this._lastHitDamage = damage;
        this._lastHitZone = zone;
        this._hitmarkerTimer = 0.2;

        if (result.killed) {
          this._killmarkerTimer = 0.45;
        }
        return;
      }
    }
  }

  /**
   * Compute target viewmodel position and rotation based on locomotion state.
   */
  private _computeViewmodelTarget(locoState: LocomotionState, def: WeaponDefinition): void {
    const adsT = this._smoothstep(this._adsProgress);

    switch (locoState) {
      case 'SPRINT': {
        const isCombatActive = this._isTriggerHeld || this._wsm.state === 'FIRING';
        const sprintPos = isCombatActive ? def.offsets.hipPosition : def.offsets.sprintPosition;
        const sprintRot = isCombatActive ? def.offsets.hipRotation : def.offsets.sprintRotation;
        const adsPos = def.ads.adsPosition;
        this._targetViewmodelPos.set(
          sprintPos.x + (adsPos.x - sprintPos.x) * adsT,
          sprintPos.y + (adsPos.y - sprintPos.y) * adsT,
          sprintPos.z + (adsPos.z - sprintPos.z) * adsT
        );
        this._targetViewmodelRot.set(
          sprintRot.x * (1 - adsT),
          sprintRot.y * (1 - adsT),
          sprintRot.z * (1 - adsT)
        );
        break;
      }

      case 'TACTICAL_SPRINT': {
        const isCombatActive = this._isTriggerHeld || this._wsm.state === 'FIRING';
        const tacPos = isCombatActive ? def.offsets.hipPosition : def.offsets.tacSprintPosition;
        const tacRot = isCombatActive ? def.offsets.hipRotation : def.offsets.tacSprintRotation;
        const adsPos = def.ads.adsPosition;
        this._targetViewmodelPos.set(
          tacPos.x + (adsPos.x - tacPos.x) * adsT,
          tacPos.y + (adsPos.y - tacPos.y) * adsT,
          tacPos.z + (adsPos.z - tacPos.z) * adsT
        );
        this._targetViewmodelRot.set(
          tacRot.x * (1 - adsT),
          tacRot.y * (1 - adsT),
          tacRot.z * (1 - adsT)
        );
        break;
      }

      case 'SLIDE': {
        // Slide posture smoothly interpolating into ADS sightline
        const slideHipX = def.offsets.hipPosition.x + 0.02;
        const slideHipY = def.offsets.hipPosition.y - 0.02;
        const slideHipZ = def.offsets.hipPosition.z;
        const adsPos = def.ads.adsPosition;
        this._targetViewmodelPos.set(
          slideHipX + (adsPos.x - slideHipX) * adsT,
          slideHipY + (adsPos.y - slideHipY) * adsT,
          slideHipZ + (adsPos.z - slideHipZ) * adsT
        );
        this._targetViewmodelRot.set(
          (def.offsets.hipRotation.x - 0.04) * (1 - adsT),
          (def.offsets.hipRotation.y - 0.02) * (1 - adsT),
          (def.offsets.hipRotation.z + 0.04) * (1 - adsT)
        );
        break;
      }

      case 'MANTLE': {
        // Mantle posture: weapon held ready and smoothly interpolates into ADS sightline
        const mantleHipX = def.offsets.hipPosition.x + 0.01;
        const mantleHipY = def.offsets.hipPosition.y - 0.02;
        const mantleHipZ = def.offsets.hipPosition.z;
        const adsPos = def.ads.adsPosition;
        this._targetViewmodelPos.set(
          mantleHipX + (adsPos.x - mantleHipX) * adsT,
          mantleHipY + (adsPos.y - mantleHipY) * adsT,
          mantleHipZ + (adsPos.z - mantleHipZ) * adsT
        );
        this._targetViewmodelRot.set(
          (def.offsets.hipRotation.x - 0.02) * (1 - adsT),
          (def.offsets.hipRotation.y - 0.01) * (1 - adsT),
          (def.offsets.hipRotation.z + 0.02) * (1 - adsT)
        );
        break;
      }

      case 'LADDER':
        // Holstered on ladder: tuck weapon off-screen
        this._targetViewmodelPos.set(0.25, -0.45, -0.2);
        this._targetViewmodelRot.set(-0.6, 0.7, -0.2);
        break;

      default: {
        // IDLE / CROUCH / PRONE / SLIDE / IN_AIR:
        // Smoothly interpolate between hipfire offset and ADS sight-line
        const hip = def.offsets.hipPosition;
        const ads = def.ads.adsPosition;
        this._targetViewmodelPos.set(
          hip.x + (ads.x - hip.x) * adsT,
          hip.y + (ads.y - hip.y) * adsT,
          hip.z + (ads.z - hip.z) * adsT
        );
        this._targetViewmodelRot.set(
          def.offsets.hipRotation.x * (1 - adsT),
          def.offsets.hipRotation.y * (1 - adsT),
          def.offsets.hipRotation.z * (1 - adsT)
        );
        break;
      }
    }
  }

  private _resetViewmodelToHip(): void {
    const def = this._wsm.definition;
    this._currentViewmodelPos.set(
      def.offsets.hipPosition.x,
      def.offsets.hipPosition.y,
      def.offsets.hipPosition.z
    );
    this._currentViewmodelRot.set(0, 0, 0);
    this._targetViewmodelPos.copy(this._currentViewmodelPos);
    this._targetViewmodelRot.set(0, 0, 0);
  }

  private _smoothstep(t: number): number {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  public getFeedback(): WeaponFeedback {
    const def = this._wsm.definition;
    return {
      weaponName: def.name,
      weaponSlot: def.slot.toUpperCase(),
      fireMode: def.fireMode.toUpperCase(),
      weaponState: this._wsm.state,
      ammoMag: this._wsm.ammo.currentMag,
      ammoMagCapacity: def.ammo.magCapacity,
      ammoReserve: this._wsm.ammo.reserve,
      isADS: this._adsProgress > 0.5,
      adsProgress: this._adsProgress,
      hitmarkerTimer: this._hitmarkerTimer,
      killmarkerTimer: this._killmarkerTimer,
      lastHitDamage: this._lastHitDamage,
      lastHitZone: this._lastHitZone,
      reloadProgress:
        this._wsm.state === 'RELOADING'
          ? Math.min(1, this._wsm.stateTimer / def.reloadTime)
          : 0,
    };
  }

  public onResize(): void {
    this._viewmodel.onResize();
  }

  public dispose(): void {
    this._viewmodel.dispose();
  }
}

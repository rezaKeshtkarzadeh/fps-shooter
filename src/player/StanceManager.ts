import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, CollisionGroups, createInteractionGroups } from '../config/gameConfig.ts';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import { PlayerRoot } from './PlayerRoot.ts';

export type StanceType = 'stand' | 'crouch' | 'prone';

export class StanceManager {
  private _stance: StanceType = 'stand';
  private _physicsWorld: PhysicsWorld;
  private _playerRoot: PlayerRoot;
  private _body: RAPIER.RigidBody;
  private _collider: RAPIER.Collider;

  constructor(
    physicsWorld: PhysicsWorld,
    playerRoot: PlayerRoot,
    body: RAPIER.RigidBody,
    initialCollider: RAPIER.Collider
  ) {
    this._physicsWorld = physicsWorld;
    this._playerRoot = playerRoot;
    this._body = body;
    this._collider = initialCollider;
    this._playerRoot.setTargetEyeHeight(GAME_CONFIG.stances.stand.eyeHeight);
  }

  public get stance(): StanceType {
    return this._stance;
  }

  public get collider(): RAPIER.Collider {
    return this._collider;
  }

  public getFeetPosition(): { x: number; y: number; z: number } {
    const pos = this._body.translation();
    const cfg = GAME_CONFIG.stances[this._stance];
    return {
      x: pos.x,
      y: pos.y - (cfg.capsuleHalfHeight + cfg.capsuleRadius),
      z: pos.z,
    };
  }

  /**
   * Resizes capsule collider maintaining strict bottom hemisphere contact with ground
   */
  public resizeCollider(newStance: StanceType): void {
    if (this._stance === newStance) return;

    const oldCfg = GAME_CONFIG.stances[this._stance];
    const newCfg = GAME_CONFIG.stances[newStance];

    // 1. Calculate current feet level
    const currentPos = this._body.translation();
    const feetY = currentPos.y - (oldCfg.capsuleHalfHeight + oldCfg.capsuleRadius);

    // 2. Calculate new center Y anchored to feet
    const newCenterY = feetY + (newCfg.capsuleHalfHeight + newCfg.capsuleRadius);

    // 3. Swap collider in Rapier world
    this._physicsWorld.world.removeCollider(this._collider, false);

    const colliderDesc = RAPIER.ColliderDesc.capsule(
      newCfg.capsuleHalfHeight,
      newCfg.capsuleRadius
    )
      .setCollisionGroups(
        createInteractionGroups(
          CollisionGroups.GROUP_PLAYER,
          CollisionGroups.GROUP_ENVIRONMENT | CollisionGroups.GROUP_BOT
        )
      )
      .setFriction(0.0)
      .setRestitution(0.0);

    this._collider = this._physicsWorld.world.createCollider(colliderDesc, this._body);

    // 4. Update body position immediately and target next kinematic translation
    this._body.setTranslation(
      {
        x: currentPos.x,
        y: newCenterY,
        z: currentPos.z,
      },
      true
    );
    this._body.setNextKinematicTranslation({
      x: currentPos.x,
      y: newCenterY,
      z: currentPos.z,
    });
    this._playerRoot.setPosition(currentPos.x, newCenterY, currentPos.z);

    this._stance = newStance;
    this._playerRoot.setTargetEyeHeight(newCfg.eyeHeight);
  }

  /**
   * Multi-Tier Ceiling Sweep for Prone Un-Toggle:
   * 1. Test Stand clearance (1.85m) -> returns 'stand' if clear.
   * 2. Test Crouch clearance (1.25m) -> returns 'crouch' if clear.
   * 3. Else returns null (remain in prone).
   */
  public evaluateProneUnToggle(feetPos: { x: number; y: number; z: number }): StanceType | null {
    const canStand = this._physicsWorld.checkCeilingClearance(
      feetPos,
      GAME_CONFIG.stances.stand.requiredClearance,
      this._collider
    );
    if (canStand) return 'stand';

    const canCrouch = this._physicsWorld.checkCeilingClearance(
      feetPos,
      GAME_CONFIG.stances.crouch.requiredClearance,
      this._collider
    );
    if (canCrouch) return 'crouch';

    return null; // Both blocked
  }

  /**
   * Ceiling Sweep for Crouch Un-Toggle:
   * Tests Stand clearance (1.85m) -> returns 'stand' if clear, else null.
   */
  public evaluateCrouchUnToggle(feetPos: { x: number; y: number; z: number }): StanceType | null {
    const canStand = this._physicsWorld.checkCeilingClearance(
      feetPos,
      GAME_CONFIG.stances.stand.requiredClearance,
      this._collider
    );
    if (canStand) return 'stand';

    return null; // Blocked
  }
}

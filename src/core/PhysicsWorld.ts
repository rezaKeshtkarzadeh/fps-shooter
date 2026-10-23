import RAPIER from '@dimforge/rapier3d-compat';
import { GAME_CONFIG, CollisionGroups, createInteractionGroups } from '../config/gameConfig.ts';

export interface RayHit {
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  distance: number;
  collider: RAPIER.Collider;
}

export interface LadderData {
  collider: RAPIER.Collider;
  bottom: { x: number; y: number; z: number };
  top: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number }; // pointing outward from ladder face
}

export class PhysicsWorld {
  private _world!: RAPIER.World;
  private _isInitialized: boolean = false;
  private _ladders: LadderData[] = [];

  public async init(): Promise<void> {
    if (this._isInitialized) return;
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, GAME_CONFIG.physics.gravity, 0);
    this._world = new RAPIER.World(gravity);
    this._isInitialized = true;
  }

  public get world(): RAPIER.World {
    if (!this._isInitialized) {
      throw new Error('PhysicsWorld accessed before init() completed');
    }
    return this._world;
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public step(): void {
    if (this._isInitialized) {
      this._world.step();
    }
  }

  /**
   * Casts a ray and returns hit information if obstacle is hit within maxToi.
   * By default, checks environment colliders and safely ignores caller's collider.
   */
  public castRay(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxToi: number,
    filterGroups?: number,
    excludeCollider?: RAPIER.Collider
  ): RayHit | null {
    if (!this._isInitialized) return null;

    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(origin.x, origin.y, origin.z),
      new RAPIER.Vector3(direction.x, direction.y, direction.z)
    );

    const groups =
      filterGroups ??
      createInteractionGroups(CollisionGroups.GROUP_PLAYER, CollisionGroups.GROUP_ENVIRONMENT);

    const hit = this._world.castRayAndGetNormal(
      ray,
      maxToi,
      true, // solid: true
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      groups,
      excludeCollider
    );

    if (!hit) return null;
    if (excludeCollider && hit.collider.handle === excludeCollider.handle) return null;
    if (hit.timeOfImpact < 0.05) return null; // Ignore self-intersection / skin width

    const point = ray.pointAt(hit.timeOfImpact);
    return {
      point: { x: point.x, y: point.y, z: point.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: hit.timeOfImpact,
      collider: hit.collider,
    };
  }

  /**
   * Ceiling clearance raycast:
   * Casts directly upward from capsule origin to verify if target height is unblocked.
   */
  public checkCeilingClearance(
    feetPos: { x: number; y: number; z: number },
    requiredHeight: number,
    excludeCollider?: RAPIER.Collider
  ): boolean {
    const origin = { x: feetPos.x, y: feetPos.y + 0.1, z: feetPos.z };
    const direction = { x: 0, y: 1, z: 0 };
    const checkDistance = requiredHeight - 0.1 + GAME_CONFIG.stances.clearanceEpsilon;

    const hit = this.castRay(
      origin,
      direction,
      checkDistance,
      createInteractionGroups(CollisionGroups.GROUP_PLAYER, CollisionGroups.GROUP_ENVIRONMENT),
      excludeCollider
    );

    return hit === null; // True if completely clear
  }

  /**
   * Raycasts straight down to determine ground normal vector for slope sliding
   */
  public getGroundNormal(
    feetPos: { x: number; y: number; z: number },
    excludeCollider?: RAPIER.Collider
  ): { x: number; y: number; z: number } {
    const origin = { x: feetPos.x, y: feetPos.y + 0.5, z: feetPos.z };
    const direction = { x: 0, y: -1, z: 0 };

    const hit = this.castRay(
      origin,
      direction,
      1.2,
      createInteractionGroups(CollisionGroups.GROUP_PLAYER, CollisionGroups.GROUP_ENVIRONMENT),
      excludeCollider
    );
    if (hit) {
      return hit.normal;
    }
    return { x: 0, y: 1, z: 0 };
  }

  /**
   * Helper to create a static box collider for the environment
   */
  public createStaticBox(
    halfX: number,
    halfY: number,
    halfZ: number,
    posX: number,
    posY: number,
    posZ: number,
    rotX = 0,
    rotY = 0,
    rotZ = 0,
    collisionMembership = CollisionGroups.GROUP_ENVIRONMENT
  ): { body: RAPIER.RigidBody; collider: RAPIER.Collider } {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(posX, posY, posZ);

    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
      const q = new RAPIER.Quaternion(0, 0, 0, 1);
      const c1 = Math.cos(rotX / 2), s1 = Math.sin(rotX / 2);
      const c2 = Math.cos(rotY / 2), s2 = Math.sin(rotY / 2);
      const c3 = Math.cos(rotZ / 2), s3 = Math.sin(rotZ / 2);
      q.x = s1 * c2 * c3 + c1 * s2 * s3;
      q.y = c1 * s2 * c3 - s1 * c2 * s3;
      q.z = c1 * c2 * s3 + s1 * s2 * c3;
      q.w = c1 * c2 * c3 - s1 * s2 * s3;
      bodyDesc.setRotation(q);
    }

    const body = this._world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)
      .setCollisionGroups(
        createInteractionGroups(
          collisionMembership,
          CollisionGroups.GROUP_ENVIRONMENT |
            CollisionGroups.GROUP_PLAYER |
            CollisionGroups.GROUP_BOT |
            CollisionGroups.GROUP_PROJECTILE |
            CollisionGroups.GROUP_HITSCAN
        )
      );

    const collider = this._world.createCollider(colliderDesc, body);
    return { body, collider };
  }

  public registerLadder(ladder: LadderData): void {
    this._ladders.push(ladder);
  }

  public get ladders(): ReadonlyArray<LadderData> {
    return this._ladders;
  }

  public createCharacterController(): RAPIER.KinematicCharacterController {
    const ctrl = this._world.createCharacterController(GAME_CONFIG.controller.skinOffset);
    ctrl.enableAutostep(
      GAME_CONFIG.controller.autoStepMaxHeight,
      GAME_CONFIG.controller.autoStepMinWidth,
      GAME_CONFIG.controller.autoStepIncludeDynamic
    );
    ctrl.setSlideEnabled(GAME_CONFIG.controller.slideEnabled);
    ctrl.setMaxSlopeClimbAngle(GAME_CONFIG.controller.maxSlopeClimbAngle);
    ctrl.setMinSlopeSlideAngle(GAME_CONFIG.controller.minSlopeSlideAngle);
    ctrl.enableSnapToGround(GAME_CONFIG.controller.snapToGroundDistance);
    return ctrl;
  }
}

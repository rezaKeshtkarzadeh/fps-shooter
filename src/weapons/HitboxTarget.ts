import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CollisionGroups, createInteractionGroups } from '../config/gameConfig.ts';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import type { HitZone } from './types.ts';

/**
 * Compound Hitbox Target (Phase 3 Section 2).
 * Spawns a static humanoid target dummy with zone-tagged colliders for hitscan queries.
 * Each collider is tagged with a HitZone via userData for damage resolution.
 */
export interface HitboxColliderInfo {
  collider: RAPIER.Collider;
  zone: HitZone;
}

export class HitboxTarget {
  public position: THREE.Vector3;
  public health: number = 100;
  public maxHealth: number = 100;
  public isDead: boolean = false;

  private _body: RAPIER.RigidBody;
  private _colliders: HitboxColliderInfo[] = [];
  private _mesh: THREE.Group;
  private _scene: THREE.Scene;

  // Hitmarker feedback
  public lastHitZone: HitZone | null = null;
  public lastHitDamage: number = 0;
  public hitFlashTimer: number = 0;

  constructor(
    scene: THREE.Scene,
    physicsWorld: PhysicsWorld,
    spawnPos: { x: number; y: number; z: number }
  ) {
    this._scene = scene;
    this.position = new THREE.Vector3(spawnPos.x, spawnPos.y, spawnPos.z);

    // Create fixed rigid body at spawn
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
      spawnPos.x, spawnPos.y + 0.9, spawnPos.z
    );
    this._body = physicsWorld.world.createRigidBody(bodyDesc);

    const hitscanGroups = createInteractionGroups(
      CollisionGroups.GROUP_HITSCAN | CollisionGroups.GROUP_BOT,
      CollisionGroups.GROUP_HITSCAN | CollisionGroups.GROUP_PLAYER
    );

    // --- HEAD: Sphere r=0.18m, centered at y=0.72 from body center (head top) ---
    const headDesc = RAPIER.ColliderDesc.ball(0.18)
      .setTranslation(0, 0.72, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const headCollider = physicsWorld.world.createCollider(headDesc, this._body);
    this._colliders.push({ collider: headCollider, zone: 'HEAD' });

    // --- TORSO: Capsule r=0.22m, halfHeight=0.275m, centered at y=0.25 ---
    const torsoDesc = RAPIER.ColliderDesc.capsule(0.275, 0.22)
      .setTranslation(0, 0.25, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const torsoCollider = physicsWorld.world.createCollider(torsoDesc, this._body);
    this._colliders.push({ collider: torsoCollider, zone: 'TORSO' });

    // --- STOMACH: Box 0.38 x 0.25 x 0.22m, centered at y=-0.15 ---
    const stomachDesc = RAPIER.ColliderDesc.cuboid(0.19, 0.125, 0.11)
      .setTranslation(0, -0.15, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const stomachCollider = physicsWorld.world.createCollider(stomachDesc, this._body);
    this._colliders.push({ collider: stomachCollider, zone: 'STOMACH' });

    // --- LEFT LEG: Capsule r=0.12m, halfHeight=0.3m ---
    const leftLegDesc = RAPIER.ColliderDesc.capsule(0.3, 0.12)
      .setTranslation(-0.12, -0.70, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const leftLegCollider = physicsWorld.world.createCollider(leftLegDesc, this._body);
    this._colliders.push({ collider: leftLegCollider, zone: 'LIMBS' });

    // --- RIGHT LEG: Capsule r=0.12m, halfHeight=0.3m ---
    const rightLegDesc = RAPIER.ColliderDesc.capsule(0.3, 0.12)
      .setTranslation(0.12, -0.70, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const rightLegCollider = physicsWorld.world.createCollider(rightLegDesc, this._body);
    this._colliders.push({ collider: rightLegCollider, zone: 'LIMBS' });

    // --- LEFT ARM: Capsule r=0.09m, halfHeight=0.2m ---
    const leftArmDesc = RAPIER.ColliderDesc.capsule(0.2, 0.09)
      .setTranslation(-0.30, 0.30, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const leftArmCollider = physicsWorld.world.createCollider(leftArmDesc, this._body);
    this._colliders.push({ collider: leftArmCollider, zone: 'LIMBS' });

    // --- RIGHT ARM: Capsule r=0.09m, halfHeight=0.2m ---
    const rightArmDesc = RAPIER.ColliderDesc.capsule(0.2, 0.09)
      .setTranslation(0.30, 0.30, 0)
      .setCollisionGroups(hitscanGroups)
      .setSensor(true);
    const rightArmCollider = physicsWorld.world.createCollider(rightArmDesc, this._body);
    this._colliders.push({ collider: rightArmCollider, zone: 'LIMBS' });

    // --- Visual Mesh (greybox humanoid silhouette) ---
    this._mesh = this._createVisualMesh();
    this._mesh.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    this._scene.add(this._mesh);
  }

  private _createVisualMesh(): THREE.Group {
    const group = new THREE.Group();
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.7, metalness: 0.3 });
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x993333, roughness: 0.8, metalness: 0.2 });

    // Head sphere
    const headGeo = new THREE.SphereGeometry(0.18, 12, 8);
    const head = new THREE.Mesh(headGeo, baseMat);
    head.position.set(0, 1.62, 0);
    group.add(head);

    // Torso capsule approximation (cylinder + hemispheres)
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.55, 10);
    const torso = new THREE.Mesh(torsoGeo, baseMat);
    torso.position.set(0, 1.15, 0);
    group.add(torso);

    // Stomach box
    const stomachGeo = new THREE.BoxGeometry(0.38, 0.25, 0.22);
    const stomach = new THREE.Mesh(stomachGeo, baseMat);
    stomach.position.set(0, 0.75, 0);
    group.add(stomach);

    // Left leg
    const legGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.60, 8);
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(-0.12, 0.20, 0);
    group.add(leftLeg);

    // Right leg
    const rightLeg = new THREE.Mesh(legGeo.clone(), limbMat);
    rightLeg.position.set(0.12, 0.20, 0);
    group.add(rightLeg);

    // Arms
    const armGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.40, 8);
    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArm.position.set(-0.30, 1.20, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo.clone(), limbMat);
    rightArm.position.set(0.30, 1.20, 0);
    group.add(rightArm);

    return group;
  }

  /**
   * Resolve which hitzone a collider handle belongs to.
   */
  public resolveHitZone(colliderHandle: number): HitZone | null {
    for (const info of this._colliders) {
      if (info.collider.handle === colliderHandle) {
        return info.zone;
      }
    }
    return null;
  }

  /**
   * Apply damage and check for kill.
   */
  public applyDamage(damage: number, zone: HitZone): { killed: boolean } {
    if (this.isDead) return { killed: false };

    this.health = Math.max(0, this.health - damage);
    this.lastHitZone = zone;
    this.lastHitDamage = damage;
    this.hitFlashTimer = 0.15; // 150ms flash

    // Visual feedback: flash red
    this._mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.setHex(0xff0000);
        child.material.emissiveIntensity = 0.5;
      }
    });

    if (this.health <= 0) {
      this.isDead = true;
      return { killed: true };
    }
    return { killed: false };
  }

  /**
   * Update hit flash timer.
   */
  public update(dt: number): void {
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        // Reset emissive
        this._mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissive.setHex(0x000000);
            child.material.emissiveIntensity = 0;
          }
        });
      }
    }

    // Respawn after 3 seconds if dead
    if (this.isDead) {
      this.hitFlashTimer -= dt; // reuse timer for respawn delay
      if (this.hitFlashTimer <= -3.0) {
        this.respawn();
      }
    }
  }

  public respawn(): void {
    this.health = this.maxHealth;
    this.isDead = false;
    this.hitFlashTimer = 0;
    this._mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.emissive.setHex(0x000000);
        child.material.emissiveIntensity = 0;
      }
    });
  }

  public getAllColliderHandles(): number[] {
    return this._colliders.map((c) => c.collider.handle);
  }
}

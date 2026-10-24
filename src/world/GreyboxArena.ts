import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import { createGreyboxMaterials } from './materials.ts';
import { HitboxTarget } from '../weapons/HitboxTarget.ts';

export class GreyboxArena {
  public group: THREE.Group;
  public targets: HitboxTarget[] = [];
  private _physicsWorld: PhysicsWorld;

  constructor(scene: THREE.Scene, physicsWorld: PhysicsWorld) {
    this.group = new THREE.Group();
    this.group.name = 'GreyboxArena';
    this._physicsWorld = physicsWorld;

    const materials = createGreyboxMaterials();

    this._buildFloor(materials.floorMaterial);
    this._buildPerimeterWalls(materials.wallMaterial);
    this._buildStaircase(materials.stairMaterial);
    this._buildWalkableRamp(materials.stairMaterial);
    this._buildSteepSlideRamp(materials.slideMaterial);
    this._buildObstaclePlatforms(materials.boxMaterial);
    this._buildTacticalPillars(materials.wallMaterial);

    // Phase 2 New Traversal Structures:
    this._buildLowCeilingTunnel(materials.wallMaterial);
    this._buildMantleObstacles(materials.boxMaterial);
    this._buildLadderTower(materials.wallMaterial, materials.stairMaterial);

    // Phase 3 Compound Hitbox Target Dummies:
    this._buildTargetDummies(scene);

    scene.add(this.group);
  }

  private _addBox(
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
    rotX = 0,
    rotY = 0,
    rotZ = 0
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
      mesh.rotation.set(rotX, rotY, rotZ);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    this._physicsWorld.createStaticBox(
      width / 2,
      height / 2,
      depth / 2,
      x,
      y,
      z,
      rotX,
      rotY,
      rotZ
    );

    return mesh;
  }

  private _buildFloor(material: THREE.Material): void {
    const size = 60;
    const thickness = 1.0;
    this._addBox(size, thickness, size, 0, -thickness / 2, 0, material);
  }

  private _buildPerimeterWalls(material: THREE.Material): void {
    const size = 60;
    const height = 4.0;
    const thickness = 1.0;
    const halfSize = size / 2;

    this._addBox(size, height, thickness, 0, height / 2, halfSize, material);
    this._addBox(size, height, thickness, 0, height / 2, -halfSize, material);
    this._addBox(thickness, height, size, halfSize, height / 2, 0, material);
    this._addBox(thickness, height, size, -halfSize, height / 2, 0, material);
  }

  private _buildStaircase(material: THREE.Material): void {
    const stepCount = 10;
    const stepRise = 0.18;
    const stepTread = 0.35;
    const stepWidth = 3.0;

    const startX = -10;
    const startZ = -12;

    for (let i = 0; i < stepCount; i++) {
      const stepY = (i + 1) * stepRise;
      const stepZ = startZ + i * stepTread;

      this._addBox(
        stepWidth,
        stepY,
        stepTread,
        startX,
        stepY / 2,
        stepZ,
        material
      );
    }

    const platformDepth = 4.0;
    const platformY = stepCount * stepRise;
    this._addBox(
      stepWidth,
      platformY,
      platformDepth,
      startX,
      platformY / 2,
      startZ + stepCount * stepTread + platformDepth / 2 - stepTread / 2,
      material
    );
  }

  private _buildWalkableRamp(material: THREE.Material): void {
    const angleRad = (25 * Math.PI) / 180;
    const rampLength = 6.0;
    const rampWidth = 3.0;
    const rampThickness = 0.2;

    const posX = 10;
    const posZ = -10;
    const height = Math.sin(angleRad) * rampLength;
    const posY = height / 2;

    this._addBox(
      rampWidth,
      rampThickness,
      rampLength,
      posX,
      posY,
      posZ,
      material,
      -angleRad,
      0,
      0
    );

    const platformDepth = 4.0;
    this._addBox(
      rampWidth,
      0.3,
      platformDepth,
      posX,
      height,
      posZ + (Math.cos(angleRad) * rampLength) / 2 + platformDepth / 2,
      material
    );
  }

  private _buildSteepSlideRamp(material: THREE.Material): void {
    const angleRad = (55 * Math.PI) / 180;
    const rampLength = 6.0;
    const rampWidth = 3.0;
    const rampThickness = 0.2;

    const posX = 16;
    const posZ = -10;
    const height = Math.sin(angleRad) * rampLength;
    const posY = height / 2;

    this._addBox(
      rampWidth,
      rampThickness,
      rampLength,
      posX,
      posY,
      posZ,
      material,
      -angleRad,
      0,
      0
    );

    const platformDepth = 3.0;
    this._addBox(
      rampWidth,
      0.3,
      platformDepth,
      posX,
      height,
      posZ + (Math.cos(angleRad) * rampLength) / 2 + platformDepth / 2,
      material
    );
  }

  private _buildObstaclePlatforms(material: THREE.Material): void {
    this._addBox(2.0, 0.25, 2.0, -5, 0.125, 5, material);
    this._addBox(2.5, 0.8, 2.5, 0, 0.4, 8, material);
    this._addBox(3.0, 1.6, 3.0, 6, 0.8, 8, material);
    this._addBox(2.0, 2.5, 2.0, 12, 1.25, 6, material);
  }

  private _buildTacticalPillars(material: THREE.Material): void {
    const pillarPositions = [
      { x: -15, z: 5 },
      { x: -15, z: 10 },
      { x: -15, z: 15 },
      { x: -10, z: 15 },
    ];

    for (const pos of pillarPositions) {
      this._addBox(1.2, 3.5, 1.2, pos.x, 1.75, pos.z, material);
    }
  }

  /**
   * Phase 2: Low-Ceiling Clearance Tunnel (1.35m ceiling)
   * Crouch (1.2m) fits; un-crouch to Stand (1.8m) must be rejected.
   */
  private _buildLowCeilingTunnel(material: THREE.Material): void {
    const tunnelX = -18;
    const tunnelZ = -5;
    const tunnelLength = 8.0;
    const tunnelWidth = 3.0;
    const ceilingHeight = 1.35;
    const roofThickness = 0.3;
    const wallHeight = ceilingHeight;

    // Left wall
    this._addBox(0.3, wallHeight, tunnelLength, tunnelX - tunnelWidth / 2, wallHeight / 2, tunnelZ, material);
    // Right wall
    this._addBox(0.3, wallHeight, tunnelLength, tunnelX + tunnelWidth / 2, wallHeight / 2, tunnelZ, material);
    // Roof (at y = 1.35m)
    this._addBox(tunnelWidth + 0.6, roofThickness, tunnelLength, tunnelX, ceilingHeight + roofThickness / 2, tunnelZ, material);
  }

  /**
   * Phase 2: Mantle Test Barriers
   * 1.2m obstacle (mid-mantle) and 1.7m obstacle (high-mantle)
   */
  private _buildMantleObstacles(material: THREE.Material): void {
    // 1. Mid Mantle Wall: 1.2m high, 0.5m thick, 3m wide
    this._addBox(3.0, 1.2, 0.5, -2, 0.6, -5, material);

    // 2. High Mantle Wall: 1.7m high, 0.5m thick, 3m wide
    this._addBox(3.0, 1.7, 0.5, 3, 0.85, -5, material);
  }

  /**
   * Phase 2: Ladder Tower Structure
   * 4.0m vertical tower with ladder mounted on south face
   */
  private _buildLadderTower(wallMaterial: THREE.Material, rungMaterial: THREE.Material): void {
    const towerX = 22;
    const towerZ = 5;
    const towerHeight = 4.0;
    const towerSize = 4.0;

    // Tower Platform
    this._addBox(towerSize, towerHeight, towerSize, towerX, towerHeight / 2, towerZ, wallMaterial);

    // Ladder rungs on South Face (Z = towerZ - towerSize/2)
    const ladderZ = towerZ - towerSize / 2 - 0.05;
    const ladderNormal = { x: 0, y: 0, z: -1 }; // faces outward south

    // Register ladder in physics
    const bottomPos = { x: towerX, y: 0, z: ladderZ };
    const topPos = { x: towerX, y: towerHeight, z: ladderZ };

    // Create a thin sensor/collider box for the ladder face
    const { collider } = this._physicsWorld.createStaticBox(
      0.6,
      towerHeight / 2,
      0.1,
      towerX,
      towerHeight / 2,
      ladderZ
    );

    this._physicsWorld.registerLadder({
      collider,
      bottom: bottomPos,
      top: topPos,
      normal: ladderNormal,
    });

    // Visual rungs
    const rungCount = 12;
    for (let i = 1; i <= rungCount; i++) {
      const rungY = (i / (rungCount + 1)) * towerHeight;
      const rungGeo = new THREE.BoxGeometry(0.8, 0.06, 0.06);
      const rungMesh = new THREE.Mesh(rungGeo, rungMaterial);
      rungMesh.position.set(towerX, rungY, ladderZ - 0.04);
      rungMesh.castShadow = true;
      this.group.add(rungMesh);
    }
  }

  private _buildTargetDummies(scene: THREE.Scene): void {
    // Dummy 1: Close range (10m ahead, max damage test)
    const t1 = new HitboxTarget(scene, this._physicsWorld, { x: 0, y: 0, z: -10 });
    this.targets.push(t1);

    // Dummy 2: Mid range (23m, damage falloff slope test)
    const t2 = new HitboxTarget(scene, this._physicsWorld, { x: 7, y: 0, z: -22 });
    this.targets.push(t2);

    // Dummy 3: Far range (30m, minimum damage threshold test)
    const t3 = new HitboxTarget(scene, this._physicsWorld, { x: -14, y: 0, z: -26 });
    this.targets.push(t3);
  }
}

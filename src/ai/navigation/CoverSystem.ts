import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../../core/PhysicsWorld.ts';
import { CollisionGroups, createInteractionGroups } from '../../config/gameConfig.ts';
import type { CoverPoint, CombatLane } from '../types.ts';

export class CoverSystem {
  public coverPoints: CoverPoint[] = [];
  private _physicsWorld: PhysicsWorld;
  private _losFilter: number;

  constructor(physicsWorld: PhysicsWorld) {
    this._physicsWorld = physicsWorld;
    this._losFilter = createInteractionGroups(
      CollisionGroups.GROUP_HITSCAN,
      CollisionGroups.GROUP_ENVIRONMENT
    );
    this._initializeCoverPoints();
  }

  private _initializeCoverPoints(): void {
    let id = 0;
    const add = (
      x: number,
      y: number,
      z: number,
      nx: number,
      nz: number,
      height: 'LOW' | 'HIGH',
      lane: CombatLane
    ) => {
      this.coverPoints.push({
        id: id++,
        position: new THREE.Vector3(x, y, z),
        normal: new THREE.Vector3(nx, 0, nz).normalize(),
        coverHeight: height,
        lane,
        isOccupied: false,
      });
    };

    // --- LEFT LANE COVERS ---
    // Tactical Pillars: (-15, 5), (-15, 10), (-15, 15), (-10, 15)
    // Pillar 1 (-15, 5)
    add(-15, 0.1, 3.4, 0, -1, 'HIGH', 'LEFT_LANE');
    add(-15, 0.1, 6.6, 0, 1, 'HIGH', 'LEFT_LANE');
    add(-16.6, 0.1, 5, -1, 0, 'HIGH', 'LEFT_LANE');
    add(-13.4, 0.1, 5, 1, 0, 'HIGH', 'LEFT_LANE');

    // Pillar 2 (-15, 10)
    add(-15, 0.1, 8.4, 0, -1, 'HIGH', 'LEFT_LANE');
    add(-15, 0.1, 11.6, 0, 1, 'HIGH', 'LEFT_LANE');
    add(-16.6, 0.1, 10, -1, 0, 'HIGH', 'LEFT_LANE');

    // Pillar 3 (-15, 15) & Pillar 4 (-10, 15)
    add(-15, 0.1, 13.4, 0, -1, 'HIGH', 'LEFT_LANE');
    add(-15, 0.1, 16.6, 0, 1, 'HIGH', 'LEFT_LANE');
    add(-10, 0.1, 13.4, 0, -1, 'HIGH', 'LEFT_LANE');
    add(-10, 0.1, 16.6, 0, 1, 'HIGH', 'LEFT_LANE');

    // Low-Ceiling Tunnel entries (-18, -5)
    add(-18, 0.1, -9.5, 0, -1, 'HIGH', 'LEFT_LANE');
    add(-18, 0.1, -0.5, 0, 1, 'HIGH', 'LEFT_LANE');

    // Staircase platform edge (-10, 1.8, -5)
    add(-10, 1.8, -4.2, 0, 1, 'LOW', 'LEFT_LANE');

    // --- CENTER LANE COVERS ---
    // Mid-mantle walls: (-2, -5, 1.2m high) and (3, -5, 1.7m high)
    add(-2, 0.1, -5.8, 0, -1, 'LOW', 'CENTER_LANE');
    add(-2, 0.1, -4.2, 0, 1, 'LOW', 'CENTER_LANE');
    add(3, 0.1, -5.8, 0, -1, 'HIGH', 'CENTER_LANE');
    add(3, 0.1, -4.2, 0, 1, 'HIGH', 'CENTER_LANE');

    // Obstacle Platform (0, 0.4, 8) & (6, 0.8, 8)
    add(0, 0.1, 6.4, 0, -1, 'LOW', 'CENTER_LANE');
    add(0, 0.1, 9.6, 0, 1, 'LOW', 'CENTER_LANE');
    add(-5, 0.1, 3.7, 0, -1, 'LOW', 'CENTER_LANE');
    add(6, 0.1, 6.2, 0, -1, 'HIGH', 'CENTER_LANE');
    add(6, 0.1, 9.8, 0, 1, 'HIGH', 'CENTER_LANE');

    // --- RIGHT LANE COVERS ---
    // Obstacle platform (12, 1.25, 6)
    add(12, 0.1, 4.7, 0, -1, 'HIGH', 'RIGHT_LANE');
    add(12, 0.1, 7.3, 0, 1, 'HIGH', 'RIGHT_LANE');

    // Walkable Ramp platform edge (10, 2.53, -4)
    add(10, 2.53, -3.2, 0, 1, 'LOW', 'RIGHT_LANE');

    // Ladder Tower corners (22, 5, 4m high)
    add(19.6, 0.1, 5, -1, 0, 'HIGH', 'RIGHT_LANE');
    add(22, 0.1, 2.6, 0, -1, 'HIGH', 'RIGHT_LANE');
    add(22, 0.1, 7.4, 0, 1, 'HIGH', 'RIGHT_LANE');
    add(24.4, 0.1, 5, 1, 0, 'HIGH', 'RIGHT_LANE');
  }

  /**
   * Evaluates and selects best tactical cover relative to a threat position.
   */
  public evaluateCover(
    botPos: THREE.Vector3,
    threatPos: THREE.Vector3,
    preferredLane?: CombatLane,
    avoidCoverId?: number
  ): CoverPoint | null {
    let bestCover: CoverPoint | null = null;
    let highestScore = -Infinity;

    for (const cp of this.coverPoints) {
      if (cp.isOccupied) continue;
      if (avoidCoverId !== undefined && cp.id === avoidCoverId) continue;

      const distToBot = botPos.distanceTo(cp.position);
      if (distToBot > 35) continue; // too far to reach safely

      const distToThreat = cp.position.distanceTo(threatPos);

      // Vector from cover to threat
      const coverToThreat = new THREE.Vector3().subVectors(threatPos, cp.position).normalize();

      // Normal alignment: dot product should be < -0.2 (obstacle is between cover and threat)
      const dot = cp.normal.dot(coverToThreat);
      if (dot > 0.1) {
        // Exposed side to threat! Skip
        continue;
      }

      // Check physics occlusion between cover position (at chest level) and threat eye level
      const eyeHeight = cp.coverHeight === 'LOW' ? 1.0 : 1.5;
      const isOccluded = this._isLineOfSightBlocked(
        new THREE.Vector3(cp.position.x, cp.position.y + eyeHeight, cp.position.z),
        threatPos
      );

      // Base scoring
      let score = 100;

      // Reward distance to bot (closer cover is safer/faster to reach)
      score -= distToBot * 2.5;

      // Penalize being too close to threat (< 6m)
      if (distToThreat < 6) {
        score -= 40;
      } else {
        score += Math.min(distToThreat, 25);
      }

      // Large bonus if physics verified obstacle occlusion
      if (isOccluded) {
        score += 60;
      }

      // Bonus if aligns with preferred lane
      if (preferredLane && cp.lane === preferredLane) {
        score += 25;
      }

      // Normal protection quality bonus
      score += (1 - dot) * 20;

      if (score > highestScore) {
        highestScore = score;
        bestCover = cp;
      }
    }

    return bestCover;
  }

  private _isLineOfSightBlocked(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.1) return false;

    dir.normalize();
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(from.x, from.y, from.z),
      new RAPIER.Vector3(dir.x, dir.y, dir.z)
    );

    const hit = this._physicsWorld.world.castRay(
      ray,
      dist - 0.2,
      true,
      undefined,
      this._losFilter
    );

    return hit !== null;
  }

  public occupyCover(coverId: number, botId: string): void {
    const cp = this.coverPoints.find((c) => c.id === coverId);
    if (cp) {
      cp.isOccupied = true;
      cp.occupiedByBotId = botId;
    }
  }

  public releaseCover(coverId: number, botId: string): void {
    const cp = this.coverPoints.find((c) => c.id === coverId);
    if (cp && cp.occupiedByBotId === botId) {
      cp.isOccupied = false;
      cp.occupiedByBotId = undefined;
    }
  }
}

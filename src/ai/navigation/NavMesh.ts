import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhysicsWorld } from '../../core/PhysicsWorld.ts';
import { CollisionGroups, createInteractionGroups } from '../../config/gameConfig.ts';
import type { NavNode, CombatLane } from '../types.ts';

export class NavMesh {
  public nodes: NavNode[] = [];
  private _physicsWorld: PhysicsWorld;
  private _raycastFilter: number;

  constructor(physicsWorld: PhysicsWorld) {
    this._physicsWorld = physicsWorld;
    this._raycastFilter = createInteractionGroups(
      CollisionGroups.GROUP_HITSCAN,
      CollisionGroups.GROUP_ENVIRONMENT
    );
    this._generateNavigationGraph();
  }

  /**
   * Generates graph of tactical nodes covering lanes, platforms, stairs, and ramps.
   */
  private _generateNavigationGraph(): void {
    const nodes: NavNode[] = [];
    let idCounter = 0;

    const addNode = (
      pos: THREE.Vector3,
      lane: CombatLane,
      isHighGround = false,
      isCover = false
    ): number => {
      const id = idCounter++;
      nodes.push({
        id,
        position: pos.clone(),
        neighbors: [],
        lane,
        isHighGround,
        isCover,
      });
      return id;
    };

    // Helper to determine lane from X coordinate
    const getLane = (x: number): CombatLane => {
      if (x < -9) return 'LEFT_LANE';
      if (x > 9) return 'RIGHT_LANE';
      return 'CENTER_LANE';
    };

    // 1. Regular floor grid across walkable areas of arena (-25 to 25)
    // Step size 3.5m
    for (let x = -24; x <= 24; x += 3.5) {
      for (let z = -24; z <= 24; z += 3.5) {
        // Skip positions inside solid obstacles
        if (this._isInsideObstacle(x, z)) continue;

        const pos = new THREE.Vector3(x, 0.1, z);
        addNode(pos, getLane(x));
      }
    }

    // 2. Tactical corridor through low-ceiling tunnel (-18, -5)
    for (let tz = -9; tz <= -1; tz += 2.0) {
      addNode(new THREE.Vector3(-18, 0.1, tz), 'LEFT_LANE', false, true);
    }

    // 3. Staircase progression to Platform (X = -10, Z from -12 to -4.5)
    // Steps rise from 0 to 1.8m
    const stairNode1 = addNode(new THREE.Vector3(-10, 0.2, -12), 'LEFT_LANE');
    const stairNode2 = addNode(new THREE.Vector3(-10, 0.9, -10), 'LEFT_LANE');
    const stairNode3 = addNode(new THREE.Vector3(-10, 1.8, -8), 'LEFT_LANE', true);
    const stairPlatform = addNode(new THREE.Vector3(-10, 1.8, -5), 'LEFT_LANE', true, true);

    // 4. Walkable Ramp progression to Platform (X = 10, Z from -10 to -3)
    // Ramp rises to Y = 2.53m
    const rampNode1 = addNode(new THREE.Vector3(10, 0.2, -10), 'RIGHT_LANE');
    const rampNode2 = addNode(new THREE.Vector3(10, 1.3, -7), 'RIGHT_LANE');
    const rampPlatform = addNode(new THREE.Vector3(10, 2.53, -4), 'RIGHT_LANE', true, true);

    // 5. High-ground vantage near Ladder Tower (X = 22, Z = 5)
    addNode(new THREE.Vector3(22, 4.0, 5), 'ELEVATED', true, true);

    // 6. Tactical Cover positions around pillars & barriers
    // Pillars at (-15, 5), (-15, 10), (-15, 15), (-10, 15)
    const pillarCovers = [
      new THREE.Vector3(-15, 0.1, 3.2),
      new THREE.Vector3(-15, 0.1, 6.8),
      new THREE.Vector3(-16.8, 0.1, 5),
      new THREE.Vector3(-15, 0.1, 8.2),
      new THREE.Vector3(-15, 0.1, 11.8),
      new THREE.Vector3(-15, 0.1, 13.2),
      new THREE.Vector3(-15, 0.1, 16.8),
      new THREE.Vector3(-10, 0.1, 13.2),
      new THREE.Vector3(-10, 0.1, 16.8),
    ];
    for (const c of pillarCovers) {
      addNode(c, 'LEFT_LANE', false, true);
    }

    // Mid-mantle wall covers (-2, -5) and (3, -5)
    const wallCovers = [
      new THREE.Vector3(-2, 0.1, -6.2),
      new THREE.Vector3(-2, 0.1, -3.8),
      new THREE.Vector3(3, 0.1, -6.2),
      new THREE.Vector3(3, 0.1, -3.8),
      new THREE.Vector3(0, 0.1, 6.2),
      new THREE.Vector3(0, 0.1, 9.8),
    ];
    for (const c of wallCovers) {
      addNode(c, 'CENTER_LANE', false, true);
    }

    // 7. Connect neighboring nodes based on distance and line-of-sight
    this.nodes = nodes;
    const maxNeighborDistSq = 5.5 * 5.5; // ~5.5m connect radius

    for (let i = 0; i < this.nodes.length; i++) {
      const a = this.nodes[i];
      for (let j = i + 1; j < this.nodes.length; j++) {
        const b = this.nodes[j];
        const distSq = a.position.distanceToSquared(b.position);

        if (distSq <= maxNeighborDistSq) {
          // If vertical difference is large, only connect if on stairs/ramp
          const dy = Math.abs(a.position.y - b.position.y);
          if (dy > 1.2 && !a.isHighGround && !b.isHighGround) continue;

          // Check line of sight with physics raycast (clear of static walls)
          if (this._hasClearTraversableLOS(a.position, b.position)) {
            a.neighbors.push(b.id);
            b.neighbors.push(a.id);
          }
        }
      }
    }

    // Explicitly link stairs chain
    this._ensureConnected(stairNode1, stairNode2);
    this._ensureConnected(stairNode2, stairNode3);
    this._ensureConnected(stairNode3, stairPlatform);

    // Explicitly link ramp chain
    this._ensureConnected(rampNode1, rampNode2);
    this._ensureConnected(rampNode2, rampPlatform);
  }

  private _ensureConnected(idA: number, idB: number): void {
    const a = this.nodes[idA];
    const b = this.nodes[idB];
    if (a && b) {
      if (!a.neighbors.includes(idB)) a.neighbors.push(idB);
      if (!b.neighbors.includes(idA)) b.neighbors.push(idA);
    }
  }

  private _isInsideObstacle(x: number, z: number): boolean {
    // Low ceiling tunnel walls: (-18, -5), width 3, length 8
    if (x > -20 && x < -16 && z > -9.5 && z < -0.5) return true;

    // Tactical Pillars: (-15, 5), (-15, 10), (-15, 15), (-10, 15), size 1.2x1.2
    const pillars = [
      { x: -15, z: 5 },
      { x: -15, z: 10 },
      { x: -15, z: 15 },
      { x: -10, z: 15 },
    ];
    for (const p of pillars) {
      if (Math.abs(x - p.x) < 1.0 && Math.abs(z - p.z) < 1.0) return true;
    }

    // Mantle obstacles: (-2, -5), (3, -5), size 3x0.5
    if (Math.abs(x - -2) < 1.7 && Math.abs(z - -5) < 0.6) return true;
    if (Math.abs(x - 3) < 1.7 && Math.abs(z - -5) < 0.6) return true;

    // Obstacle platforms:
    // (-5, 5) 2x2, (0, 8) 2.5x2.5, (6, 8) 3x3, (12, 6) 2x2
    if (Math.abs(x - -5) < 1.3 && Math.abs(z - 5) < 1.3) return true;
    if (Math.abs(x - 0) < 1.5 && Math.abs(z - 8) < 1.5) return true;
    if (Math.abs(x - 6) < 1.8 && Math.abs(z - 8) < 1.8) return true;
    if (Math.abs(x - 12) < 1.3 && Math.abs(z - 6) < 1.3) return true;

    // Tower: (22, 5), size 4x4
    if (Math.abs(x - 22) < 2.4 && Math.abs(z - 5) < 2.4) return true;

    // Stairs & Ramps (handled with custom nodes)
    if (Math.abs(x - -10) < 2.0 && z > -13 && z < -3) return true;
    if (Math.abs(x - 10) < 2.0 && z > -11 && z < -2) return true;
    if (Math.abs(x - 16) < 2.0 && z > -11 && z < -2) return true;

    return false;
  }

  private _hasClearTraversableLOS(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return true;

    dir.normalize();
    // Test ray at 0.5m above ground to check waist-level clearance
    const ray = new RAPIER.Ray(
      new RAPIER.Vector3(from.x, from.y + 0.5, from.z),
      new RAPIER.Vector3(dir.x, dir.y, dir.z)
    );

    const hit = this._physicsWorld.world.castRay(
      ray,
      dist - 0.2, // subtract small margin to not hit destination floor/step
      true,
      undefined,
      this._raycastFilter
    );

    return hit === null;
  }

  /**
   * Finds closest node to a 3D coordinate.
   */
  public findClosestNode(
    pos: THREE.Vector3 | { x: number; y: number; z: number },
    laneFilter?: CombatLane
  ): NavNode | null {
    let closest: NavNode | null = null;
    let minDistSq = Infinity;

    for (const node of this.nodes) {
      if (laneFilter && node.lane !== laneFilter) continue;
      const dx = node.position.x - pos.x;
      const dy = node.position.y - pos.y;
      const dz = node.position.z - pos.z;
      const dSq = dx * dx + dy * dy * 2.0 + dz * dz;

      if (dSq < minDistSq) {
        minDistSq = dSq;
        closest = node;
      }
    }

    return closest;
  }

  /**
   * A* Pathfinding from start to goal.
   * Supports alternative route cost penalties to avoid clustering or contested areas.
   */
  public findPath(
    startPos: THREE.Vector3,
    goalPos: THREE.Vector3,
    penalizedNodes?: Set<number>
  ): THREE.Vector3[] {
    const startNode = this.findClosestNode(startPos);
    const goalNode = this.findClosestNode(goalPos);

    if (!startNode || !goalNode) {
      return [goalPos.clone()];
    }

    if (startNode.id === goalNode.id) {
      return [goalPos.clone()];
    }

    const openSet = new Set<number>([startNode.id]);
    const cameFrom = new Map<number, number>();

    const gScore = new Map<number, number>();
    gScore.set(startNode.id, 0);

    const fScore = new Map<number, number>();
    fScore.set(startNode.id, startNode.position.distanceTo(goalNode.position));

    while (openSet.size > 0) {
      // Find node in openSet with lowest fScore
      let currentId = -1;
      let lowestF = Infinity;
      for (const id of openSet) {
        const score = fScore.get(id) ?? Infinity;
        if (score < lowestF) {
          lowestF = score;
          currentId = id;
        }
      }

      if (currentId === goalNode.id) {
        // Reconstruct path
        const path: THREE.Vector3[] = [];
        let curr: number | undefined = currentId;
        while (curr !== undefined) {
          path.unshift(this.nodes[curr].position.clone());
          curr = cameFrom.get(curr);
        }

        // Refine endpoints
        path.push(goalPos.clone());

        // Perform raycast string-pulling shortcut pass
        return this._smoothPath(path);
      }

      openSet.delete(currentId);
      const currentNode = this.nodes[currentId];
      const currentG = gScore.get(currentId) ?? Infinity;

      for (const neighborId of currentNode.neighbors) {
        const neighbor = this.nodes[neighborId];
        let edgeCost = currentNode.position.distanceTo(neighbor.position);

        // Apply penalty if node is congested or hazardous
        if (penalizedNodes && penalizedNodes.has(neighborId)) {
          edgeCost += 15.0;
        }

        const tentativeG = currentG + edgeCost;
        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, currentId);
          gScore.set(neighborId, tentativeG);
          const h = neighbor.position.distanceTo(goalNode.position);
          fScore.set(neighborId, tentativeG + h);
          openSet.add(neighborId);
        }
      }
    }

    // Fallback: direct line to goal if no connected route found
    return [goalPos.clone()];
  }

  /**
   * Raycast Line-of-Sight Path Smoothing (String Pulling):
   * Removes unnecessary intermediate waypoints if bot can walk directly to a later waypoint.
   */
  private _smoothPath(rawPath: THREE.Vector3[]): THREE.Vector3[] {
    if (rawPath.length <= 2) return rawPath;

    const smoothed: THREE.Vector3[] = [rawPath[0]];
    let currentIdx = 0;

    while (currentIdx < rawPath.length - 1) {
      let furthestReachable = currentIdx + 1;

      for (let next = rawPath.length - 1; next > currentIdx + 1; next--) {
        if (this._hasClearTraversableLOS(rawPath[currentIdx], rawPath[next])) {
          furthestReachable = next;
          break;
        }
      }

      smoothed.push(rawPath[furthestReachable]);
      currentIdx = furthestReachable;
    }

    return smoothed;
  }
}

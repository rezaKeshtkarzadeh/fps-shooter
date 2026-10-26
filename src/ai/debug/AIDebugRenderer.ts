import * as THREE from 'three';
import type { NavMesh } from '../navigation/NavMesh.ts';
import type { CoverSystem } from '../navigation/CoverSystem.ts';
import type { BotAgent } from '../bot/BotAgent.ts';
import { AcousticManager } from '../perception/AcousticManager.ts';

export interface DebugVisualOptions {
  showNavMesh: boolean;
  showCoverPoints: boolean;
  showBotPaths: boolean;
  showVisionCones: boolean;
  showSoundEvents: boolean;
}

export class AIDebugRenderer {
  public group: THREE.Group;
  private _scene: THREE.Scene;
  private _navMeshLines: THREE.LineSegments | null = null;
  private _coverPointsGroup: THREE.Group | null = null;
  private _pathLinesGroup: THREE.Group;
  private _visionGroup: THREE.Group;
  private _soundGroup: THREE.Group;

  public options: DebugVisualOptions = {
    showNavMesh: false,
    showCoverPoints: false,
    showBotPaths: true,
    showVisionCones: false,
    showSoundEvents: true,
  };

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'AIDebugRenderer';

    this._pathLinesGroup = new THREE.Group();
    this._visionGroup = new THREE.Group();
    this._soundGroup = new THREE.Group();

    this.group.add(this._pathLinesGroup);
    this.group.add(this._visionGroup);
    this.group.add(this._soundGroup);

    this._scene.add(this.group);
  }

  public buildNavMeshVisuals(navMesh: NavMesh): void {
    if (this._navMeshLines) {
      this.group.remove(this._navMeshLines);
      this._navMeshLines.geometry.dispose();
      this._navMeshLines = null;
    }

    const positions: number[] = [];
    for (const node of navMesh.nodes) {
      for (const neighborId of node.neighbors) {
        if (neighborId > node.id) {
          const neighbor = navMesh.nodes[neighborId];
          positions.push(
            node.position.x, node.position.y + 0.1, node.position.z,
            neighbor.position.x, neighbor.position.y + 0.1, neighbor.position.z
          );
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.35,
    });
    this._navMeshLines = new THREE.LineSegments(geo, mat);
    this._navMeshLines.visible = this.options.showNavMesh;
    this.group.add(this._navMeshLines);
  }

  public buildCoverVisuals(coverSystem: CoverSystem): void {
    if (this._coverPointsGroup) {
      this.group.remove(this._coverPointsGroup);
      this._coverPointsGroup = null;
    }

    this._coverPointsGroup = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lowMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const highMat = new THREE.MeshBasicMaterial({ color: 0x2288ff });

    for (const cp of coverSystem.coverPoints) {
      const mesh = new THREE.Mesh(sphereGeo, cp.coverHeight === 'LOW' ? lowMat : highMat);
      mesh.position.set(cp.position.x, cp.position.y + 0.3, cp.position.z);
      this._coverPointsGroup.add(mesh);
    }

    this._coverPointsGroup.visible = this.options.showCoverPoints;
    this.group.add(this._coverPointsGroup);
  }

  public update(bots: BotAgent[]): void {
    if (this._navMeshLines) {
      this._navMeshLines.visible = this.options.showNavMesh;
    }
    if (this._coverPointsGroup) {
      this._coverPointsGroup.visible = this.options.showCoverPoints;
    }

    // 1. Update Bot Path Lines
    this._clearGroup(this._pathLinesGroup);
    if (this.options.showBotPaths) {
      for (const bot of bots) {
        if (!bot.isAlive || bot.currentPath.length <= 1) continue;

        const pathPoints = [bot.position.clone(), ...bot.currentPath.slice(bot.currentPathIndex)];
        const curveGeo = new THREE.BufferGeometry().setFromPoints(
          pathPoints.map((p) => new THREE.Vector3(p.x, p.y + 0.2, p.z))
        );
        const lineMat = new THREE.LineBasicMaterial({
          color: bot.team === 'ENEMY' ? 0xff4444 : 0x4488ff,
          linewidth: 2,
        });
        const line = new THREE.Line(curveGeo, lineMat);
        this._pathLinesGroup.add(line);
      }
    }

    // 2. Update Sound Event Waves
    this._clearGroup(this._soundGroup);
    if (this.options.showSoundEvents) {
      const activeSounds = AcousticManager.getInstance().getAllActiveEvents();
      const ringGeo = new THREE.RingGeometry(0.8, 1.0, 16);
      ringGeo.rotateX(-Math.PI / 2);

      for (const snd of activeSounds) {
        const ringMat = new THREE.MeshBasicMaterial({
          color: snd.type === 'GUNSHOT' ? 0xff3300 : 0xffaa00,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.6 * snd.intensity,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(snd.position.x, snd.position.y + 0.1, snd.position.z);
        ring.scale.setScalar(snd.radius * 0.4);
        this._soundGroup.add(ring);
      }
    }
  }

  private _clearGroup(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
      }
    }
  }

  public dispose(): void {
    this._scene.remove(this.group);
  }
}

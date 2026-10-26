import * as THREE from 'three';
import type { EnemyMemory } from '../types.ts';

export type AlertLevel = 'UNAWARE' | 'SUSPICIOUS' | 'ALERT' | 'COMBAT';

export class BotMemory {
  public alertLevel: AlertLevel = 'UNAWARE';
  public primaryTarget: EnemyMemory | null = null;
  public knownEnemies: Map<string, EnemyMemory> = new Map();
  public investigationPoint: THREE.Vector3 | null = null;
  public lastHeardSoundDescription: string | null = null;

  private _memoryDurationSec = 8.0; // memory retains LKP for 8 seconds

  public update(): void {
    const now = performance.now() / 1000;

    for (const [id, enemy] of this.knownEnemies.entries()) {
      const timeSinceSeen = now - enemy.lastSeenTime;

      if (!enemy.hasLineOfSight) {
        // Linear decay of confidence
        enemy.confidence = Math.max(0, 1 - timeSinceSeen / this._memoryDurationSec);
      }

      if (timeSinceSeen > this._memoryDurationSec) {
        this.knownEnemies.delete(id);
        if (this.primaryTarget && this.primaryTarget.targetId === id) {
          this.primaryTarget = null;
        }
      }
    }

    // Refresh primary target
    if (this.primaryTarget) {
      const current = this.knownEnemies.get(this.primaryTarget.targetId);
      if (!current) {
        this.primaryTarget = null;
      }
    }

    // Update alert level based on target status
    if (this.primaryTarget && this.primaryTarget.hasLineOfSight) {
      this.alertLevel = 'COMBAT';
    } else if (this.primaryTarget && this.primaryTarget.confidence > 0.2) {
      this.alertLevel = 'ALERT';
    } else if (this.investigationPoint) {
      this.alertLevel = 'SUSPICIOUS';
    } else {
      this.alertLevel = 'UNAWARE';
    }
  }

  public recordVisualContact(
    targetId: string,
    pos: THREE.Vector3,
    velocity: THREE.Vector3,
    distance: number
  ): void {
    const now = performance.now() / 1000;
    const mem: EnemyMemory = {
      targetId,
      position: pos.clone(),
      velocity: velocity.clone(),
      lastSeenTime: now,
      confidence: 1.0,
      hasLineOfSight: true,
      distance,
    };

    this.knownEnemies.set(targetId, mem);
    this.primaryTarget = mem;
    this.investigationPoint = null; // direct contact supersedes investigation
  }

  public recordLostVisual(targetId: string): void {
    const mem = this.knownEnemies.get(targetId);
    if (mem) {
      mem.hasLineOfSight = false;
      // Set investigation point to last known position
      this.investigationPoint = mem.position.clone();
    }
  }

  public recordAudioStimulus(
    estimatedPos: THREE.Vector3,
    soundType: string,
    confidence: number = 0.7
  ): void {
    // If not in direct combat with visible target, investigate sound
    if (this.alertLevel !== 'COMBAT') {
      this.investigationPoint = estimatedPos.clone();
      this.lastHeardSoundDescription = `${soundType} (${Math.round(confidence * 100)}%)`;
      this.alertLevel = 'SUSPICIOUS';
    }
  }

  public shareIntelFromAlly(mem: EnemyMemory): void {
    // Only accept if more recent or currently have no target
    const existing = this.knownEnemies.get(mem.targetId);
    if (!existing || mem.lastSeenTime > existing.lastSeenTime) {
      this.knownEnemies.set(mem.targetId, {
        ...mem,
        position: mem.position.clone(),
        velocity: mem.velocity.clone(),
        confidence: mem.confidence * 0.9, // slight network attenuation
      });

      if (!this.primaryTarget || !this.primaryTarget.hasLineOfSight) {
        this.primaryTarget = this.knownEnemies.get(mem.targetId)!;
        this.investigationPoint = mem.position.clone();
        this.alertLevel = 'ALERT';
      }
    }
  }

  public clearInvestigation(): void {
    this.investigationPoint = null;
    this.lastHeardSoundDescription = null;
  }
}

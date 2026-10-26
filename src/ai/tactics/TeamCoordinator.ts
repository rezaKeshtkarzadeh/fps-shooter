import * as THREE from 'three';
import type { BotAgent } from '../bot/BotAgent.ts';
import type { CombatLane, EnemyMemory } from '../types.ts';

export class TeamCoordinator {
  private _bots: BotAgent[] = [];
  public teamName: 'ENEMY' | 'FRIENDLY';
  private _lastRoleReassignmentTime: number = 0;

  constructor(teamName: 'ENEMY' | 'FRIENDLY') {
    this.teamName = teamName;
  }

  public registerBot(bot: BotAgent): void {
    if (!this._bots.includes(bot)) {
      this._bots.push(bot);
    }
  }

  public unregisterBot(botId: string): void {
    this._bots = this._bots.filter((b) => b.id !== botId);
  }

  public get bots(): BotAgent[] {
    return this._bots;
  }

  public update(): void {
    const now = performance.now() / 1000;

    // 1. Share intel among team members (Radio Network)
    this._shareTeamIntel();

    // 2. Dynamic Role Reassignment (every 2.0s or on situation change)
    if (now - this._lastRoleReassignmentTime > 2.0) {
      this._lastRoleReassignmentTime = now;
      this._reassignRoles();
    }

    // 3. Coordinate covering fire & anti-clustering
    this._enforceTacticalDispersion();
  }

  /**
   * Radio Network: Share enemy contacts across all allied bots in team.
   */
  private _shareTeamIntel(): void {
    let mostRecentContact: EnemyMemory | null = null;

    // Find the freshest visual contact across all team members
    for (const bot of this._bots) {
      if (!bot.isAlive) continue;
      const target = bot.perception.memory.primaryTarget;
      if (target && target.hasLineOfSight) {
        if (!mostRecentContact || target.lastSeenTime > mostRecentContact.lastSeenTime) {
          mostRecentContact = target;
        }
      }
    }

    // If an ally has visual contact, share it with all other allies
    if (mostRecentContact) {
      for (const bot of this._bots) {
        if (!bot.isAlive) continue;
        // Don't share with self
        if (bot.perception.memory.primaryTarget?.hasLineOfSight) continue;
        bot.perception.memory.shareIntelFromAlly(mostRecentContact);
      }
    }
  }

  /**
   * Dynamically assign tactical roles based on combat engagement, health, and distance.
   */
  private _reassignRoles(): void {
    const aliveBots = this._bots.filter((b) => b.isAlive);
    if (aliveBots.length === 0) return;

    // Bots with low health (< retreat threshold) MUST retreat
    for (const bot of aliveBots) {
      const retreatThreshold = (bot.difficultyConfig.retreatHealthThreshold / 100) * bot.maxHealth;
      if (bot.health <= retreatThreshold) {
        bot.setRole('RETREAT');
      }
    }

    const availableBots = aliveBots.filter((b) => b.role !== 'RETREAT');
    if (availableBots.length === 0) return;

    // If only 1 bot: default to ASSAULT
    if (availableBots.length === 1) {
      availableBots[0].setRole('ASSAULT');
      return;
    }

    // Sort bots by distance to target (closest to furthest)
    availableBots.sort((a, b) => {
      const distA = a.perception.memory.primaryTarget?.distance ?? 999;
      const distB = b.perception.memory.primaryTarget?.distance ?? 999;
      return distA - distB;
    });

    // Closest bot becomes ASSAULT
    availableBots[0].setRole('ASSAULT');

    // Second bot becomes FLANK (if chance allows or multiple bots present)
    if (availableBots.length > 1) {
      const shouldFlank = Math.random() < availableBots[1].difficultyConfig.flankFrequency + 0.3;
      availableBots[1].setRole(shouldFlank ? 'FLANK' : 'SUPPORT');
    }

    // Remaining bots become SUPPORT (lay covering fire and secure perimeter)
    for (let i = 2; i < availableBots.length; i++) {
      availableBots[i].setRole('SUPPORT');
    }
  }

  /**
   * Spatial Dispersion / Anti-Clustering:
   * Prevents bots from bunching up, colliding, or repeating identical paths.
   */
  private _enforceTacticalDispersion(): void {
    const minDistance = 3.5; // meters
    const aliveBots = this._bots.filter((b) => b.isAlive);

    for (let i = 0; i < aliveBots.length; i++) {
      const a = aliveBots[i];
      for (let j = i + 1; j < aliveBots.length; j++) {
        const b = aliveBots[j];
        const dist = a.position.distanceTo(b.position);

        if (dist < minDistance && dist > 0.01) {
          // Calculate separation push vector
          const pushDir = new THREE.Vector3().subVectors(a.position, b.position).normalize();
          const overlap = (minDistance - dist) * 0.5;

          // Apply gentle lateral separation
          a.applySeparationImpulse(pushDir.clone().multiplyScalar(overlap));
          b.applySeparationImpulse(pushDir.clone().negate().multiplyScalar(overlap));
        }
      }
    }
  }

  /**
   * Check if any ally is currently flanking so support bots can lay down covering fire.
   */
  public hasActiveFlanker(): boolean {
    return this._bots.some((b) => b.isAlive && b.role === 'FLANK');
  }

  /**
   * Get lane distribution of team.
   */
  public getOccupiedLanes(): Map<CombatLane, number> {
    const map = new Map<CombatLane, number>();
    for (const b of this._bots) {
      if (b.isAlive) {
        const lane = b.currentLane;
        map.set(lane, (map.get(lane) ?? 0) + 1);
      }
    }
    return map;
  }
}

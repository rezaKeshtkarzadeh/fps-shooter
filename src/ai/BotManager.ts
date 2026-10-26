import * as THREE from 'three';
import { PhysicsWorld } from '../core/PhysicsWorld.ts';
import { NavMesh } from './navigation/NavMesh.ts';
import { CoverSystem } from './navigation/CoverSystem.ts';
import { TeamCoordinator } from './tactics/TeamCoordinator.ts';
import { BotAgent } from './bot/BotAgent.ts';
import { AIDebugRenderer } from './debug/AIDebugRenderer.ts';
import { AcousticManager } from './perception/AcousticManager.ts';
import type { PerceptionTarget } from './perception/PerceptionSystem.ts';
import type { BotDifficultyLevel, BotTelemetry } from './types.ts';
import type { HitZone } from '../weapons/types.ts';

export class BotManager {
  public navMesh: NavMesh;
  public coverSystem: CoverSystem;
  public enemyTeam: TeamCoordinator;
  public debugRenderer: AIDebugRenderer;
  public bots: BotAgent[] = [];
  public currentDifficulty: BotDifficultyLevel = 'MEDIUM';

  private _scene: THREE.Scene;
  private _physicsWorld: PhysicsWorld;

  constructor(scene: THREE.Scene, physicsWorld: PhysicsWorld) {
    this._scene = scene;
    this._physicsWorld = physicsWorld;

    this.navMesh = new NavMesh(physicsWorld);
    this.coverSystem = new CoverSystem(physicsWorld);
    this.enemyTeam = new TeamCoordinator('ENEMY');
    this.debugRenderer = new AIDebugRenderer(scene);

    // Initialize debug geometry
    this.debugRenderer.buildNavMeshVisuals(this.navMesh);
    this.debugRenderer.buildCoverVisuals(this.coverSystem);

    // Default: Spawn tactical enemy bot squad
    this.spawnSquad(3, 'MEDIUM');
  }

  public spawnSquad(count: number = 3, difficulty: BotDifficultyLevel = 'MEDIUM'): void {
    // Clear existing bots
    this.clearBots();
    this.currentDifficulty = difficulty;

    const botProfiles = [
      {
        id: 'bot_viper',
        name: 'VIPER',
        role: 'ASSAULT' as const,
        spawn: new THREE.Vector3(-14, 0.1, -18), // Left Lane
      },
      {
        id: 'bot_shadow',
        name: 'SHADOW',
        role: 'FLANK' as const,
        spawn: new THREE.Vector3(15, 0.1, -18), // Right Lane
      },
      {
        id: 'bot_ghost',
        name: 'GHOST',
        role: 'SUPPORT' as const,
        spawn: new THREE.Vector3(0, 0.1, -22), // Center Courtyard
      },
      {
        id: 'bot_reaper',
        name: 'REAPER',
        role: 'ASSAULT' as const,
        spawn: new THREE.Vector3(-18, 0.1, 8),
      },
      {
        id: 'bot_spectre',
        name: 'SPECTRE',
        role: 'FLANK' as const,
        spawn: new THREE.Vector3(18, 0.1, 10),
      },
      {
        id: 'bot_titan',
        name: 'TITAN',
        role: 'SUPPORT' as const,
        spawn: new THREE.Vector3(0, 0.1, 15),
      },
    ];

    const spawnCount = Math.min(count, botProfiles.length);
    for (let i = 0; i < spawnCount; i++) {
      const p = botProfiles[i];
      const bot = new BotAgent(
        p.id,
        p.name,
        'ENEMY',
        p.spawn,
        difficulty,
        this._scene,
        this._physicsWorld,
        this.navMesh,
        this.coverSystem
      );
      bot.setRole(p.role);
      this.bots.push(bot);
      this.enemyTeam.registerBot(bot);
    }
  }

  public setDifficulty(level: BotDifficultyLevel): void {
    this.currentDifficulty = level;
    for (const bot of this.bots) {
      bot.setDifficulty(level);
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector3,
    playerEyePos: THREE.Vector3,
    isPlayerAlive: boolean,
    onHitPlayer: (damage: number, zone: HitZone) => void
  ): void {
    // 1. Update Acoustic audio lifetime
    AcousticManager.getInstance().update();

    // 2. Prepare target list for bots (Player + other agents)
    const targets: PerceptionTarget[] = [
      {
        id: 'player_user',
        position: playerPos,
        velocity: playerVel,
        eyePosition: playerEyePos,
        team: 'PLAYER',
        isAlive: isPlayerAlive,
      },
    ];

    // 3. Update Team Coordinator
    this.enemyTeam.update();

    // 4. Update each Bot
    for (const bot of this.bots) {
      bot.update(dt, targets, onHitPlayer);
    }

    // 5. Update Debug Visuals
    this.debugRenderer.update(this.bots);
  }

  /**
   * Hit detection resolution: checks if raycast collider belongs to any bot.
   */
  public resolveHit(colliderHandle: number): { bot: BotAgent; zone: HitZone } | null {
    for (const bot of this.bots) {
      if (!bot.isAlive) continue;
      const zone = bot.resolveHitZone(colliderHandle);
      if (zone) {
        return { bot, zone };
      }
    }
    return null;
  }

  public getTelemetry(): BotTelemetry[] {
    return this.bots.map((b) => b.getTelemetry());
  }

  public clearBots(): void {
    for (const bot of this.bots) {
      this.enemyTeam.unregisterBot(bot.id);
      bot.dispose(this._scene);
    }
    this.bots = [];
  }

  public dispose(): void {
    this.clearBots();
    this.debugRenderer.dispose();
  }
}

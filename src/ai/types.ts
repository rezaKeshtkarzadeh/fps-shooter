import * as THREE from 'three';

export type BotDifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

export type BotTacticalRole = 'ASSAULT' | 'SUPPORT' | 'FLANK' | 'RETREAT';

export type BotAIState =
  | 'IDLE'
  | 'PATROL'
  | 'INVESTIGATE'
  | 'COMBAT_ENGAGE'
  | 'COMBAT_PEEK'
  | 'TAKE_COVER'
  | 'RETREAT'
  | 'FLANKING';

export type CombatLane = 'LEFT_LANE' | 'CENTER_LANE' | 'RIGHT_LANE' | 'ELEVATED';

export interface SoundEvent {
  id: string;
  type: 'GUNSHOT' | 'FOOTSTEP' | 'RELOAD' | 'IMPACT';
  position: THREE.Vector3;
  radius: number;
  intensity: number; // 0 to 1
  timestamp: number;
  sourceTeam: 'PLAYER' | 'ENEMY_BOT' | 'FRIENDLY_BOT';
}

export interface EnemyMemory {
  targetId: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  lastSeenTime: number;
  confidence: number; // 0 to 1
  hasLineOfSight: boolean;
  distance: number;
}

export interface CoverPoint {
  id: number;
  position: THREE.Vector3;
  normal: THREE.Vector3; // Direction the cover faces outward from obstacle
  coverHeight: 'LOW' | 'HIGH'; // LOW = requires crouching, HIGH = full standing cover
  lane: CombatLane;
  isOccupied: boolean;
  occupiedByBotId?: string;
}

export interface NavNode {
  id: number;
  position: THREE.Vector3;
  neighbors: number[];
  lane: CombatLane;
  isHighGround?: boolean;
  isCover?: boolean;
  coverPointId?: number;
}

export interface BotTelemetry {
  id: string;
  name: string;
  team: 'ENEMY' | 'FRIENDLY';
  role: BotTacticalRole;
  state: BotAIState;
  health: number;
  maxHealth: number;
  currentLane: CombatLane;
  hasTargetLOS: boolean;
  lastHeardSound: string | null;
  position: { x: number; y: number; z: number };
}

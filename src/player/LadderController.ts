import * as THREE from 'three';
import { GAME_CONFIG } from '../config/gameConfig.ts';
import { PhysicsWorld, type LadderData } from '../core/PhysicsWorld.ts';
import { type ContinuousInputState } from '../core/InputManager.ts';

export type LadderUpdateResult = 'CLIMBING' | 'DISMOUNT' | 'JUMP_OFF';

export class LadderController {
  private _activeLadder: LadderData | null = null;

  public get isActive(): boolean {
    return this._activeLadder !== null;
  }

  public get activeLadder(): LadderData | null {
    return this._activeLadder;
  }

  /**
   * Checks if player is in range and facing a registered ladder
   */
  public checkProximity(
    currentPos: { x: number; y: number; z: number },
    forwardVector: THREE.Vector3,
    physicsWorld: PhysicsWorld
  ): boolean {
    if (this._activeLadder) return true;

    for (const ladder of physicsWorld.ladders) {
      const dx = currentPos.x - ladder.bottom.x;
      const dz = currentPos.z - ladder.bottom.z;
      const horizDist = Math.sqrt(dx * dx + dz * dz);

      if (horizDist <= GAME_CONFIG.ladder.interactionDistance) {
        if (currentPos.y >= ladder.bottom.y - 0.5 && currentPos.y <= ladder.top.y + 1.0) {
          // Check if facing ladder
          const dot = forwardVector.x * -ladder.normal.x + forwardVector.z * -ladder.normal.z;
          if (dot > 0.4) {
            this._activeLadder = ladder;
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Updates climbing along ladder plane
   */
  public update(
    fixedDelta: number,
    currentPos: { x: number; y: number; z: number },
    input: ContinuousInputState,
    jumpAction: boolean
  ): { result: LadderUpdateResult; newPosition: { x: number; y: number; z: number }; pushOffVelocity?: THREE.Vector3 } {
    if (!this._activeLadder) {
      return { result: 'DISMOUNT', newPosition: currentPos };
    }

    // 1. Space: Jump backward off ladder
    if (jumpAction) {
      const ladder = this._activeLadder;
      this._activeLadder = null;
      const pushOffVel = new THREE.Vector3(
        ladder.normal.x * GAME_CONFIG.ladder.jumpOffImpulse,
        3.8,
        ladder.normal.z * GAME_CONFIG.ladder.jumpOffImpulse
      );
      return { result: 'JUMP_OFF', newPosition: currentPos, pushOffVelocity: pushOffVel };
    }

    // 2. Reached Top of Ladder: Vault forward onto platform
    if (currentPos.y >= this._activeLadder.top.y + 0.3) {
      const ladder = this._activeLadder;
      this._activeLadder = null;
      const dismountPos = {
        x: currentPos.x - ladder.normal.x * 0.6,
        y: ladder.top.y + 0.92,
        z: currentPos.z - ladder.normal.z * 0.6,
      };
      return { result: 'DISMOUNT', newPosition: dismountPos };
    }

    // 3. Vertical Climb Velocity driven by W/S
    let climbVel = 0;
    if (input.forward) climbVel = GAME_CONFIG.ladder.climbSpeed;
    if (input.backward) climbVel = -GAME_CONFIG.ladder.climbSpeed;

    const nextY = Math.max(
      this._activeLadder.bottom.y + 0.9,
      currentPos.y + climbVel * fixedDelta
    );

    return {
      result: 'CLIMBING',
      newPosition: {
        x: currentPos.x,
        y: nextY,
        z: currentPos.z,
      },
    };
  }

  public detach(): void {
    this._activeLadder = null;
  }
}

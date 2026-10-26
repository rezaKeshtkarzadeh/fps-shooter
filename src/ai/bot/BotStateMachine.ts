import type { BotAIState } from '../types.ts';
import type { BotAgent } from './BotAgent.ts';

export class BotStateMachine {
  public currentState: BotAIState = 'PATROL';
  private _bot: BotAgent;
  public stateTimer: number = 0;
  private _peekTimer: number = 0;
  private _isPeekingOut: boolean = false;

  constructor(bot: BotAgent) {
    this._bot = bot;
  }

  public setState(newState: BotAIState): void {
    if (this.currentState === newState) return;
    this.currentState = newState;
    this.stateTimer = 0;

    if (newState === 'COMBAT_PEEK') {
      this._peekTimer = 0;
      this._isPeekingOut = false;
    }
  }

  public update(dt: number): void {
    this.stateTimer += dt;
    const memory = this._bot.perception.memory;
    const primaryTarget = memory.primaryTarget;
    const hasLOS = primaryTarget?.hasLineOfSight ?? false;
    const role = this._bot.role;

    // --- High-Priority Universal Rule: Health Retreat ---
    if (role === 'RETREAT' || this._bot.isHealthCritical()) {
      if (this.currentState !== 'RETREAT' && this.currentState !== 'TAKE_COVER') {
        this.setState('RETREAT');
        return;
      }
    }

    switch (this.currentState) {
      case 'IDLE':
      case 'PATROL': {
        // If enemy spotted with line of sight -> immediately engage or flank
        if (hasLOS) {
          if (role === 'FLANK') {
            this.setState('FLANKING');
          } else {
            this.setState('COMBAT_ENGAGE');
          }
        } else if (memory.investigationPoint) {
          // Heard audio stimulus or lost target -> investigate
          this.setState('INVESTIGATE');
        }
        break;
      }

      case 'INVESTIGATE': {
        if (hasLOS) {
          this.setState(role === 'FLANK' ? 'FLANKING' : 'COMBAT_ENGAGE');
        } else if (!memory.investigationPoint) {
          // Finished investigating or confidence expired
          this.setState('PATROL');
        }
        break;
      }

      case 'COMBAT_ENGAGE': {
        if (!hasLOS) {
          // Lost visual contact -> investigate last known position
          this.setState('INVESTIGATE');
        } else if (this._bot.weapon.ammoInMag <= 0 || this._bot.weapon.isReloading) {
          // Reload under cover
          this.setState('TAKE_COVER');
        } else if (role === 'SUPPORT') {
          // Support bots prefer peeking from cover
          if (this._bot.currentCover) {
            this.setState('COMBAT_PEEK');
          } else {
            this.setState('TAKE_COVER');
          }
        }
        break;
      }

      case 'COMBAT_PEEK': {
        if (!hasLOS && !primaryTarget) {
          this.setState('PATROL');
          return;
        }

        // Peek cycle: 1.2s shooting burst, 1.0s ducking in cover
        this._peekTimer += dt;
        if (this._peekTimer > 2.2) {
          this._peekTimer = 0;
        }
        this._isPeekingOut = this._peekTimer < 1.2;
        break;
      }

      case 'TAKE_COVER': {
        // Once arrived at cover, peek or reload
        if (this._bot.hasReachedDestination()) {
          if (this._bot.weapon.isReloading) {
            // Stay down until reloaded
          } else if (hasLOS) {
            this.setState('COMBAT_PEEK');
          } else if (memory.investigationPoint) {
            this.setState('INVESTIGATE');
          } else {
            this.setState('PATROL');
          }
        }
        break;
      }

      case 'FLANKING': {
        // Continue flanking along side lane until advantageous angle is reached
        if (hasLOS && primaryTarget && primaryTarget.distance < 18) {
          // Close enough to execute flank ambush
          this.setState('COMBAT_ENGAGE');
        }
        break;
      }

      case 'RETREAT': {
        // Retreat until in safe cover and health regenerates or weapon reloaded
        if (this._bot.hasReachedDestination()) {
          if (!this._bot.isHealthCritical() && !this._bot.weapon.isReloading) {
            this.setState('PATROL');
          }
        }
        break;
      }
    }
  }

  public get isPeekingOut(): boolean {
    return this._isPeekingOut;
  }
}

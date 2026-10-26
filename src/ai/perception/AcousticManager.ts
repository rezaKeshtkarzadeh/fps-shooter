import * as THREE from 'three';
import type { SoundEvent } from '../types.ts';

export class AcousticManager {
  private static _instance: AcousticManager | null = null;
  private _events: SoundEvent[] = [];
  private _maxAgeSeconds = 4.0; // sounds fade out after 4s

  public static getInstance(): AcousticManager {
    if (!AcousticManager._instance) {
      AcousticManager._instance = new AcousticManager();
    }
    return AcousticManager._instance;
  }

  public static reset(): void {
    AcousticManager._instance = null;
  }

  public emitSound(
    type: SoundEvent['type'],
    position: THREE.Vector3 | { x: number; y: number; z: number },
    radius: number,
    intensity: number = 1.0,
    sourceTeam: SoundEvent['sourceTeam'] = 'PLAYER'
  ): void {
    const event: SoundEvent = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      position: new THREE.Vector3(position.x, position.y, position.z),
      radius,
      intensity: Math.min(1.0, Math.max(0.1, intensity)),
      timestamp: performance.now() / 1000,
      sourceTeam,
    };

    this._events.push(event);

    // Keep events array bounded
    if (this._events.length > 50) {
      this._events.shift();
    }
  }

  public update(): void {
    const now = performance.now() / 1000;
    this._events = this._events.filter((e) => now - e.timestamp < this._maxAgeSeconds);
  }

  public getSoundsNear(
    listenerPos: THREE.Vector3,
    sensitivityMultiplier: number = 1.0,
    listenerTeam: 'PLAYER' | 'ENEMY_BOT' | 'FRIENDLY_BOT'
  ): { event: SoundEvent; perceivedDistance: number; loudness: number }[] {
    const result: { event: SoundEvent; perceivedDistance: number; loudness: number }[] = [];
    const now = performance.now() / 1000;

    for (const evt of this._events) {
      // Don't react to sounds from identical friendly bot on same team
      if (evt.sourceTeam === listenerTeam) continue;

      const dist = listenerPos.distanceTo(evt.position);
      const effectiveRadius = evt.radius * sensitivityMultiplier;

      if (dist <= effectiveRadius) {
        // Linear attenuation falloff
        const age = now - evt.timestamp;
        const timeFactor = Math.max(0, 1 - age / this._maxAgeSeconds);
        const distFactor = Math.max(0, 1 - dist / effectiveRadius);
        const loudness = evt.intensity * distFactor * timeFactor;

        if (loudness > 0.05) {
          result.push({
            event: evt,
            perceivedDistance: dist,
            loudness,
          });
        }
      }
    }

    // Sort by most recent and loudest first
    result.sort((a, b) => b.loudness - a.loudness);
    return result;
  }

  public getAllActiveEvents(): SoundEvent[] {
    return this._events;
  }
}

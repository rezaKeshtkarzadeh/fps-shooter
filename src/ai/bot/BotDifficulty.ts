import type { BotDifficultyLevel } from '../types.ts';

export interface DifficultyConfig {
  reactionTimeMin: number; // seconds before initial fire after spotting
  reactionTimeMax: number;
  aimSpreadBase: number; // radians of aim variance / error
  aimTrackSmoothing: number; // how quickly bot turns aim toward target (rad/s)
  aimLeadTarget: boolean; // whether bot predicts target velocity
  aimHeadshotChance: number; // probability of targeting head vs center mass
  fieldOfViewDeg: number; // horizontal FOV degrees
  visionMaxRange: number; // meters
  hearingAccuracyVariance: number; // meters of noise added to sound source estimation
  hearingSensitivity: number; // multiplier on sound radius
  burstCountMin: number; // rounds per burst
  burstCountMax: number;
  burstPauseMin: number; // seconds pause between bursts
  burstPauseMax: number;
  coverEvaluationScoreWeight: number; // priority of seeking cover
  flankFrequency: number; // 0 to 1 likelihood of assigning flank role
  retreatHealthThreshold: number; // % health below which bot retreats
}

export const DIFFICULTY_PRESETS: Record<BotDifficultyLevel, DifficultyConfig> = {
  EASY: {
    reactionTimeMin: 0.55,
    reactionTimeMax: 0.85,
    aimSpreadBase: 0.085, // ~4.8 degrees spread (frequent misses)
    aimTrackSmoothing: 4.5,
    aimLeadTarget: false,
    aimHeadshotChance: 0.05,
    fieldOfViewDeg: 90,
    visionMaxRange: 35,
    hearingAccuracyVariance: 6.0,
    hearingSensitivity: 0.75,
    burstCountMin: 2,
    burstCountMax: 4,
    burstPauseMin: 0.6,
    burstPauseMax: 1.0,
    coverEvaluationScoreWeight: 0.4,
    flankFrequency: 0.1,
    retreatHealthThreshold: 20,
  },
  MEDIUM: {
    reactionTimeMin: 0.28,
    reactionTimeMax: 0.45,
    aimSpreadBase: 0.035, // ~2.0 degrees spread (tactical combat)
    aimTrackSmoothing: 8.5,
    aimLeadTarget: true,
    aimHeadshotChance: 0.20,
    fieldOfViewDeg: 110,
    visionMaxRange: 50,
    hearingAccuracyVariance: 2.5,
    hearingSensitivity: 1.0,
    burstCountMin: 3,
    burstCountMax: 6,
    burstPauseMin: 0.35,
    burstPauseMax: 0.6,
    coverEvaluationScoreWeight: 0.75,
    flankFrequency: 0.35,
    retreatHealthThreshold: 30,
  },
  HARD: {
    reactionTimeMin: 0.14,
    reactionTimeMax: 0.22,
    aimSpreadBase: 0.012, // ~0.7 degrees spread (deadly precision)
    aimTrackSmoothing: 16.0,
    aimLeadTarget: true,
    aimHeadshotChance: 0.45,
    fieldOfViewDeg: 130,
    visionMaxRange: 70,
    hearingAccuracyVariance: 0.6,
    hearingSensitivity: 1.25,
    burstCountMin: 4,
    burstCountMax: 8,
    burstPauseMin: 0.18,
    burstPauseMax: 0.35,
    coverEvaluationScoreWeight: 0.95,
    flankFrequency: 0.6,
    retreatHealthThreshold: 40,
  },
};

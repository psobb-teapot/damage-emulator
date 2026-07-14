import type { Weapon } from "../types.js";
import { ALL_WEAPONS } from "./weapons.gen.js";

/**
 * 全武器データ (psostats.com/combo-calculator 由来のスナップショット)。
 * 再生成: node tools/generate-data.mjs
 */
export const WEAPONS: Record<string, Weapon> = ALL_WEAPONS;

/** カスタム武器を手軽に作るヘルパー */
export function makeWeapon(weapon: Weapon): Weapon {
  if (weapon.atpMin > weapon.atpMax) {
    throw new Error(`${weapon.name}: atpMin (${weapon.atpMin}) > atpMax (${weapon.atpMax})`);
  }
  return weapon;
}

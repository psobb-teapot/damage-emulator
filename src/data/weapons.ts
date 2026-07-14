import type { Weapon } from "../types.js";

/**
 * サンプル武器データ。
 * 出典: https://wiki.pioneer2.net/w/<武器名> (2026-07-15 取得)
 * ここにない武器は Weapon 型で自由に定義して渡せる。
 */
export const WEAPONS: Record<string, Weapon> = {
  Excalibur: {
    name: "Excalibur",
    kind: "saber",
    atpMin: 900,
    atpMax: 950,
    ata: 60,
    grind: 0,
    special: "Berserk",
  },
  Vjaya: {
    name: "Vjaya",
    kind: "partisan",
    atpMin: 160,
    atpMax: 220,
    ata: 36,
    grind: 15,
    special: "Vjaya",
    // Vjaya の特殊は Heavy 相当の命中を持つ例外武器
    specialUsesHeavyAccuracy: true,
  },
  "Frozen Shooter": {
    name: "Frozen Shooter",
    kind: "rifle",
    atpMin: 240,
    atpMax: 250,
    ata: 60,
    grind: 9,
    special: "Snow (100% Freeze)",
    specialUsesHeavyAccuracy: true,
    specialUsesHeavyDamage: true,
  },
};

/** カスタム武器を手軽に作るヘルパー */
export function makeWeapon(weapon: Weapon): Weapon {
  if (weapon.atpMin > weapon.atpMax) {
    throw new Error(`${weapon.name}: atpMin (${weapon.atpMin}) > atpMax (${weapon.atpMax})`);
  }
  return weapon;
}

import {
  ATTACK_ACCURACY_MODIFIER,
  COMBO_ATA_MODIFIER,
  DISTANCE_PENALTY_FACTOR,
  EVP_FACTOR,
  RANGED_WEAPONS,
} from "./constants.js";
import { effectiveEvp, totalAta } from "./stats.js";
import type {
  AttackType,
  CombatContext,
  Enemy,
  PlayerStats,
  Weapon,
} from "./types.js";

/**
 * 命中率 % を計算する。
 *
 * Accuracy = ATA合計 × 攻撃タイプ修正 × コンボ段修正 − EVPeff × 0.2 − 距離ペナルティ
 *
 * - 攻撃タイプ修正: Normal 1.0 / Hard 0.7 / Special 0.5
 *   (Heavy 相当の命中を持つ例外武器の特殊は 0.7)
 * - コンボ段修正: 1段目 1.0 / 2段目 1.3 / 3段目 1.69
 * - 距離ペナルティ: 距離 × 0.33 (HU/FO かつ Smartlink 無しの射撃武器のみ)
 */
export function hitChance(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  attackType: AttackType,
  comboStep: 1 | 2 | 3,
  context: CombatContext = {},
): number {
  let typeMod = ATTACK_ACCURACY_MODIFIER[attackType];
  if (attackType === "special" && weapon.specialUsesHeavyAccuracy) {
    typeMod = ATTACK_ACCURACY_MODIFIER.hard;
  }
  const comboMod = COMBO_ATA_MODIFIER[comboStep - 1] ?? 1.0;
  const ataEff = totalAta(player, weapon) * typeMod * comboMod;
  const evpEff = effectiveEvp(enemy, context);

  let distancePenalty = 0;
  const cls = player.classCategory ?? "hunter";
  const isRanged = RANGED_WEAPONS.has(weapon.kind);
  if (isRanged && (cls === "hunter" || cls === "force") && !context.smartlink) {
    distancePenalty = (context.distance ?? 0) * DISTANCE_PENALTY_FACTOR;
  }

  const acc = ataEff - evpEff * EVP_FACTOR - distancePenalty;
  return Math.max(0, Math.min(100, acc));
}

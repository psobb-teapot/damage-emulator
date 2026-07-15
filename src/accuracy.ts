import {
  ATTACK_ACCURACY_MODIFIER,
  COMBO_ATA_MODIFIER,
  DISTANCE_PENALTY_FACTOR,
  EVP_FACTOR,
} from "./constants.js";
import { resolveSpecial } from "./data/specials.js";
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
 * - 距離ペナルティ: 距離 × 0.33 (HU/FO かつ Smartlink 無し。psostats 準拠で全武器対象)
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
  if (attackType === "special") {
    // TJS の衝撃波など、命中率が固定の特殊
    const special = resolveSpecial(weapon.special);
    if (special?.fixedAccuracy != null) return special.fixedAccuracy;
    if (weapon.specialUsesHeavyAccuracy) typeMod = ATTACK_ACCURACY_MODIFIER.hard;
  }
  const comboMod = COMBO_ATA_MODIFIER[comboStep - 1] ?? 1.0;
  const ataEff = totalAta(player, weapon) * typeMod * comboMod;
  const evpEff = effectiveEvp(enemy, context);

  let distancePenalty = 0;
  if (distancePenaltyApplies(player, context)) {
    distancePenalty = (context.distance ?? 0) * DISTANCE_PENALTY_FACTOR;
  }

  const acc = ataEff - evpEff * EVP_FACTOR - distancePenalty;
  return Math.max(0, Math.min(100, acc));
}

/** 距離ペナルティの適用条件: HU/FO かつ Smartlink 無し (psostats 準拠) */
export function distancePenaltyApplies(player: PlayerStats, context: CombatContext = {}): boolean {
  const cls = player.classCategory ?? "hunter";
  return (cls === "hunter" || cls === "force") && !context.smartlink;
}

/**
 * 命中率が 100% になるために必要な最小 Hit% を逆算する。
 *
 * 命中式 (ATA合計 × タイプ修正 × コンボ段修正 − EVPeff × 0.2 − 距離ペナ = 100) を
 * Hit% について解いたもの。0 = Hit% 不要で確定。
 * 武器の maxHitPercent を超えるかは呼び出し側で判定する。
 * TJS など必中特殊は 0 を返す。
 */
export function requiredHitPercent(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  attackType: AttackType,
  comboStep: 1 | 2 | 3,
  context: CombatContext = {},
): number {
  let typeMod = ATTACK_ACCURACY_MODIFIER[attackType];
  if (attackType === "special") {
    const special = resolveSpecial(weapon.special);
    if (special?.fixedAccuracy != null) return special.fixedAccuracy >= 100 ? 0 : Infinity;
    if (weapon.specialUsesHeavyAccuracy) typeMod = ATTACK_ACCURACY_MODIFIER.hard;
  }
  const comboMod = COMBO_ATA_MODIFIER[comboStep - 1] ?? 1.0;
  let penalty = effectiveEvp(enemy, context) * EVP_FACTOR;
  if (distancePenaltyApplies(player, context)) {
    penalty += (context.distance ?? 0) * DISTANCE_PENALTY_FACTOR;
  }
  const neededAta = (100 + penalty) / (typeMod * comboMod);
  const ataWithoutHit = totalAta(player, { ...weapon, hitPercent: 0 });
  return Math.max(0, Math.ceil(neededAta - ataWithoutHit));
}

/**
 * 命中率のレンジを返す。
 * atPointBlank = 密着時 (距離0)、atMaxRange = 武器の最大射程 (horizontalDistance) 時。
 * ペナルティ対象外 (RA / Smartlink) では両者は同値。
 */
export function hitChanceRange(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  attackType: AttackType,
  comboStep: 1 | 2 | 3,
  context: CombatContext = {},
): { atPointBlank: number; atMaxRange: number } {
  const atPointBlank = hitChance(player, weapon, enemy, attackType, comboStep, {
    ...context,
    distance: 0,
  });
  const atMaxRange = distancePenaltyApplies(player, context)
    ? hitChance(player, weapon, enemy, attackType, comboStep, {
        ...context,
        distance: weapon.horizontalDistance ?? 0,
      })
    : atPointBlank;
  return { atPointBlank, atMaxRange };
}

import {
  ATTACK_DAMAGE_MODIFIER,
  CRITICAL_MULTIPLIER,
  DAMAGE_VARIANCE_FACTOR,
  PVAR_MAX,
} from "./constants.js";
import { resolveSpecial } from "./data/specials.js";
import { effectiveAtp, effectiveDfp } from "./stats.js";
import type {
  AttackType,
  CombatContext,
  DamageRange,
  Enemy,
  PlayerStats,
  Weapon,
} from "./types.js";

/**
 * 攻撃タイプ (と武器の特殊) からダメージ倍率を求める。
 * Normal 1.0 / Hard 1.89 / Special 0.56、
 * 犠牲系 3.33 (Vjaya 5.67)、Heavy 相当威力の例外武器は 1.89。
 */
export function attackDamageModifier(weapon: Weapon, attackType: AttackType): number {
  if (attackType !== "special") return ATTACK_DAMAGE_MODIFIER[attackType];
  const special = resolveSpecial(weapon.special);
  if (!special) {
    throw new Error(`${weapon.name} には特殊攻撃がありません。`);
  }
  if (special.damageModifier != null) return special.damageModifier;
  if (weapon.specialUsesHeavyDamage) return ATTACK_DAMAGE_MODIFIER.hard;
  return ATTACK_DAMAGE_MODIFIER.special;
}

/** Damage = [(ATPeff − DFPeff) / 5] × 0.9 × 攻撃修正 (切り捨て、下限 0) */
export function rawDamage(atpEff: number, dfpEff: number, modifier: number): number {
  const dmg = Math.floor(((atpEff - dfpEff) / 5) * DAMAGE_VARIANCE_FACTOR * modifier);
  return Math.max(0, dmg);
}

/**
 * 1 ヒットあたりのダメージ幅 (min/avg/max) を計算する。
 * min: 武器ATP最小・キャラATPばらつき最小 / max: 双方最大。
 */
export function damageRange(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  attackType: AttackType,
  context: CombatContext = {},
): DamageRange {
  const modifier = attackDamageModifier(weapon, attackType);
  const dfpEff = effectiveDfp(enemy, context);
  const pvarMax = PVAR_MAX[player.classCategory ?? "hunter"];
  return {
    min: rawDamage(effectiveAtp(player, weapon, context, 0, 1), dfpEff, modifier),
    avg: rawDamage(effectiveAtp(player, weapon, context), dfpEff, modifier),
    max: rawDamage(effectiveAtp(player, weapon, context, 1, pvarMax), dfpEff, modifier),
  };
}

/** クリティカルダメージ (×1.5, 切り捨て) */
export function criticalDamage(damage: number): number {
  return Math.floor(damage * CRITICAL_MULTIPLIER);
}

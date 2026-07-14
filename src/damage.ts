import { ATTACK_DAMAGE_MODIFIER, CRITICAL_MULTIPLIER } from "./constants.js";
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
 * 共通係数 0.9 折り込み済み: Normal 0.9 / Hard 1.7 / Special 0.5、
 * 犠牲系 3.0 (Vjaya 5.1)、Heavy 相当威力の例外武器は 1.7。
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

/**
 * Damage = floor(max(0, (ATPeff − DFPeff) / 5) × 攻撃修正)
 * (修正値は 0.9 折り込み済み。psostats.com と同一の式)
 */
export function rawDamage(atpEff: number, dfpEff: number, modifier: number): number {
  const base = Math.max(0, (atpEff - dfpEff) / 5);
  return Math.floor(base * modifier);
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
  // CCA系ミニボス (Gi Gue, Mericarol 等) には武器の属性%が乗らない
  const w = enemy.ccaMiniboss && weapon.attributePercent
    ? { ...weapon, attributePercent: 0 }
    : weapon;
  return {
    min: rawDamage(effectiveAtp(player, w, context, 0), dfpEff, modifier),
    avg: rawDamage(effectiveAtp(player, w, context, 0.5), dfpEff, modifier),
    max: rawDamage(effectiveAtp(player, w, context, 1), dfpEff, modifier),
  };
}

/** クリティカルダメージ (×1.5, 切り捨て) */
export function criticalDamage(damage: number): number {
  return Math.floor(damage * CRITICAL_MULTIPLIER);
}

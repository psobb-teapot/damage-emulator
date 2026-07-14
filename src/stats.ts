import {
  CLASS_ATP_SPREAD,
  EVP_STATUS_MODIFIER,
  shiftaZalurePercent,
} from "./constants.js";
import type {
  CombatContext,
  Enemy,
  PlayerStats,
  Weapon,
} from "./types.js";

/**
 * 装備ATP: EQATP = [WATP,min + Grind×2 + FATP + BaATP] × [Watr + 1]
 * (FATP/BaATP = フレーム・バリアの ATP)
 */
export function equipmentAtp(weapon: Weapon, player: PlayerStats): number {
  const attr = (weapon.attributePercent ?? 0) / 100;
  return (weapon.atpMin + (weapon.grind ?? 0) * 2 + (player.armorAtp ?? 0)) * (1 + attr);
}

/**
 * 実効ATPの下限・上限 (psostats.com の calculateBaseDamage と同一のロジック)。
 *
 * - classMax = ステータス画面の ATP、classMin = classMax − (Pvar,max − 1)
 * - min = classMin × (1 + シフタ%) + EQATP
 * - max = classMax × (1 + シフタ%) + EQATP + WSpread + シフタ% × (WSpread + クラス分散)
 */
export function atpRange(
  player: PlayerStats,
  weapon: Weapon,
  context: CombatContext = {},
): { min: number; max: number } {
  const classSpread = CLASS_ATP_SPREAD[player.classCategory ?? "hunter"];
  const classMax = player.baseAtp;
  const classMin = classMax - classSpread;
  const weaponMin = equipmentAtp(weapon, player);
  const weaponSpread = weapon.atpMax - weapon.atpMin;
  const shifta = shiftaZalurePercent(context.shiftaLevel ?? 0) / 100;
  return {
    min: classMin * (1 + shifta) + weaponMin,
    max: classMax * (1 + shifta) + weaponMin + weaponSpread + shifta * (weaponSpread + classSpread),
  };
}

/**
 * 実効ATP。t は乱数位置 0..1 (0 = 最小ロール, 1 = 最大ロール, 0.5 = 平均)。
 */
export function effectiveAtp(
  player: PlayerStats,
  weapon: Weapon,
  context: CombatContext = {},
  t = 0.5,
): number {
  const { min, max } = atpRange(player, weapon, context);
  return min + t * (max - min);
}

/** 実効DFP: DFPeff = DFP × (1 − ザルア%) */
export function effectiveDfp(enemy: Enemy, context: CombatContext = {}): number {
  const zalure = shiftaZalurePercent(context.zalureLevel ?? 0) / 100;
  return enemy.dfp * (1 - zalure);
}

/**
 * 実効EVP: EVP × 状態異常修正。
 * (ザルアは DFP のみに作用し EVP には影響しない — wiki の命中式・psostats 実装準拠)
 */
export function effectiveEvp(enemy: Enemy, context: CombatContext = {}): number {
  let statusMod: number = EVP_STATUS_MODIFIER.none;
  if (context.frozen && context.paralyzed) statusMod = EVP_STATUS_MODIFIER.both;
  else if (context.frozen) statusMod = EVP_STATUS_MODIFIER.frozen;
  else if (context.paralyzed) statusMod = EVP_STATUS_MODIFIER.paralyzed;
  return enemy.evp * statusMod;
}

/** 合計ATA (キャラ + 武器 + Hit% + 防具) */
export function totalAta(player: PlayerStats, weapon: Weapon): number {
  return player.baseAta + weapon.ata + (weapon.hitPercent ?? 0) + (player.armorAta ?? 0);
}

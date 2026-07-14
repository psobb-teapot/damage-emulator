import {
  EVP_STATUS_MODIFIER,
  PVAR_MAX,
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
 * 実効ATP: ATPeff = [BaseATP + Wvar × WSpread] × (1 + SA) + EQATP + Pvar
 *
 * @param wvar 武器ATPの乱数 0..1 (min ダメージなら 0, max なら 1, 平均なら 0.5)
 * @param pvar キャラATPの乱数 1..Pvar,max (未指定なら平均値)
 */
export function effectiveAtp(
  player: PlayerStats,
  weapon: Weapon,
  context: CombatContext = {},
  wvar = 0.5,
  pvar?: number,
): number {
  const pvarMax = PVAR_MAX[player.classCategory ?? "hunter"];
  const p = pvar ?? (1 + pvarMax) / 2;
  // BaseATP,max (ステータス画面の値) から Pvar,max を引いたものが基準
  const baseAtp = player.baseAtp - pvarMax;
  const spread = weapon.atpMax - weapon.atpMin;
  const shifta = shiftaZalurePercent(context.shiftaLevel ?? 0) / 100;
  return (baseAtp + wvar * spread) * (1 + shifta) + equipmentAtp(weapon, player) + p;
}

/** 実効DFP: DFPeff = DFP × (1 − ザルア%) */
export function effectiveDfp(enemy: Enemy, context: CombatContext = {}): number {
  const zalure = shiftaZalurePercent(context.zalureLevel ?? 0) / 100;
  return enemy.dfp * (1 - zalure);
}

/** 実効EVP: EVP × 状態異常修正 × (1 − ザルア%) */
export function effectiveEvp(enemy: Enemy, context: CombatContext = {}): number {
  let statusMod: number = EVP_STATUS_MODIFIER.none;
  if (context.frozen && context.paralyzed) statusMod = EVP_STATUS_MODIFIER.both;
  else if (context.frozen) statusMod = EVP_STATUS_MODIFIER.frozen;
  else if (context.paralyzed) statusMod = EVP_STATUS_MODIFIER.paralyzed;
  const zalure = shiftaZalurePercent(context.zalureLevel ?? 0) / 100;
  return enemy.evp * statusMod * (1 - zalure);
}

/** 合計ATA (キャラ + 武器 + 防具) */
export function totalAta(player: PlayerStats, weapon: Weapon): number {
  return player.baseAta + weapon.ata + (player.armorAta ?? 0);
}

import type { AttackType, ClassCategory, Difficulty, WeaponKind } from "./types.js";

/**
 * 出典: https://wiki.pioneer2.net/w/Game_mechanics
 */

/** ダメージ計算の攻撃修正値 */
export const ATTACK_DAMAGE_MODIFIER: Record<AttackType, number> = {
  normal: 1.0,
  hard: 1.89,
  special: 0.56, // 状態異常・吸収系特殊の共通値。犠牲系は SpecialDefinition 側で上書き
};

/** 犠牲系特殊 (Charge/Spirit/Berserk) のダメージ倍率 */
export const SACRIFICIAL_MODIFIER = 3.33;
/** Vjaya 固有のダメージ倍率 */
export const VJAYA_MODIFIER = 5.67;

/** ダメージ式の固定係数: Damage = (ATPeff - DFPeff) / 5 * 0.9 * modifier */
export const DAMAGE_VARIANCE_FACTOR = 0.9;

/** クリティカルダメージ倍率 */
export const CRITICAL_MULTIPLIER = 1.5;

/** クリティカル発生率 = min(LCK, 100) / 5 (%) */
export function criticalChance(lck: number): number {
  return Math.min(lck, 100) / 5;
}

/** 命中計算の攻撃タイプ修正 */
export const ATTACK_ACCURACY_MODIFIER: Record<AttackType, number> = {
  normal: 1.0,
  hard: 0.7,
  special: 0.5,
};

/** コンボ段ごとの ATA 修正 (1段目, 2段目, 3段目) */
export const COMBO_ATA_MODIFIER = [1.0, 1.3, 1.69] as const;

/** 命中式の EVP 係数: Accuracy = ATAeff - EVPeff * 0.2 - 距離ペナルティ */
export const EVP_FACTOR = 0.2;

/** 距離ペナルティ係数 (HU/FO かつ Smartlink 無しのとき 距離 × 0.33) */
export const DISTANCE_PENALTY_FACTOR = 0.33;

/** 状態異常による敵 EVP 修正 */
export const EVP_STATUS_MODIFIER = {
  none: 1.0,
  paralyzed: 0.85, // 麻痺またはショック
  frozen: 0.7,
  both: 0.55,
} as const;

/**
 * キャラクター ATP のばらつき幅 Pvar,max。
 * 実効キャラATP = ステータス値 − Pvar,max + Pvar (Pvar は 1..Pvar,max)
 */
export const PVAR_MAX: Record<ClassCategory, number> = {
  hunter: 6,
  ranger: 4,
  force: 3,
};

/** シフタ/ザルア Lv1-30 の効果量 % = 1.3 * (Lv - 1) + 10 */
export function shiftaZalurePercent(level: number): number {
  if (level <= 0) return 0;
  const lv = Math.min(level, 30);
  return 1.3 * (lv - 1) + 10;
}

/** 凍結発動率の難易度キャップ % (Ephinea 値。バニラは 20) */
export const FREEZE_CHANCE_CAP = 40;

/** HP吸収 (Draw/Drain/Fill/Gush) の難易度別上限 */
export const HP_DRAIN_CAP: Record<Difficulty, number> = {
  normal: 30,
  hard: 60,
  vhard: 90,
  ultimate: 120,
};

/** TP吸収 (Heart/Mind/Soul/Geist) の難易度別上限 */
export const TP_DRAIN_CAP: Record<Difficulty, number> = {
  normal: 25,
  hard: 50,
  vhard: 75,
  ultimate: 100,
};

/** EXP奪取 (Master's/Lord's/King's) の難易度別上限 */
export const EXP_STEAL_CAP: Record<Difficulty, number> = {
  normal: 20,
  hard: 40,
  vhard: 60,
  ultimate: 80,
};

/**
 * アンドロイド (HUcast/HUcaseal/RAcast/RAcaseal) が Ultimate で使う
 * Devil's/Demon's の削り割合 (通常 50%/75% → 20%/45%)
 */
export const HP_CUT_ANDROID_ULTIMATE: Record<string, number> = {
  "Devil's": 20,
  "Demon's": 45,
};

/** 武器種ごとの 1 攻撃あたりのデフォルトヒット数 (単体対象) */
export const DEFAULT_HITS_PER_ATTACK: Record<WeaponKind, number> = {
  saber: 1,
  sword: 1,
  dagger: 2,
  partisan: 1,
  slicer: 1,
  katana: 1,
  twinSword: 2,
  doubleSaber: 2,
  claw: 1,
  fist: 2,
  handgun: 1,
  rifle: 1,
  mechgun: 3,
  shot: 1,
  launcher: 1,
  card: 1,
  cane: 1,
  rod: 1,
  wand: 1,
};

/** 射撃武器 (距離ペナルティの対象) */
export const RANGED_WEAPONS: ReadonlySet<WeaponKind> = new Set([
  "handgun",
  "rifle",
  "mechgun",
  "shot",
  "launcher",
  "card",
  "slicer",
]);

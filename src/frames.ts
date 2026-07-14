import {
  CLASS_SPECIFIC_FRAME_DATA,
  FEMALE_FRAME_DATA,
  FRAME_DATA,
  type AnimationFrames,
} from "./data/animation.gen.js";
import { CLASSES } from "./data/classes.js";
import type { AttackType, Weapon } from "./types.js";

/**
 * コンボの所要フレーム数 (攻撃速度) の計算。
 * ロジック出典: psostats.com/combo-calculator (getFramesForCombo / getFrameDataForWeapon)
 */

export interface ComboFramesResult {
  /** 合計フレーム数。フレームデータが無い組み合わせは null */
  frames: number | null;
  /** 使用したアニメーションデータの種別 */
  source: "class-specific" | "female" | "base" | "unknown";
}

/** クラスと武器アニメーションからフレームデータを解決する */
export function frameDataFor(
  weapon: Weapon,
  className: keyof typeof CLASSES,
): { data: AnimationFrames | null; source: ComboFramesResult["source"] } {
  const animation = weapon.animation ?? "";
  const classSpecific = CLASS_SPECIFIC_FRAME_DATA[className]?.[animation];
  if (classSpecific) return { data: classSpecific, source: "class-specific" };
  if (CLASSES[className]?.gender === "female") {
    const female = FEMALE_FRAME_DATA[animation];
    if (female) return { data: female, source: "female" };
  }
  const base = FRAME_DATA[animation];
  if (base) return { data: base, source: "base" };
  return { data: null, source: "unknown" };
}

/**
 * コンボ (1〜3段) の合計フレーム数。
 * 各段: Normal は n / Heavy・Special は h、後続がある段はキャンセル値 (c) を使う。
 * 単発武器 (Master Raven 等) に2段目以降を指定した場合など、
 * データが無い組み合わせは frames: null を返す (psostats はクラッシュする)。
 */
export function comboFrames(
  weapon: Weapon,
  className: keyof typeof CLASSES,
  attacks: AttackType[],
): ComboFramesResult {
  const { data, source } = frameDataFor(weapon, className);
  if (!data || attacks.length === 0) return { frames: null, source };

  const [a1, a2, a3] = [attacks[0], attacks[1], attacks[2]];
  let total = 0;
  const pick = (key: keyof AnimationFrames): boolean => {
    const v = data[key];
    if (v == null) return false;
    total += v;
    return true;
  };

  const hasA2 = a2 != null;
  const hasA3 = a3 != null;

  if (a1 === "normal") {
    if (!pick(hasA2 ? "n1c" : "n1")) return { frames: null, source };
  } else if (a1 === "hard" || a1 === "special") {
    if (!pick(hasA2 ? "h1c" : "h1")) return { frames: null, source };
  }
  if (hasA2) {
    if (a2 === "normal") {
      if (!pick(hasA3 ? "n2c" : "n2")) return { frames: null, source };
    } else {
      if (!pick(hasA3 ? "h2c" : "h2")) return { frames: null, source };
    }
  }
  if (hasA3) {
    if (a3 === "normal") {
      if (!pick("n3")) return { frames: null, source };
    } else {
      if (!pick("h3")) return { frames: null, source };
    }
  }
  return { frames: total, source };
}

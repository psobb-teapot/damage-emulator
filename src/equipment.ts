import { POSS_WEAPONS } from "./data/animation.gen.js";
import type { Weapon } from "./types.js";

/**
 * 装備セット効果 (特定の武器+防具の組み合わせボーナス) と
 * POSS ユニット・Commander Blade の ATP/ATA 補正。
 * ロジック出典: psostats.com/combo-calculator (getSetEffectAtp / getSetEffectAta)
 */

export type PossUnit = "POSS1" | "POSS2" | "POSS3" | "POSS4";

/** POSS ユニットの ATA ブースト量 (対象武器のみ) */
export const POSS_ATA_BOOST: Record<PossUnit, number> = {
  POSS1: 30,
  POSS2: 60,
  POSS3: 90,
  POSS4: 120,
};

/** Commander Blade (パーティ支援) の ATA ブースト */
export const COMMANDER_BLADE_ATA = 20;

export interface EquipmentSelection {
  weapon: Weapon;
  frameName?: string;
  barrierName?: string;
  possUnit?: PossUnit | null;
  commanderBlade?: boolean;
}

export interface EquipmentBonus {
  atp: number;
  ata: number;
}

const CRIMSON_COAT_WEAPONS = new Set(["Red Slicer", "Red Dagger", "Red Saber"]);

/** グラインド込み武器ATP最小値 (セット効果の倍率の基準) */
function weaponBaseAtp(weapon: Weapon): number {
  return weapon.atpMin + 2 * (weapon.grind ?? 0);
}

/**
 * セット効果 + POSS + Commander Blade による追加 ATP/ATA を計算する。
 * (フレーム/バリア自体の基礎 ATP/ATA は含まない — FRAMES/BARRIERS を参照)
 */
export function equipmentBonus(sel: EquipmentSelection): EquipmentBonus {
  const { weapon, frameName, barrierName } = sel;
  let atp = 0;
  let ata = 0;

  if (frameName === "Thirteen" && weapon.name === "Diska of Braveman") {
    atp += weaponBaseAtp(weapon) * 0.5;
    ata += 30;
  }
  if (frameName === "Crimson Coat" && CRIMSON_COAT_WEAPONS.has(weapon.name)) {
    atp += weaponBaseAtp(weapon) * 0.5;
    ata += 22;
  }
  if (frameName === "Samurai Armor" && weapon.name === "Orotiagito") {
    atp += weaponBaseAtp(weapon) * 0.3;
    ata += 20;
  }
  if (frameName === "Sweetheart (1)") atp += weaponBaseAtp(weapon) * 0.15;
  if (frameName === "Sweetheart (2)") atp += weaponBaseAtp(weapon) * 0.2;
  if (frameName === "Sweetheart (3)") atp += weaponBaseAtp(weapon) * 0.25;

  if (barrierName === "Safety Heart" && weapon.name === "Rambling May") {
    ata += 30;
  }

  if (sel.possUnit && POSS_WEAPONS.has(weapon.name)) {
    ata += POSS_ATA_BOOST[sel.possUnit];
  }

  if (sel.commanderBlade) {
    ata += COMMANDER_BLADE_ATA;
  }

  return { atp, ata };
}

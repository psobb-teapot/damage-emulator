import { SACRIFICIAL_MODIFIER, VJAYA_MODIFIER } from "../constants.js";
import type { SpecialDefinition } from "../types.js";

/**
 * 特殊攻撃の定義テーブル。
 * 出典: https://wiki.pioneer2.net/w/Special_attacks
 */
export const SPECIALS: Record<string, SpecialDefinition> = {
  // 即死系: 発動率 = (Power - 敵EDK) × 特殊効果係数 × ユニット倍率 (V502で2倍)
  Dim: { name: "Dim", category: "instantKill", power: 48 },
  Shadow: { name: "Shadow", category: "instantKill", power: 66 },
  Dark: { name: "Dark", category: "instantKill", power: 78 },
  Hell: { name: "Hell", category: "instantKill", power: 93 },

  // 麻痺系: 発動率 = (Power - 敵ESP) × 特殊効果係数 × ユニット倍率
  Bind: { name: "Bind", category: "paralysis", power: 32 },
  Hold: { name: "Hold", category: "paralysis", power: 48 },
  Seize: { name: "Seize", category: "paralysis", power: 64 },
  Arrest: { name: "Arrest", category: "paralysis", power: 80 },

  // 凍結系: 発動率 = min((Power - 敵ESP) × 特殊効果係数, 40) × ユニット倍率
  Ice: { name: "Ice", category: "freeze", power: 32 },
  Frost: { name: "Frost", category: "freeze", power: 48 },
  Freeze: { name: "Freeze", category: "freeze", power: 64 },
  Blizzard: { name: "Blizzard", category: "freeze", power: 80 },

  // 混乱系
  Panic: { name: "Panic", category: "confuse", power: 28 },
  Riot: { name: "Riot", category: "confuse", power: 44 },
  Havoc: { name: "Havoc", category: "confuse", power: 60 },
  Chaos: { name: "Chaos", category: "confuse", power: 76 },

  // HP吸収系: 吸収量 = min(Power% × 自分の最大HP, 難易度上限)
  Draw: { name: "Draw", category: "hpDrain", power: 5 },
  Drain: { name: "Drain", category: "hpDrain", power: 9 },
  Fill: { name: "Fill", category: "hpDrain", power: 13 },
  Gush: { name: "Gush", category: "hpDrain", power: 17 },

  // TP吸収系: 吸収量 = min(Power% × 自分の最大TP, 難易度上限)
  Heart: { name: "Heart", category: "tpDrain", power: 3 },
  Mind: { name: "Mind", category: "tpDrain", power: 4 },
  Soul: { name: "Soul", category: "tpDrain", power: 5 },
  Geist: { name: "Geist", category: "tpDrain", power: 6 },

  // EXP奪取系
  "Master's": { name: "Master's", category: "expSteal", power: 8 },
  "Lord's": { name: "Lord's", category: "expSteal", power: 10 },
  "King's": { name: "King's", category: "expSteal", power: 12 },

  // HP切断系: 発動率 50% (ユニットで上昇)。発動時に現在HPの Power% を削る
  "Devil's": { name: "Devil's", category: "hpCut", power: 50 },
  "Demon's": { name: "Demon's", category: "hpCut", power: 75 },

  // 犠牲系: ダメージ 3.33 倍
  Charge: {
    name: "Charge",
    category: "sacrificial",
    damageModifier: SACRIFICIAL_MODIFIER,
    costPerSwing: "Meseta 200",
  },
  Spirit: {
    name: "Spirit",
    category: "sacrificial",
    damageModifier: SACRIFICIAL_MODIFIER,
    costPerSwing: "TP (最大TPの1/5)",
  },
  Berserk: {
    name: "Berserk",
    category: "sacrificial",
    damageModifier: SACRIFICIAL_MODIFIER,
    costPerSwing: "HP (最大HPの1/4)。HP1では使用不可",
  },

  // Vjaya 固有: 5.67 倍、1振り 10,000 メセタ
  Vjaya: {
    name: "Vjaya",
    category: "sacrificial",
    damageModifier: VJAYA_MODIFIER,
    costPerSwing: "Meseta 10,000",
  },

  // ---- 武器固有の特殊 ----
  // ダメージ倍率は psostats.com の実装値 ÷ 0.9 (係数の折り込みを外した値)

  // Frozen Shooter / Snow Queen: 100% 凍結、Heavy 相当の威力・命中
  "Frozen Shooter": {
    name: "Frozen Shooter",
    category: "freeze",
    fixedActivation: 100,
    damageModifier: 1.89,
  },
  "Dark Flow": {
    name: "Dark Flow",
    category: "unique",
    damageModifier: 1.89,
    costPerSwing: "残りHPが最大の一定割合以下のときのみ使用可 (5 ヒット)",
  },
  TJS: {
    name: "TJS",
    category: "unique",
    damageModifier: 1.89,
    costPerSwing: "衝撃波 (Tsumikiri J-Sword)",
  },
  "Mille Marteaux": {
    name: "Mille Marteaux",
    category: "unique",
    damageModifier: 1.89,
  },
  Orotiagito: { name: "Orotiagito", category: "unique", damageModifier: 1.94 },
  Raikiri: { name: "Raikiri", category: "unique", damageModifier: 0.97 },
  "Lavis Cannon": { name: "Lavis Cannon", category: "unique", damageModifier: 0.56 },
  "Lavis Blade": { name: "Lavis Blade", category: "unique", damageModifier: 0.65 },
  // Plantain Huge Fan: 特殊はダメージなし (psostats 準拠)
  PHF: { name: "PHF", category: "unique", damageModifier: 0 },
};

export function resolveSpecial(
  special: string | SpecialDefinition | null | undefined,
): SpecialDefinition | null {
  if (!special) return null;
  if (typeof special === "object") return special;
  const def = SPECIALS[special];
  if (!def) {
    throw new Error(
      `未知の特殊攻撃です: "${special}"。SPECIALS のキーを使うか SpecialDefinition を直接指定してください。`,
    );
  }
  return def;
}

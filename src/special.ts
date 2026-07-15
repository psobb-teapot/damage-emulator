import {
  EXP_STEAL_CAP,
  FREEZE_CHANCE_CAP,
  HP_CUT_ANDROID_ULTIMATE,
  HP_DRAIN_CAP,
  TP_DRAIN_CAP,
} from "./constants.js";
import { resolveSpecial } from "./data/specials.js";
import type {
  CombatContext,
  Enemy,
  PlayerStats,
  SpecialResult,
  Weapon,
} from "./types.js";

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** V501/V502 による発動率倍率 (即死系は V502 で 2 倍) */
function unitBoost(context: CombatContext, isInstantKill: boolean): number {
  if (isInstantKill && context.v502) return 2;
  if (context.v501 || context.v502) return 1.5;
  return 1;
}

/**
 * Devil's/Demon's が現在HPから削る割合 (0-1)。
 * アンドロイドが Ultimate で使うと 20%/45% に減少。
 */
export function hpCutFraction(
  specialName: string,
  power: number,
  player: PlayerStats,
  enemy: Enemy,
): number {
  if (player.isAndroid && (enemy.difficulty ?? "ultimate") === "ultimate") {
    const reduced = HP_CUT_ANDROID_ULTIMATE[specialName];
    if (reduced != null) return reduced / 100;
  }
  return power / 100;
}

/**
 * 特殊攻撃の発動率と効果を評価する (命中したことが前提の値)。
 * 特殊攻撃を持たない武器や sacrificial (常時発動のダメージ倍率のみ) は
 * それに応じた結果を返す。
 */
export function evaluateSpecial(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  context: CombatContext = {},
): SpecialResult | null {
  const special = resolveSpecial(weapon.special);
  if (!special) return null;

  const eff = weapon.specialEffectiveness ?? 1;
  const difficulty = enemy.difficulty ?? "ultimate";
  const power = special.power ?? 0;

  switch (special.category) {
    case "instantKill": {
      if (enemy.isBoss) {
        return { name: special.name, category: special.category, activationChance: 0, effect: "ボスには無効" };
      }
      const base = (power - (enemy.edk ?? 0)) * eff;
      const chance = clampPct(clampPct(base) * unitBoost(context, true));
      return {
        name: special.name,
        category: special.category,
        activationChance: chance,
        effect: "発動時に即死 (残りHP全て)",
      };
    }
    case "freeze": {
      const base =
        special.fixedActivation ?? Math.min((power - (enemy.esp ?? 0)) * eff, FREEZE_CHANCE_CAP);
      const boosted = special.fixedActivation != null
        ? special.fixedActivation
        : clampPct(Math.max(0, base) * unitBoost(context, false));
      return {
        name: special.name,
        category: special.category,
        activationChance: enemy.isBoss ? 0 : boosted,
        effect: "発動時に凍結 (敵EVP×0.7)",
      };
    }
    case "paralysis":
    case "confuse":
    case "shock": {
      if (enemy.isBoss || (special.category === "paralysis" && enemy.isMachine)) {
        return { name: special.name, category: special.category, activationChance: 0, effect: "この敵には無効" };
      }
      const chance =
        special.fixedActivation != null
          ? clampPct(special.fixedActivation * unitBoost(context, false))
          : clampPct(clampPct((power - (enemy.esp ?? 0)) * eff) * unitBoost(context, false));
      const effect =
        special.category === "paralysis"
          ? "発動時に麻痺 (敵EVP×0.85)"
          : special.category === "confuse"
            ? "発動時に混乱"
            : "発動時にショック";
      return { name: special.name, category: special.category, activationChance: chance, effect };
    }
    case "hpCut": {
      if (enemy.isBoss) {
        return { name: special.name, category: special.category, activationChance: 0, effect: "ボスには無効" };
      }
      const chance = clampPct(50 * unitBoost(context, false));
      const fraction = hpCutFraction(special.name, power, player, enemy);
      return {
        name: special.name,
        category: special.category,
        activationChance: chance,
        hpCutFraction: fraction,
        effect: `発動時に現在HPの ${Math.round(fraction * 100)}% を削る`,
      };
    }
    case "hpDrain": {
      const cap = HP_DRAIN_CAP[difficulty];
      const amount =
        player.maxHp != null ? Math.min((power / 100) * player.maxHp, cap) : cap;
      return {
        name: special.name,
        category: special.category,
        activationChance: 100,
        effect: `命中時に HP を約 ${Math.floor(amount)} 吸収 (上限 ${cap})`,
      };
    }
    case "tpDrain": {
      const cap = TP_DRAIN_CAP[difficulty];
      const amount =
        player.maxTp != null ? Math.min((power / 100) * player.maxTp, cap) : cap;
      return {
        name: special.name,
        category: special.category,
        activationChance: 100,
        effect: `命中時に TP を約 ${Math.floor(amount)} 吸収 (上限 ${cap})`,
      };
    }
    case "expSteal": {
      const cap = EXP_STEAL_CAP[difficulty];
      return {
        name: special.name,
        category: special.category,
        activationChance: 100,
        effect: `撃破時 EXP +${power}% (上限 ${cap})`,
      };
    }
    case "sacrificial": {
      return {
        name: special.name,
        category: special.category,
        effect: `ダメージ ×${special.damageModifier}${special.costPerSwing ? `、コスト: ${special.costPerSwing}` : ""}`,
      };
    }
    case "elemental": {
      return {
        name: special.name,
        category: special.category,
        activationChance: 100,
        effect: "固定属性ダメージ (簡易対応: 通常ダメージのみ計上)",
      };
    }
    case "unique": {
      return {
        name: special.name,
        category: special.category,
        effect: `武器固有特殊: ダメージ ×${special.damageModifier ?? 1}${
          special.costPerSwing ? `、${special.costPerSwing}` : ""
        }`,
      };
    }
  }
}

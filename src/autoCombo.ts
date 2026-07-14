import { hitChance } from "./accuracy.js";
import { DEFAULT_HITS_PER_ATTACK } from "./constants.js";
import { attackDamageModifier, rawDamage } from "./damage.js";
import { CLASSES } from "./data/classes.js";
import { resolveSpecial } from "./data/specials.js";
import { comboFrames } from "./frames.js";
import { hpCutFraction } from "./special.js";
import { effectiveAtp, effectiveDfp } from "./stats.js";
import type {
  AttackType,
  CombatContext,
  Enemy,
  PlayerStats,
  Weapon,
} from "./types.js";

/**
 * 最適コンボの自動探索。
 * ロジック出典: psostats.com/combo-calculator (generateAutoCombo)
 *
 * 選択規則:
 * - 総合命中率 100% のコンボを優先 (最初に見つかったものより悪い命中率は不採用)
 * - 撃破できない場合は合計ダメージ最大、撃破できる場合は所要フレーム最小
 */

export interface AutoComboResult {
  attacks: AttackType[];
  totalDamage: number;
  /** 全ヒット命中率の積 % (SNグリッチ考慮) */
  overallAccuracy: number;
  /** 所要フレーム数 (フレームデータが無い場合 null) */
  frames: number | null;
}

const CANDIDATES: (AttackType | null)[] = [null, "normal", "hard", "special"];

/** psostats の getDamageForCombo と同じ規則でコンボ合計ダメージを計算 */
function comboTotalDamage(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  attacks: AttackType[],
  hitsPerStep: number[],
  context: CombatContext,
  useMaxRoll: boolean,
): number {
  const special = resolveSpecial(weapon.special);
  const dfpEff = effectiveDfp(enemy, context);
  const w = enemy.ccaMiniboss && weapon.attributePercent
    ? { ...weapon, attributePercent: 0 }
    : weapon;
  const atpEff = effectiveAtp(player, w, context, useMaxRoll ? 1 : 0);

  let total = 0;
  attacks.forEach((type, i) => {
    const hits = hitsPerStep[i] ?? 1;
    if (type === "special" && special?.category === "hpCut") {
      const fraction = hpCutFraction(special.name, special.power ?? 0, player, enemy);
      for (let h = 0; h < hits; h++) {
        total += Math.floor((enemy.hp - total) * fraction);
      }
    } else if (type === "special" && !special) {
      // 特殊なし武器の特殊攻撃はダメージ 0 (psostats 準拠)
    } else {
      total += rawDamage(atpEff, dfpEff, attackDamageModifier(weapon, type)) * hits;
    }
  });
  return total;
}

/** 全ヒット命中率の積 % (SNグリッチ: 2段目が高ければ1段目を置換) */
function overallAccuracy(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  attacks: AttackType[],
  hitsPerStep: number[],
  context: CombatContext,
): number {
  const accs = attacks.map((type, i) =>
    hitChance(player, weapon, enemy, type, (i + 1) as 1 | 2 | 3, context),
  );
  if (context.snGlitch && accs.length >= 2 && accs[1]! > accs[0]!) {
    accs[0] = accs[1]!;
  }
  let p = 1;
  accs.forEach((acc, i) => {
    p *= Math.pow(acc / 100, hitsPerStep[i] ?? 1);
  });
  return p * 100;
}

export function findBestCombo(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  className: keyof typeof CLASSES,
  context: CombatContext = {},
  options: { useMaxRoll?: boolean } = {},
): AutoComboResult | null {
  const defaultHits = weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind];
  const canSpecial = weapon.special != null;

  let best: AutoComboResult | null = null;

  for (const a1 of CANDIDATES) {
    for (const a2 of CANDIDATES) {
      if (a2 !== null && weapon.singleAttackOnly) continue;
      for (const a3 of CANDIDATES) {
        if (a3 !== null && weapon.singleAttackOnly) continue;
        if (a1 === null) continue;
        if (a2 === null && a3 !== null) continue;
        // 特殊なし武器の SPECIAL は psostats ではダメージ0 — 探索対象から除外
        if (!canSpecial && (a1 === "special" || a2 === "special" || a3 === "special")) continue;

        const attacks = [a1, a2, a3].filter((a): a is AttackType => a !== null);
        const hitsPerStep = attacks.map(() => defaultHits);

        const acc = overallAccuracy(player, weapon, enemy, attacks, hitsPerStep, context);
        if (acc < 100 && best !== null) continue;

        const total = comboTotalDamage(
          player, weapon, enemy, attacks, hitsPerStep, context, options.useMaxRoll ?? false,
        );
        const { frames } = comboFrames(weapon, className, attacks);

        const better =
          best === null ||
          (best.totalDamage < enemy.hp && total > best.totalDamage) ||
          (best.totalDamage >= enemy.hp &&
            total >= enemy.hp &&
            frames !== null &&
            (best.frames === null || frames < best.frames));

        if (better) {
          best = { attacks, totalDamage: total, overallAccuracy: acc, frames };
        }
      }
    }
  }
  return best;
}

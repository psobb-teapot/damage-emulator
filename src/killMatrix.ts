import { hitChance, requiredHitPercent } from "./accuracy.js";
import { DEFAULT_HITS_PER_ATTACK } from "./constants.js";
import { damageRange } from "./damage.js";
import { CLASSES } from "./data/classes.js";
import { resolveSpecial } from "./data/specials.js";
import { comboFrames } from "./frames.js";
import type {
  AttackType,
  CombatContext,
  Enemy,
  PlayerStats,
  Weapon,
} from "./types.js";

/**
 * 確定撃破マトリクス: 装備 (武器) × 敵 ごとに
 * 「最小ロール・クリティカルなし・全段命中100%」で倒し切れるコンボを探索する。
 *
 * TA の持ち込み武器の検討用: 乱数に一切依存せず必ず倒せる組み合わせだけを
 * 「確定」とする。判定は以下がすべて成立すること:
 * - 各段の命中率が 100% (武器の実 Hit% + バフ/状態異常込み)
 * - 最小ロール (武器ATP最小・キャラATPばらつき最小) の合計ダメージ ≥ 敵HP
 * - 発動が確率的な特殊 (Devil's/Demon's の削り) は確定ダメージ 0 として扱う
 */

export interface GuaranteedComboResult {
  attacks: AttackType[];
  hitsPerStep: number[];
  /** 最小ロール・クリなしの合計ダメージ (確定ダメージ) */
  totalMinDamage: number;
  /** 所要フレーム数 (アニメーションデータが無い場合 null) */
  frames: number | null;
  /**
   * 全段の命中率を 100% にするのに必要な最小 Hit% (厳密値)。
   * 0 = Hit% 不要。武器の現在 Hit% とは独立に逆算した値。
   */
  requiredHitPercent: number;
}

export interface KillMatrixCell {
  /** 現在の武器 Hit% のままで確定撃破できる最速コンボ (無ければ null) */
  guaranteed: GuaranteedComboResult | null;
  /**
   * Hit% を上げれば確定になるコンボのうち要求 Hit% が最小のもの。
   * 武器の Hit% 上限 (maxHitPercent) を超える場合は null。
   * guaranteed が非 null のときも、より低い Hit% で成立する参考値として返す。
   */
  withMoreHit: GuaranteedComboResult | null;
  /** 1コンボで出せる確定ダメージの最大値 (命中は問わない。撃破可否の目安) */
  bestMinDamage: number;
}

const CANDIDATES: (AttackType | null)[] = [null, "normal", "hard", "special"];

/**
 * SNグリッチ (命中率グリッチ) を実行できる武器の条件。
 * 出典: https://wiki.pioneer2.net/w/Accuracy_glitch
 * - 射撃武器 (スライサー/ハンドガン/ライフル/メックガン/ショット/ランチャー)
 *   は距離条件を満たせば次段の命中率を完全継承できる
 * - カードは ES 系のみ
 * - 近接武器はプロジェクタイル特殊を持つ一部 (Lavis 系、Raikiri 等) の
 *   特殊攻撃のみ完全継承可
 * - ダガー/ツインセイバーの「片ヒットのみ段修正継承」は確定計算では
 *   扱わない (未対応 = 保守側)
 */
const SN_GLITCH_RANGED_KINDS: ReadonlySet<string> = new Set([
  "slicer", "handgun", "rifle", "mechgun", "shot", "launcher",
]);
const SN_GLITCH_PROJECTILE_SPECIAL_WEAPONS: ReadonlySet<string> = new Set([
  "Lavis Cannon", "Lavis Blade", "Plantain Huge Fan", "Girasole",
  "Double Cannon", "Raikiri", "Orotiagito",
]);

/** WEAPON の ATTACKTYPE 攻撃で SNグリッチ (次段の命中率継承) が可能か */
export function snGlitchEligible(weapon: Weapon, attackType: AttackType): boolean {
  if (SN_GLITCH_RANGED_KINDS.has(weapon.kind)) return true;
  if (weapon.kind === "card" && weapon.name.startsWith("ES ")) return true;
  return (
    attackType === "special" &&
    SN_GLITCH_PROJECTILE_SPECIAL_WEAPONS.has(weapon.name)
  );
}

/** 1ヒットあたりの確定 (最小ロール) ダメージ。確率発動の hpCut は 0 */
function guaranteedDamagePerHit(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  type: AttackType,
  context: CombatContext,
): number {
  if (type === "special") {
    const special = resolveSpecial(weapon.special);
    if (!special) return 0; // 特殊なし武器の特殊攻撃 (psostats 準拠でダメージ0)
    if (special.category === "hpCut") return 0; // Devil's/Demon's は発動50%のため確定0
  }
  return damageRange(player, weapon, enemy, type, context).min;
}

/**
 * 武器×敵 1 組の確定撃破判定。
 * findBestCombo と同じ候補列挙 (コンボ不可武器は単発のみ、特殊なし武器は
 * special を除外) で全コンボを評価する。
 */
export function guaranteedKillCombo(
  player: PlayerStats,
  weapon: Weapon,
  enemy: Enemy,
  className: keyof typeof CLASSES,
  context: CombatContext = {},
): KillMatrixCell {
  const hitsFor = (type: AttackType): number =>
    type === "special"
      ? (weapon.specialHits ?? weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind])
      : (weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind]);
  const canSpecial = weapon.special != null;

  let guaranteed: GuaranteedComboResult | null = null;
  let withMoreHit: GuaranteedComboResult | null = null;
  let bestMinDamage = 0;
  const hitCap = weapon.maxHitPercent ?? 100;

  const betterFrames = (
    a: GuaranteedComboResult,
    b: GuaranteedComboResult | null,
  ): boolean => {
    if (b === null) return true;
    const fa = a.frames ?? Infinity;
    const fb = b.frames ?? Infinity;
    if (fa !== fb) return fa < fb;
    return a.attacks.length < b.attacks.length;
  };

  for (const a1 of CANDIDATES) {
    if (a1 === null) continue;
    for (const a2 of CANDIDATES) {
      if (a2 !== null && weapon.singleAttackOnly) continue;
      for (const a3 of CANDIDATES) {
        if (a3 !== null && weapon.singleAttackOnly) continue;
        if (a2 === null && a3 !== null) continue;
        if (!canSpecial && (a1 === "special" || a2 === "special" || a3 === "special")) continue;

        const attacks = [a1, a2, a3].filter((a): a is AttackType => a !== null);
        const hitsPerStep = attacks.map(hitsFor);

        const totalMinDamage = attacks.reduce(
          (sum, type, i) =>
            sum + guaranteedDamagePerHit(player, weapon, enemy, type, context) * hitsPerStep[i]!,
          0,
        );
        if (totalMinDamage > bestMinDamage) bestMinDamage = totalMinDamage;
        if (totalMinDamage < enemy.hp) continue;

        // 全段命中100%に必要な Hit% (厳密値)。どこかの段が Infinity なら不可。
        // SNグリッチ有効時、グリッチ可能な段は次段の命中率を継承できるため
        // 要求値は min(自段, 次段) になる (継承元は次段の素の値)
        const reqsRaw = attacks.map((type, i) =>
          requiredHitPercent(player, weapon, enemy, type, (i + 1) as 1 | 2 | 3, context),
        );
        const reqs = [...reqsRaw];
        if (context.snGlitch) {
          for (let k = 0; k + 1 < attacks.length; k++) {
            if (snGlitchEligible(weapon, attacks[k]!)) {
              reqs[k] = Math.min(reqs[k]!, reqsRaw[k + 1]!);
            }
          }
        }
        const requiredHit = reqs.reduce((max, r) => Math.max(max, r), 0);

        const { frames } = comboFrames(weapon, className, attacks);
        const result: GuaranteedComboResult = {
          attacks,
          hitsPerStep,
          totalMinDamage,
          frames,
          requiredHitPercent: requiredHit,
        };

        // 現在の Hit% で全段 100% か。SNグリッチはグリッチ可能な段のみ
        // 次段の命中率 (素の値) で置換する
        const accsRaw = attacks.map((type, i) =>
          hitChance(player, weapon, enemy, type, (i + 1) as 1 | 2 | 3, context),
        );
        const accs = [...accsRaw];
        if (context.snGlitch) {
          for (let k = 0; k + 1 < attacks.length; k++) {
            if (snGlitchEligible(weapon, attacks[k]!) && accsRaw[k + 1]! > accs[k]!) {
              accs[k] = accsRaw[k + 1]!;
            }
          }
        }
        if (accs.every((acc) => acc >= 100 - 1e-9) && betterFrames(result, guaranteed)) {
          guaranteed = result;
        }

        if (Number.isFinite(requiredHit) && requiredHit <= hitCap) {
          const cur = withMoreHit;
          const better =
            cur === null ||
            requiredHit < cur.requiredHitPercent ||
            (requiredHit === cur.requiredHitPercent && betterFrames(result, cur));
          if (better) withMoreHit = result;
        }
      }
    }
  }

  return { guaranteed, withMoreHit, bestMinDamage };
}

export interface KillMatrixInput {
  player: PlayerStats;
  className: keyof typeof CLASSES;
  weapons: Weapon[];
  enemies: Enemy[];
  context?: CombatContext;
}

/**
 * 装備一覧 × 敵一覧の確定撃破マトリクス。
 * 戻り値は [武器 index][敵 index] の 2 次元配列。
 */
export function buildKillMatrix(input: KillMatrixInput): KillMatrixCell[][] {
  const context = input.context ?? {};
  return input.weapons.map((weapon) =>
    input.enemies.map((enemy) =>
      guaranteedKillCombo(input.player, weapon, enemy, input.className, context),
    ),
  );
}

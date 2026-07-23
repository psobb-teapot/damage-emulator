import { distancePenaltyApplies, hitChance, hitChanceRange } from "./accuracy.js";
import { criticalChance, DEFAULT_HITS_PER_ATTACK } from "./constants.js";
import { criticalDamage, damageRange } from "./damage.js";
import { resolveSpecial } from "./data/specials.js";
import { evaluateSpecial } from "./special.js";
import type {
  ComboInput,
  ComboResult,
  HitResult,
  SpecialResult,
} from "./types.js";

/** 残りHP → 確率 の分布 (キル確率計算用) */
type HpDistribution = Map<number, number>;

function addProb(dist: HpDistribution, hp: number, p: number): void {
  if (p <= 0) return;
  const key = Math.max(0, Math.round(hp));
  dist.set(key, (dist.get(key) ?? 0) + p);
}

/**
 * コンボ (最大3段 × 各段のヒット数) をシミュレートする。
 *
 * - 各ヒットの命中率・ダメージ幅・特殊発動率を算出
 * - 命中/クリティカル/特殊 (Hell 即死・Demon's 削り) を分岐として
 *   残りHPの確率分布を逐次計算し、キル確率と期待残りHPを出す
 */
export function simulateCombo(input: ComboInput): ComboResult {
  const { player, weapon, enemy, attacks } = input;
  const context = input.context ?? {};
  if (attacks.length < 1 || attacks.length > 3) {
    throw new Error("attacks はコンボ 1〜3 段で指定してください。");
  }
  if (attacks.every((a) => a === null)) {
    throw new Error("コンボに攻撃が 1 段以上必要です (すべて空振りです)。");
  }

  const includeCrits = context.includeCriticals ?? true;
  const critChance = includeCrits ? criticalChance(player.lck) : 0;
  const defaultHits = (type: import("./types.js").AttackType): number =>
    type === "special"
      ? (weapon.specialHits ?? weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind])
      : (weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind]);

  const hits: HitResult[] = [];
  const costs: string[] = [];

  // 各段の命中率を先に計算 (空振り段は 0。SNグリッチ: 2段目が高ければ1段目を置換)
  const stepAccs = attacks.map((attack, i) =>
    attack ? hitChance(player, weapon, enemy, attack.type, (i + 1) as 1 | 2 | 3, context) : 0,
  );
  if (
    context.snGlitch &&
    attacks[0] &&
    attacks[1] &&
    stepAccs.length >= 2 &&
    stepAccs[1]! > stepAccs[0]!
  ) {
    stepAccs[0] = stepAccs[1]!;
  }
  const showRange =
    distancePenaltyApplies(player, context) && (weapon.horizontalDistance ?? 0) > 0;

  // 各ヒットの分布更新に必要な情報 (先に集めて、後で必要な場合のみ畳み込む)
  type HitOp = {
    pHit: number;
    activation: number;
    isInstantKill: boolean;
    isHpCut: boolean;
    hpCutFraction: number | null;
    damageDist: Array<[number, number]>;
    maxDamage: number;
    meanDamage: number;
  };
  const ops: HitOp[] = [];

  for (let step = 0; step < attacks.length; step++) {
    const attack = attacks[step];
    if (!attack) continue; // 空振り: コンボ段数だけ進める
    const comboStep = (step + 1) as 1 | 2 | 3;
    const nHits = attack.hits ?? defaultHits(attack.type);

    const acc = stepAccs[step]!;
    const accAtMaxRange = showRange
      ? hitChanceRange(player, weapon, enemy, attack.type, comboStep, context).atMaxRange
      : undefined;
    const dmg = damageRange(player, weapon, enemy, attack.type, context);
    const special: SpecialResult | null =
      attack.type === "special" ? evaluateSpecial(player, weapon, enemy, context) : null;

    const specialDef = attack.type === "special" ? resolveSpecial(weapon.special) : null;
    if (specialDef?.costPerSwing) {
      costs.push(`${comboStep}段目 ${specialDef.name} (1振りあたり): ${specialDef.costPerSwing}`);
    }

    // hpCut (Devil's/Demon's) は ATP ダメージを与えず、発動時のみ削る
    const isHpCut = special?.category === "hpCut";
    const isInstantKill = special?.category === "instantKill";
    const baseDamage = isHpCut ? 0 : dmg.avg;
    const avgWithCrit =
      baseDamage * (1 - critChance / 100) +
      criticalDamage(baseDamage) * (critChance / 100);
    const damageDist = isHpCut ? [] : hitDamageDistribution(dmg, critChance);

    for (let h = 0; h < nHits; h++) {
      const pHit = acc / 100;
      const activation = (special?.activationChance ?? 0) / 100;

      // 期待ダメージ (Hell/Demon's の追加分は分布計算に委ね、ここでは ATP ダメージのみ)
      const expectedDamage = pHit * avgWithCrit;

      hits.push({
        comboStep,
        attackType: attack.type,
        hitIndex: h + 1,
        accuracy: round2(acc),
        accuracyAtMaxRange: accAtMaxRange != null ? round2(accAtMaxRange) : undefined,
        criticalChance: round2(critChance),
        damage: dmg,
        avgWithCritical: round2(avgWithCrit),
        expectedDamage: round2(expectedDamage),
        special: special ?? undefined,
      });

      let maxDamage = 0;
      let meanDamage = 0;
      for (const [d, q] of damageDist) {
        if (d > maxDamage) maxDamage = d;
        meanDamage += d * q;
      }
      ops.push({
        pHit,
        activation,
        isInstantKill,
        isHpCut,
        hpCutFraction: special?.hpCutFraction ?? null,
        damageDist,
        maxDamage,
        meanDamage,
      });
    }
  }

  // --- 残りHP分布の計算 ---
  // 最大ロール (全ヒット命中・全クリティカル) でも HP に届かず、即死・削り特殊も
  // ないなら、どの分岐でも残りHPは正のまま。キル確率 0 が確定し、0 での
  // 切り上げも起きないので期待値は線形に計算でき、畳み込みを省略できる
  // (高HPボス相手の比較テーブルで分布が数千状態に膨らむのを避ける)。
  const hasSpecialBranch = ops.some((o) => (o.isInstantKill || o.isHpCut) && o.activation > 0);
  const maxTotalDamage = ops.reduce((s, o) => s + o.maxDamage, 0);

  let killProbability = 0;
  let expectedRemainingHp = 0;
  if (!hasSpecialBranch && maxTotalDamage < enemy.hp) {
    expectedRemainingHp = enemy.hp - ops.reduce((s, o) => s + o.pHit * o.meanDamage, 0);
  } else {
    // 残りHPの確率分布。初期状態: 満タン HP が確率 1
    let dist: HpDistribution = new Map([[enemy.hp, 1]]);
    for (const op of ops) {
      const next: HpDistribution = new Map();
      for (const [hp, p] of dist) {
        if (hp <= 0) {
          addProb(next, 0, p);
          continue;
        }
        // ミス
        addProb(next, hp, p * (1 - op.pHit));

        if (op.isInstantKill) {
          // 発動 → 即死 / 不発 → 特殊ダメージ
          addProb(next, 0, p * op.pHit * op.activation);
          applyDamageDistribution(next, hp, p * op.pHit * (1 - op.activation), op.damageDist);
        } else if (op.isHpCut && op.hpCutFraction != null) {
          // 発動 → 現在HPの一定割合を削る / 不発 → ダメージなし
          const cut = Math.floor(hp * op.hpCutFraction);
          addProb(next, hp - cut, p * op.pHit * op.activation);
          addProb(next, hp, p * op.pHit * (1 - op.activation));
        } else {
          applyDamageDistribution(next, hp, p * op.pHit, op.damageDist);
        }
      }
      dist = compact(next);
    }

    // 集計
    for (const [hp, p] of dist) {
      if (hp <= 0) killProbability += p;
      expectedRemainingHp += hp * p;
    }
  }

  const totals = { min: 0, avg: 0, max: 0, expected: 0 };
  for (const h of hits) {
    const isHpCut = h.special?.category === "hpCut";
    totals.min += isHpCut ? 0 : h.damage.min;
    totals.avg += isHpCut ? 0 : h.damage.avg;
    totals.max += isHpCut ? 0 : h.damage.max;
    totals.expected += h.expectedDamage;
  }
  // 期待合計はキル確率計算と整合させる (特殊込みの実効値)
  totals.expected = round2(enemy.hp - expectedRemainingHp);

  return {
    hits,
    totals: {
      min: totals.min,
      avg: totals.avg,
      max: totals.max,
      expected: totals.expected,
    },
    killProbability: round4(killProbability),
    expectedRemainingHp: round2(expectedRemainingHp),
    resourceCost: costs.length > 0 ? costs.join(" / ") : undefined,
  };
}

/** 1ヒットのダメージ分布の支持点数上限 (超えたら等確率バケットで近似) */
const MAX_DAMAGE_SUPPORT = 128;

/**
 * 1ヒットの命中時ダメージ分布 ([damage, probability] のリスト、確率合計 1)。
 * ダメージロールを [min, max] の整数一様分布とみなし (probability.ts と同じ近似)、
 * クリティカル時は各ロール値に ×1.5 切り捨てを適用する。
 * 幅が MAX_DAMAGE_SUPPORT を超える場合は等確率バケットの中央値で代表させる
 * (キル確率の誤差は高々 1/(2×MAX_DAMAGE_SUPPORT) ≈ 0.4%)。
 */
function hitDamageDistribution(
  dmg: { min: number; max: number },
  critChancePct: number,
): Array<[number, number]> {
  const lo = Math.max(0, Math.min(dmg.min, dmg.max));
  const hi = Math.max(lo, dmg.max);
  const pCrit = critChancePct / 100;
  const n = hi - lo + 1;
  const k = Math.min(n, MAX_DAMAGE_SUPPORT);
  const acc = new Map<number, number>();
  for (let i = 0; i < k; i++) {
    const d = k === n ? lo + i : lo + Math.round(((i + 0.5) * n) / k - 0.5);
    acc.set(d, (acc.get(d) ?? 0) + (1 - pCrit) / k);
    if (pCrit > 0) {
      const cd = criticalDamage(d);
      acc.set(cd, (acc.get(cd) ?? 0) + pCrit / k);
    }
  }
  return [...acc.entries()];
}

/** 命中時のダメージ分布 (通常/クリティカル込み) を残りHP分布へ反映する */
function applyDamageDistribution(
  dist: HpDistribution,
  hp: number,
  pHitTotal: number,
  damageDist: Array<[number, number]>,
): void {
  for (const [d, q] of damageDist) {
    addProb(dist, hp - d, pHitTotal * q);
  }
}

/** 分布の状態数を抑える (極小確率の枝を刈り、必要なら上位のみ残して正規化) */
function compact(dist: HpDistribution): HpDistribution {
  // 確率 1e-12 未満の状態は畳み込みコストに見合わないため落とす
  // (落ちる質量は高々 状態数×1e-12 で結果表示の精度に影響しない)
  let pruned: HpDistribution = dist;
  if (dist.size > 256) {
    pruned = new Map();
    for (const [hp, p] of dist) if (p >= 1e-12) pruned.set(hp, p);
  }
  if (pruned.size <= 4096) return pruned;
  const entries = [...pruned.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4096);
  const total = entries.reduce((s, [, p]) => s + p, 0);
  return new Map(entries.map(([hp, p]) => [hp, p / total]));
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

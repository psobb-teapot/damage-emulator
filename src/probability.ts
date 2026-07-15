import { CRITICAL_MULTIPLIER } from "./constants.js";

/**
 * 「n ヒット命中したとき敵を倒せる確率」の計算。
 *
 * 1ヒットのダメージを [min, max] の整数一様分布 (武器ATP・キャラATPの
 * 乱数ロールの近似) とし、クリティカル有効時は確率 c で
 * [floor(min×1.5), floor(max×1.5)] の一様分布に置き換わる混合分布として、
 * n 回の畳み込みから P(合計 ≥ HP) を求める。
 */

/** 1ヒットのダメージ分布 (offset = 最小値, probs[i] = P(damage = offset + i)) */
function singleHitDistribution(
  dmgMin: number,
  dmgMax: number,
  critChance: number,
): { offset: number; probs: number[] } {
  const lo = Math.min(dmgMin, dmgMax);
  const hi = Math.max(dmgMin, dmgMax);
  const critLo = Math.floor(lo * CRITICAL_MULTIPLIER);
  const critHi = Math.floor(hi * CRITICAL_MULTIPLIER);
  const c = Math.max(0, Math.min(1, critChance));

  const offset = lo;
  const size = (c > 0 ? critHi : hi) - offset + 1;
  const probs = new Array<number>(size).fill(0);

  const baseP = (1 - c) / (hi - lo + 1);
  for (let d = lo; d <= hi; d++) probs[d - offset] = (probs[d - offset] ?? 0) + baseP;
  if (c > 0) {
    const critP = c / (critHi - critLo + 1);
    for (let d = critLo; d <= critHi; d++) probs[d - offset] = (probs[d - offset] ?? 0) + critP;
  }
  return { offset, probs };
}

/**
 * n = 1..maxHits それぞれについて「n ヒット命中時に合計ダメージ ≥ hp となる確率」
 * を返す (戻り値は 0..1 の配列、[0] が 1 ヒット時)。
 * dmgMin ≤ 0 の場合はすべて 0。
 */
/**
 * 「n 本発射したとき敵を倒せる確率」(命中判定込み)。
 * 各弾は独立に確率 accuracy (0..1) で命中し、命中弾のダメージ合計が
 * HP 以上になる確率を二項分布との合成で求める。
 * accuracy = 1 なら killProbabilityByHits と一致する。
 */
export function killProbabilityWithAccuracy(
  dmgMin: number,
  dmgMax: number,
  hp: number,
  maxHits: number,
  accuracy: number,
  critChance = 0,
): number[] {
  const acc = Math.max(0, Math.min(1, accuracy));
  const pCond = killProbabilityByHits(dmgMin, dmgMax, hp, maxHits, critChance);
  const binomialPmf = (n: number, k: number): number => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    return c * Math.pow(acc, k) * Math.pow(1 - acc, n - k);
  };
  const result: number[] = [];
  for (let n = 1; n <= maxHits; n++) {
    // P(kill) = Σ_k C(n,k) acc^k (1-acc)^(n-k) × P(kill | k本命中)
    let p = 0;
    for (let k = 1; k <= n; k++) {
      p += binomialPmf(n, k) * (pCond[k - 1] ?? 0);
    }
    result.push(Math.min(1, p));
  }
  return result;
}

export function killProbabilityByHits(
  dmgMin: number,
  dmgMax: number,
  hp: number,
  maxHits: number,
  critChance = 0,
): number[] {
  if (maxHits <= 0) return [];
  if (dmgMin <= 0 && dmgMax <= 0) return new Array(maxHits).fill(0);

  const single = singleHitDistribution(Math.max(0, dmgMin), Math.max(1, dmgMax), critChance);

  // 逐次畳み込み。hp 以上に達した確率は "killed" に吸収して分布を小さく保つ
  let offset = 0;
  let probs = [1];
  let killed = 0;
  const result: number[] = [];

  for (let n = 0; n < maxHits; n++) {
    const nextOffset = offset + single.offset;
    const next = new Array<number>(probs.length + single.probs.length - 1).fill(0);
    for (let i = 0; i < probs.length; i++) {
      const p = probs[i]!;
      if (p === 0) continue;
      for (let j = 0; j < single.probs.length; j++) {
        next[i + j] = (next[i + j] ?? 0) + p * single.probs[j]!;
      }
    }
    // hp 以上を吸収
    let alive: number[] = [];
    let newKilled = killed;
    const cut = hp - nextOffset; // このインデックス以上は撃破
    if (cut <= 0) {
      newKilled += next.reduce((a, b) => a + b, 0);
      alive = [];
    } else {
      alive = next.slice(0, cut);
      for (let i = cut; i < next.length; i++) newKilled += next[i]!;
    }
    offset = nextOffset;
    probs = alive;
    killed = newKilled;
    result.push(Math.min(1, killed));
  }
  return result;
}

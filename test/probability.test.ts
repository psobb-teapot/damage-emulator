import { describe, expect, it } from "vitest";
import { killProbabilityByHits, killProbabilityWithAccuracy } from "../src/index.js";

describe("killProbabilityByHits (nヒット命中時の撃破確率)", () => {
  it("最小ロール×n ≥ HP なら確率 1 (確定)", () => {
    const p = killProbabilityByHits(100, 120, 300, 5);
    expect(p[2]).toBeCloseTo(1); // 3ヒットで 300 ≥ 300
    expect(p[3]).toBeCloseTo(1);
  });

  it("最大ロール×n < HP なら確率 0", () => {
    const p = killProbabilityByHits(100, 120, 500, 3);
    expect(p[0]).toBe(0);
    expect(p[1]).toBe(0);
    expect(p[2]).toBe(0); // 360 < 500
  });

  it("1ヒットの一様分布: P(damage ≥ hp) が正確", () => {
    // 10..19 の一様 (10通り)、hp 15 → 15..19 の5通り = 0.5
    const p = killProbabilityByHits(10, 19, 15, 1);
    expect(p[0]).toBeCloseTo(0.5);
  });

  it("2ヒットの畳み込み: 10..11 一様 ×2、hp 21 → P(合計≥21) = P(21)+P(22) = 0.5+0.25", () => {
    // 合計分布: 20 (0.25), 21 (0.5), 22 (0.25)
    const p = killProbabilityByHits(10, 11, 21, 2);
    expect(p[1]).toBeCloseTo(0.75);
  });

  it("確率は n について単調非減少", () => {
    const p = killProbabilityByHits(500, 600, 2850, 5);
    for (let i = 1; i < p.length; i++) {
      expect(p[i]!).toBeGreaterThanOrEqual(p[i - 1]!);
    }
  });

  it("クリティカル込みで確率が上がる", () => {
    // 100..110、hp 130: 通常は1ヒットで届かないがクリ (150..165) なら届く
    const noCrit = killProbabilityByHits(100, 110, 130, 1, 0);
    const withCrit = killProbabilityByHits(100, 110, 130, 1, 0.2);
    expect(noCrit[0]).toBe(0);
    expect(withCrit[0]).toBeCloseTo(0.2);
  });

  it("ダメージ0なら常に0", () => {
    const p = killProbabilityByHits(0, 0, 100, 3);
    expect(p).toEqual([0, 0, 0]);
  });
});

describe("killProbabilityWithAccuracy (命中判定込み)", () => {
  it("命中率100%なら条件付き確率と一致", () => {
    const cond = killProbabilityByHits(500, 600, 2850, 5);
    const withAcc = killProbabilityWithAccuracy(500, 600, 2850, 5, 1);
    for (let i = 0; i < 5; i++) expect(withAcc[i]).toBeCloseTo(cond[i]!, 10);
  });

  it("命中率0%なら常に0", () => {
    const p = killProbabilityWithAccuracy(500, 600, 1000, 5, 0);
    expect(p).toEqual([0, 0, 0, 0, 0]);
  });

  it("1発確殺×命中率90% → n本での確率は 1-(0.1)^n", () => {
    const p = killProbabilityWithAccuracy(1000, 1000, 500, 3, 0.9);
    expect(p[0]).toBeCloseTo(0.9);
    expect(p[1]).toBeCloseTo(1 - 0.01);
    expect(p[2]).toBeCloseTo(1 - 0.001);
  });

  it("2発必要×命中率90%・5本 → P(命中≥2) と一致", () => {
    // 確定2発 (min=max=500, hp=1000)
    const p = killProbabilityWithAccuracy(500, 500, 1000, 5, 0.9);
    // P(X≥2), X~Bin(5,0.9) = 1 − P(0) − P(1)
    const p0 = Math.pow(0.1, 5);
    const p1 = 5 * 0.9 * Math.pow(0.1, 4);
    expect(p[4]).toBeCloseTo(1 - p0 - p1, 10);
  });

  it("命中率について単調", () => {
    const lo = killProbabilityWithAccuracy(500, 600, 2850, 5, 0.5);
    const hi = killProbabilityWithAccuracy(500, 600, 2850, 5, 0.9);
    for (let i = 0; i < 5; i++) expect(hi[i]!).toBeGreaterThanOrEqual(lo[i]!);
  });
});

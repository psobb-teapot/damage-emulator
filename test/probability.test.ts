import { describe, expect, it } from "vitest";
import { killProbabilityByHits } from "../src/index.js";

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

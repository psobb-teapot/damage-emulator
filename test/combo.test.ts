import { describe, expect, it } from "vitest";
import { simulateCombo, WEAPONS, ENEMIES, playerFromClass } from "../src/index.js";
import type { ComboInput } from "../src/index.js";

const base: ComboInput = {
  player: playerFromClass("HUcast", { useMaxStats: true, lck: 100 }),
  weapon: WEAPONS["Excalibur"]!,
  enemy: ENEMIES["Bartle (Ultimate)"]!,
  attacks: [{ type: "hard" }, { type: "hard" }, { type: "hard" }],
};

describe("simulateCombo", () => {
  it("3段コンボで 3 ヒット (セイバー)", () => {
    const r = simulateCombo(base);
    expect(r.hits).toHaveLength(3);
    expect(r.hits.map((h) => h.comboStep)).toEqual([1, 2, 3]);
  });

  it("コンボ後段ほど命中率が上がる", () => {
    const r = simulateCombo(base);
    expect(r.hits[1]!.accuracy).toBeGreaterThanOrEqual(r.hits[0]!.accuracy);
    expect(r.hits[2]!.accuracy).toBeGreaterThanOrEqual(r.hits[1]!.accuracy);
  });

  it("ヒット数の上書きが効く (Excalibur は最大3体巻き込み等)", () => {
    const r = simulateCombo({ ...base, attacks: [{ type: "hard", hits: 3 }] });
    expect(r.hits).toHaveLength(3);
  });

  it("キル確率は 0..1、期待残りHPと整合する", () => {
    const r = simulateCombo(base);
    expect(r.killProbability).toBeGreaterThanOrEqual(0);
    expect(r.killProbability).toBeLessThanOrEqual(1);
    expect(r.expectedRemainingHp).toBeGreaterThanOrEqual(0);
    expect(r.expectedRemainingHp).toBeLessThanOrEqual(base.enemy.hp);
  });

  it("命中100%・ダメージ十分ならキル確率はほぼ1", () => {
    const r = simulateCombo({
      ...base,
      enemy: { ...base.enemy, hp: 10, dfp: 0, evp: 0 },
      context: { includeCriticals: false },
    });
    expect(r.killProbability).toBeCloseTo(1);
  });

  it("命中0%ならキル確率0・期待ダメージ0", () => {
    const r = simulateCombo({
      ...base,
      player: { ...base.player, baseAta: 0 },
      weapon: { ...base.weapon, ata: 0 },
    });
    expect(r.killProbability).toBe(0);
    expect(r.totals.expected).toBe(0);
    expect(r.expectedRemainingHp).toBe(base.enemy.hp);
  });

  it("Berserk 特殊 (3.33) は Hard (1.89) よりダメージが大きい", () => {
    const hard = simulateCombo({ ...base, attacks: [{ type: "hard" }] });
    const special = simulateCombo({ ...base, attacks: [{ type: "special" }] });
    expect(special.hits[0]!.damage.avg).toBeGreaterThan(hard.hits[0]!.damage.avg);
    expect(special.resourceCost).toContain("HP");
  });

  it("Demon's は ATP ダメージ 0 で、期待値は削りのみ", () => {
    const demons = simulateCombo({
      ...base,
      weapon: { ...base.weapon, special: "Demon's" },
      attacks: [{ type: "special" }],
    });
    expect(demons.hits[0]!.damage.avg).toBeGreaterThan(0); // 表示用レンジは参考値
    expect(demons.hits[0]!.avgWithCritical).toBe(0); // ATP ダメージは 0
    // 期待削り = 命中率 × 発動50% × HP×75%
    const acc = demons.hits[0]!.accuracy / 100;
    const expectedCut = base.enemy.hp * 0.75 * 0.5 * acc;
    expect(demons.totals.expected).toBeCloseTo(expectedCut, 0);
  });

  it("Hell は発動時に即死としてキル確率へ反映される", () => {
    const hell = simulateCombo({
      ...base,
      weapon: { ...base.weapon, special: "Hell", atpMin: 1, atpMax: 1 },
      player: { ...base.player, baseAtp: 1 },
      attacks: [{ type: "special" }],
      context: { includeCriticals: false },
    });
    const acc = hell.hits[0]!.accuracy / 100;
    const activation = (hell.hits[0]!.special?.activationChance ?? 0) / 100;
    expect(hell.killProbability).toBeCloseTo(acc * activation, 4);
  });

  it("メックガンはデフォルト 3 ヒット/段", () => {
    const r = simulateCombo({
      ...base,
      weapon: { name: "Test Vulcan", kind: "mechgun", atpMin: 20, atpMax: 40, ata: 30, special: "Charge" },
      attacks: [{ type: "normal" }, { type: "normal" }, { type: "normal" }],
    });
    expect(r.hits).toHaveLength(9);
  });

  it("attacks が 0 段や 4 段はエラー", () => {
    expect(() => simulateCombo({ ...base, attacks: [] })).toThrow();
    expect(() =>
      simulateCombo({
        ...base,
        attacks: [{ type: "normal" }, { type: "normal" }, { type: "normal" }, { type: "normal" }],
      }),
    ).toThrow();
  });
});

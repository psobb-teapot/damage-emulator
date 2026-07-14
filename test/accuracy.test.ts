import { describe, expect, it } from "vitest";
import { hitChance } from "../src/index.js";
import type { Enemy, PlayerStats, Weapon } from "../src/index.js";

const player: PlayerStats = {
  baseAtp: 806,
  baseAta: 230.3, // RAmar Lv200
  lck: 100,
  classCategory: "ranger",
};

const rifle: Weapon = {
  name: "Test Rifle",
  kind: "rifle",
  atpMin: 240,
  atpMax: 250,
  ata: 60,
  special: "Snow (100% Freeze)",
  specialUsesHeavyAccuracy: true,
};

const enemy: Enemy = {
  name: "Test",
  hp: 1000,
  dfp: 300,
  evp: 500,
  difficulty: "ultimate",
};

describe("hitChance", () => {
  const ata = 230.3 + 60; // 290.3

  it("Normal 1段目: ATA×1.0×1.0 − EVP×0.2", () => {
    const expected = ata * 1.0 * 1.0 - 500 * 0.2;
    expect(hitChance(player, rifle, enemy, "normal", 1)).toBeCloseTo(Math.min(100, expected));
  });

  it("Hard は ×0.7、コンボ3段目は ×1.69", () => {
    const expected = ata * 0.7 * 1.69 - 500 * 0.2;
    expect(hitChance(player, rifle, enemy, "hard", 3)).toBeCloseTo(Math.min(100, expected));
  });

  it("Heavy相当命中の特殊 (Frozen Shooter) は 0.5 ではなく 0.7", () => {
    const heavyAcc = hitChance(player, rifle, enemy, "hard", 1);
    const specialAcc = hitChance(player, rifle, enemy, "special", 1);
    expect(specialAcc).toBeCloseTo(heavyAcc);
  });

  it("通常の特殊は ×0.5", () => {
    const hellRifle: Weapon = { ...rifle, special: "Hell", specialUsesHeavyAccuracy: false };
    const expected = ata * 0.5 * 1.0 - 500 * 0.2;
    expect(hitChance(player, hellRifle, enemy, "special", 1)).toBeCloseTo(expected);
  });

  it("凍結中は EVP×0.7", () => {
    const expected = ata * 1.0 - 500 * 0.7 * 0.2;
    expect(hitChance(player, rifle, enemy, "normal", 1, { frozen: true })).toBeCloseTo(
      Math.min(100, expected),
    );
  });

  it("レンジャーには距離ペナルティなし", () => {
    const near = hitChance(player, rifle, enemy, "normal", 1, { distance: 0 });
    const far = hitChance(player, rifle, enemy, "normal", 1, { distance: 100 });
    expect(near).toBe(far);
  });

  it("ハンターの射撃は距離ペナルティあり、Smartlink で無効化", () => {
    // 100% にクランプされない ATA で比較する
    const hunter: PlayerStats = { ...player, baseAta: 120, classCategory: "hunter" };
    const near = hitChance(hunter, rifle, enemy, "normal", 1, { distance: 0 });
    const far = hitChance(hunter, rifle, enemy, "normal", 1, { distance: 100 });
    expect(near - far).toBeCloseTo(33);
    const smartlink = hitChance(hunter, rifle, enemy, "normal", 1, {
      distance: 100,
      smartlink: true,
    });
    expect(smartlink).toBe(near);
  });

  it("0-100 にクランプされる", () => {
    const blind: PlayerStats = { ...player, baseAta: 0 };
    const evasive: Enemy = { ...enemy, evp: 10000 };
    expect(hitChance(blind, { ...rifle, ata: 0 }, evasive, "special", 1)).toBe(0);
  });
});

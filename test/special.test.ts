import { describe, expect, it } from "vitest";
import { evaluateSpecial } from "../src/index.js";
import type { Enemy, PlayerStats, Weapon } from "../src/index.js";

const player: PlayerStats = {
  baseAtp: 800,
  baseAta: 200,
  lck: 100,
  classCategory: "ranger",
  maxHp: 1500,
  maxTp: 1000,
};

const enemy: Enemy = {
  name: "Test",
  hp: 3000,
  dfp: 500,
  evp: 600,
  edk: 50,
  esp: 20,
  difficulty: "ultimate",
};

function weaponWith(special: string, eff?: number): Weapon {
  return {
    name: `Test (${special})`,
    kind: "rifle",
    atpMin: 100,
    atpMax: 150,
    ata: 40,
    special,
    specialEffectiveness: eff,
  };
}

describe("evaluateSpecial", () => {
  it("Hell: (93 − EDK50) = 43%", () => {
    const r = evaluateSpecial(player, weaponWith("Hell"), enemy);
    expect(r?.activationChance).toBeCloseTo(43);
  });

  it("Hell + V502 で 2 倍", () => {
    const r = evaluateSpecial(player, weaponWith("Hell"), enemy, { v502: true });
    expect(r?.activationChance).toBeCloseTo(86);
  });

  it("Hell + V501 は 1.5 倍", () => {
    const r = evaluateSpecial(player, weaponWith("Hell"), enemy, { v501: true });
    expect(r?.activationChance).toBeCloseTo(64.5);
  });

  it("Hell はボスに無効", () => {
    const r = evaluateSpecial(player, weaponWith("Hell"), { ...enemy, isBoss: true });
    expect(r?.activationChance).toBe(0);
  });

  it("特殊効果係数 0.5 の武器 (剣類) は半減", () => {
    const r = evaluateSpecial(player, weaponWith("Hell", 0.5), enemy);
    expect(r?.activationChance).toBeCloseTo((93 - 50) * 0.5);
  });

  it("Arrest: (80 − ESP20) = 60%、機械系には無効", () => {
    expect(evaluateSpecial(player, weaponWith("Arrest"), enemy)?.activationChance).toBeCloseTo(60);
    expect(
      evaluateSpecial(player, weaponWith("Arrest"), { ...enemy, isMachine: true })
        ?.activationChance,
    ).toBe(0);
  });

  it("Blizzard: 凍結はキャップ 40% (素の値 60 でも 40)", () => {
    const r = evaluateSpecial(player, weaponWith("Blizzard"), enemy);
    expect(r?.activationChance).toBeCloseTo(40);
  });

  it("Blizzard + V501: キャップ後にユニット倍率 (40 × 1.5 = 60)", () => {
    const r = evaluateSpecial(player, weaponWith("Blizzard"), enemy, { v501: true });
    expect(r?.activationChance).toBeCloseTo(60);
  });

  it("Demon's: 発動 50%、現在HPの 75% を削る", () => {
    const r = evaluateSpecial(player, weaponWith("Demon's"), enemy);
    expect(r?.activationChance).toBe(50);
    expect(r?.hpCutFraction).toBeCloseTo(0.75);
  });

  it("Demon's: Ultimate の機械系には 45%", () => {
    const r = evaluateSpecial(player, weaponWith("Demon's"), { ...enemy, isMachine: true });
    expect(r?.hpCutFraction).toBeCloseTo(0.45);
  });

  it("Gush: HP吸収は min(17% × maxHp, 120) = 120", () => {
    const r = evaluateSpecial(player, weaponWith("Gush"), enemy);
    expect(r?.effect).toContain("120");
  });
});

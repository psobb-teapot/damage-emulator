import { describe, expect, it } from "vitest";
import {
  attackDamageModifier,
  damageRange,
  effectiveAtp,
  effectiveDfp,
  rawDamage,
  shiftaZalurePercent,
} from "../src/index.js";
import type { Enemy, PlayerStats, Weapon } from "../src/index.js";

const player: PlayerStats = {
  baseAtp: 1146, // HUcast Lv200
  baseAta: 158.7,
  lck: 100,
  classCategory: "hunter",
};

const excalibur: Weapon = {
  name: "Excalibur",
  kind: "saber",
  atpMin: 900,
  atpMax: 950,
  ata: 60,
  special: "Berserk",
};

const bartle: Enemy = {
  name: "Bartle",
  hp: 2334,
  dfp: 600,
  evp: 593,
  edk: 70,
  esp: 17,
  difficulty: "ultimate",
};

describe("shiftaZalurePercent", () => {
  it("Lv0 は 0%", () => expect(shiftaZalurePercent(0)).toBe(0));
  it("Lv1 は 10%", () => expect(shiftaZalurePercent(1)).toBe(10));
  it("Lv30 は 47.7%", () => expect(shiftaZalurePercent(30)).toBeCloseTo(47.7));
  it("Lv30 超は 30 でキャップ", () => expect(shiftaZalurePercent(99)).toBeCloseTo(47.7));
});

describe("rawDamage", () => {
  it("式どおりに切り捨てる: floor((ATP-DFP)/5 × mod)", () => {
    // (2000 - 600) / 5 × 1.7 = 476.0 → 476
    expect(rawDamage(2000, 600, 1.7)).toBe(476);
  });
  it("ATP < DFP なら 0", () => {
    expect(rawDamage(100, 600, 1.7)).toBe(0);
  });
});

describe("attackDamageModifier (0.9 折り込み済み)", () => {
  it("Normal は 0.9", () => expect(attackDamageModifier(excalibur, "normal")).toBe(0.9));
  it("Hard は 1.7", () => expect(attackDamageModifier(excalibur, "hard")).toBe(1.7));
  it("Berserk (犠牲系) は 3.0", () =>
    expect(attackDamageModifier(excalibur, "special")).toBe(3.0));
  it("Vjaya は 5.1", () => {
    const vjaya: Weapon = { ...excalibur, name: "Vjaya", special: "Vjaya" };
    expect(attackDamageModifier(vjaya, "special")).toBe(5.1);
  });
  it("状態異常系特殊は 0.5", () => {
    const hellSaber: Weapon = { ...excalibur, name: "Hell Saber", special: "Hell" };
    expect(attackDamageModifier(hellSaber, "special")).toBe(0.5);
  });
  it("特殊なし武器の special はエラー", () => {
    const plain: Weapon = { ...excalibur, special: null };
    expect(() => attackDamageModifier(plain, "special")).toThrow();
  });
});

describe("effectiveAtp", () => {
  it("min < avg < max", () => {
    const min = effectiveAtp(player, excalibur, {}, 0);
    const avg = effectiveAtp(player, excalibur);
    const max = effectiveAtp(player, excalibur, {}, 1);
    expect(min).toBeLessThan(avg);
    expect(avg).toBeLessThan(max);
    // min = classMin + 武器min = (1146 - 5) + 900
    expect(min).toBeCloseTo(1146 - 5 + 900);
    // max = classMax + 武器min + 武器スプレッド = 1146 + 900 + 50
    expect(max).toBeCloseTo(1146 + 900 + 50);
  });

  it("シフタはキャラATP部分にのみ乗る (最小ロール)", () => {
    const noBuff = effectiveAtp(player, excalibur, {}, 0);
    const buffed = effectiveAtp(player, excalibur, { shiftaLevel: 30 }, 0);
    const classMin = player.baseAtp - 5; // Pvar,max - 1
    expect(buffed - noBuff).toBeCloseTo(classMin * 0.477);
  });

  it("シフタの最大ロールはクラス分散と武器スプレッドにも乗る (psostats 準拠)", () => {
    const noBuff = effectiveAtp(player, excalibur, {}, 1);
    const buffed = effectiveAtp(player, excalibur, { shiftaLevel: 30 }, 1);
    // classMax × SA + (WSpread + クラス分散) × SA
    expect(buffed - noBuff).toBeCloseTo(1146 * 0.477 + (50 + 5) * 0.477);
  });

  it("属性%は武器ATP(min+grind)に乗る", () => {
    const withAttr = { ...excalibur, attributePercent: 50 };
    const diff = effectiveAtp(player, withAttr, {}, 0) - effectiveAtp(player, excalibur, {}, 0);
    expect(diff).toBeCloseTo(900 * 0.5);
  });
});

describe("effectiveDfp", () => {
  it("ザルア Lv30 で DFP が 47.7% 減る", () => {
    expect(effectiveDfp(bartle, { zalureLevel: 30 })).toBeCloseTo(600 * (1 - 0.477));
  });
});

describe("damageRange", () => {
  it("min <= avg <= max", () => {
    const r = damageRange(player, excalibur, bartle, "hard");
    expect(r.min).toBeLessThanOrEqual(r.avg);
    expect(r.avg).toBeLessThanOrEqual(r.max);
    expect(r.min).toBeGreaterThan(0);
  });
});

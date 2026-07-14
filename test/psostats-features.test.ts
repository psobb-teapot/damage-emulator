import { describe, expect, it } from "vitest";
import {
  BARRIERS,
  comboFrames,
  damageRange,
  ENEMIES,
  equipmentBonus,
  findBestCombo,
  FRAMES,
  hitChanceRange,
  playerFromClass,
  simulateCombo,
  totalAta,
  WEAPONS,
} from "../src/index.js";
import type { CombatContext, PlayerStats, Weapon } from "../src/index.js";

/**
 * psostats.com/combo-calculator の追加機能 (セット効果 / Commander Blade /
 * SNグリッチ / 命中率レンジ / コンボフレーム数 / オートコンボ) の実測パリティ。
 * 実測日: 2026-07-15
 */

const floor2 = (v: number) => Math.floor(v * 100) / 100;

function buildPlayer(
  cls: Parameters<typeof playerFromClass>[0],
  weapon: Weapon,
  opts: { frame?: string; barrier?: string; possUnit?: "POSS1" | "POSS2" | "POSS3" | "POSS4"; commanderBlade?: boolean } = {},
): PlayerStats {
  const frame = opts.frame ? FRAMES[opts.frame]! : { atp: 0, ata: 0 };
  const barrier = opts.barrier ? BARRIERS[opts.barrier]! : { atp: 0, ata: 0 };
  const bonus = equipmentBonus({
    weapon,
    frameName: opts.frame,
    barrierName: opts.barrier,
    possUnit: opts.possUnit ?? null,
    commanderBlade: opts.commanderBlade ?? false,
  });
  return {
    ...playerFromClass(cls, { useMaxStats: true }),
    armorAtp: frame.atp + barrier.atp + bonus.atp,
    armorAta: frame.ata + barrier.ata + bonus.ata,
  };
}

function makeWeapon(key: string, hitPercent: number): Weapon {
  const base = WEAPONS[key]!;
  return { ...base, grind: base.maxGrind ?? 0, hitPercent, attributePercent: 0 };
}

const ctx: CombatContext = { includeCriticals: false };

describe("セット効果 (psostats 実測)", () => {
  it("S1: Crimson Coat + Red Saber — 武器ATP+50%・ATA+22", () => {
    const weapon = makeWeapon("Red Saber", 25);
    const player = buildPlayer("HUmar", weapon, { frame: "Crimson Coat" });
    expect(totalAta(player, weapon)).toBe(298);
    const rawAtp = weapon.atpMin + 2 * (weapon.grind ?? 0) + (player.armorAtp ?? 0);
    expect(rawAtp).toBe(909);
    const dmg = damageRange(player, weapon, ENEMIES["Bartle"]!, "hard", ctx);
    expect(dmg.min).toBe(578);
  });

  it("S2: Sweetheart (2) + Excalibur — 武器ATP+20%", () => {
    const weapon = makeWeapon("Excalibur", 30);
    const player = buildPlayer("HUnewearl", weapon, { frame: "Sweetheart (2)" });
    expect(totalAta(player, weapon)).toBe(289);
    const rawAtp = weapon.atpMin + 2 * (weapon.grind ?? 0) + (player.armorAtp ?? 0);
    expect(rawAtp).toBe(1080);
    const enemy = ENEMIES["Bartle"]!;
    expect(damageRange(player, weapon, enemy, "hard", ctx).min).toBe(582);
    expect(damageRange(player, weapon, enemy, "special", ctx).min).toBe(1027);
  });

  it("S3: POSS x2 ユニット + Excalibur (対象武器) — ATA+60", () => {
    const weapon = makeWeapon("Excalibur", 50);
    const player = buildPlayer("HUcast", weapon, { possUnit: "POSS2" });
    expect(totalAta(player, weapon)).toBe(361);
  });

  it("POSS は対象外武器には乗らない", () => {
    const weapon = makeWeapon("Vulcan", 0);
    const bonus = equipmentBonus({ weapon, possUnit: "POSS2" });
    expect(bonus.ata).toBe(0);
  });

  it("S4: Commander Blade — ATA+20", () => {
    const weapon = makeWeapon("Excalibur", 50);
    const player = buildPlayer("HUcast", weapon, { commanderBlade: true });
    expect(totalAta(player, weapon)).toBe(321);
  });

  it("S5: Thirteen + Diska of Braveman — 武器ATP+50%・ATA+30", () => {
    const weapon = makeWeapon("Diska of Braveman", 40);
    const player = buildPlayer("HUcast", weapon, { frame: "Thirteen" });
    expect(totalAta(player, weapon)).toBe(292);
    const rawAtp = weapon.atpMin + 2 * (weapon.grind ?? 0) + (player.armorAtp ?? 0);
    expect(rawAtp).toBe(252);
    expect(damageRange(player, weapon, ENEMIES["Bartle"]!, "hard", ctx).min).toBe(437);
  });

  it("S6: Safety Heart + Rambling May — ATA+30", () => {
    const weapon = makeWeapon("Rambling May", 30);
    const player = buildPlayer("RAmarl", weapon, { barrier: "Safety Heart" });
    expect(totalAta(player, weapon)).toBe(346);
    expect(damageRange(player, weapon, ENEMIES["Bartle"]!, "hard", ctx).min).toBe(306);
  });
});

describe("コンボフレーム数 (psostats 実測)", () => {
  const cases: {
    weapon: string; cls: Parameters<typeof playerFromClass>[0];
    attacks: ("normal" | "hard" | "special")[]; frames: number;
    source: "base" | "female" | "class-specific";
  }[] = [
    { weapon: "Red Saber", cls: "HUmar", attacks: ["hard", "hard", "special"], frames: 70, source: "base" },
    { weapon: "Excalibur", cls: "HUnewearl", attacks: ["hard", "hard", "special"], frames: 75, source: "female" },
    { weapon: "Diska of Braveman", cls: "HUcast", attacks: ["hard", "hard", "hard"], frames: 88, source: "base" },
    { weapon: "Rambling May", cls: "RAmarl", attacks: ["hard", "hard", "hard"], frames: 93, source: "base" },
    { weapon: "S-Red's Blade", cls: "HUcaseal", attacks: ["normal", "hard", "hard"], frames: 78, source: "class-specific" },
    { weapon: "Excalibur", cls: "HUcast", attacks: ["normal", "normal", "hard"], frames: 57, source: "base" },
    { weapon: "Excalibur", cls: "HUcast", attacks: ["normal"], frames: 29, source: "base" },
    { weapon: "Excalibur", cls: "HUcast", attacks: ["normal", "hard", "special"], frames: 62, source: "base" },
    { weapon: "Frozen Shooter", cls: "HUcast", attacks: ["hard", "special"], frames: 53, source: "base" },
  ];

  for (const c of cases) {
    it(`${c.cls} + ${c.weapon} ${c.attacks.join("/")} = ${c.frames}f (${c.source})`, () => {
      const r = comboFrames(WEAPONS[c.weapon]!, c.cls, c.attacks);
      expect(r.frames).toBe(c.frames);
      expect(r.source).toBe(c.source);
    });
  }

  it("単発武器にコンボを指定すると null (psostats はクラッシュする)", () => {
    const r = comboFrames(WEAPONS["Master Raven"]!, "RAmar", ["hard", "hard"]);
    expect(r.frames).toBeNull();
  });
});

describe("SNグリッチ (psostats 実測: S7)", () => {
  const weapon = makeWeapon("Excalibur", 0);
  const player = playerFromClass("HUcast", { useMaxStats: true });
  const enemy = ENEMIES["Delsaber (Ruins)"]!;
  const attacks = [
    { type: "normal" as const }, { type: "normal" as const }, { type: "hard" as const },
  ];

  it("グリッチOFF: 1段目 57%", () => {
    const r = simulateCombo({ player, weapon, enemy, attacks, context: { ...ctx } });
    expect(floor2(r.hits[0]!.accuracy)).toBeCloseTo(57, 1);
    const overall = r.hits.reduce((p, h) => p * (h.accuracy / 100), 1) * 100;
    expect(floor2(overall)).toBeCloseTo(57, 1);
  });

  it("グリッチON: 1段目が2段目の命中率 (100%) に置き換わる", () => {
    const r = simulateCombo({ player, weapon, enemy, attacks, context: { ...ctx, snGlitch: true } });
    expect(r.hits[0]!.accuracy).toBe(100);
    const overall = r.hits.reduce((p, h) => p * (h.accuracy / 100), 1) * 100;
    expect(floor2(overall)).toBeCloseTo(100, 1);
  });
});

describe("命中率レンジ (psostats 実測: S9 — HUcast + Holy Ray, Smartlink無し)", () => {
  const weapon = makeWeapon("Holy Ray", 40);
  const player = playerFromClass("HUcast", { useMaxStats: true });
  const enemy = ENEMIES["Bartle"]!;
  const noSmartlink: CombatContext = { ...ctx, smartlink: false };

  const expected = [
    { step: 1 as const, type: "hard" as const, max: 92.09, min: 22.79 },
    { step: 2 as const, type: "hard" as const, max: 100, min: 86.01 },
    { step: 3 as const, type: "special" as const, max: 100, min: 66.44 },
  ];

  for (const e of expected) {
    it(`${e.step}段目 ${e.type}: ${e.min}% - ${e.max}%`, () => {
      const r = hitChanceRange(player, weapon, enemy, e.type, e.step, noSmartlink);
      expect(floor2(r.atPointBlank)).toBeCloseTo(e.max, 1);
      expect(floor2(r.atMaxRange)).toBeCloseTo(e.min, 1);
    });
  }

  it("Smartlink 装備時はレンジが消える", () => {
    const r = hitChanceRange(player, weapon, enemy, "hard", 1, { ...ctx, smartlink: true });
    expect(r.atMaxRange).toBe(r.atPointBlank);
  });

  it("レンジャーはペナルティなし", () => {
    const ra = playerFromClass("RAmar", { useMaxStats: true });
    const r = hitChanceRange(ra, weapon, enemy, "hard", 1, noSmartlink);
    expect(r.atMaxRange).toBe(r.atPointBlank);
  });
});

describe("オートコンボ (psostats 実測: S10)", () => {
  it("vs Bartle: N/H/S (2165ダメージ・100%・62f) を選ぶ", () => {
    const weapon = makeWeapon("Excalibur", 50);
    const player = playerFromClass("HUcast", { useMaxStats: true });
    const best = findBestCombo(player, weapon, ENEMIES["Bartle"]!, "HUcast", ctx);
    expect(best).not.toBeNull();
    expect(best!.attacks).toEqual(["normal", "hard", "special"]);
    expect(best!.totalDamage).toBe(2165);
    expect(floor2(best!.overallAccuracy)).toBeCloseTo(100, 1);
    expect(best!.frames).toBe(62);
  });

  it("vs Deldepth (高EVP): 単発 N (331ダメージ・61%・29f) を選ぶ", () => {
    const weapon = makeWeapon("Excalibur", 50);
    const player = playerFromClass("HUcast", { useMaxStats: true });
    const best = findBestCombo(player, weapon, ENEMIES["Deldepth"]!, "HUcast", ctx);
    expect(best).not.toBeNull();
    expect(best!.attacks).toEqual(["normal"]);
    expect(best!.totalDamage).toBe(331);
    expect(floor2(best!.overallAccuracy)).toBeCloseTo(61, 1);
    expect(best!.frames).toBe(29);
  });
});

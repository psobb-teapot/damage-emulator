import { describe, expect, it } from "vitest";
import {
  damageRange,
  ENEMIES,
  hitChance,
  minHitsToKill,
  playerFromClass,
  requiredHitPercent,
  WEAPONS,
} from "../src/index.js";
import type { AttackType, CombatContext, Weapon } from "../src/index.js";

/**
 * 逆算関数の整合性テスト:
 * requiredHitPercent(r) を武器に与えると命中率がちょうど 100% に達し、
 * r-1 では 100% 未満になること (r > 0 の場合) を、
 * 実測パリティ済みの構成に対して検証する。
 */

const ctx: CombatContext = { includeCriticals: false };

function weaponWithHit(key: string, hit: number): Weapon {
  const base = WEAPONS[key]!;
  return { ...base, grind: base.maxGrind ?? 0, hitPercent: hit, attributePercent: 0 };
}

const CASES: {
  cls: Parameters<typeof playerFromClass>[0];
  weapon: string;
  enemy: string;
  type: AttackType;
  step: 1 | 2 | 3;
  context?: CombatContext;
}[] = [
  { cls: "HUcast", weapon: "Excalibur", enemy: "Bartle", type: "hard", step: 1 },
  { cls: "HUcast", weapon: "Excalibur", enemy: "Deldepth", type: "hard", step: 2 },
  { cls: "HUnewearl", weapon: "Vjaya", enemy: "Delsaber (Ruins)", type: "special", step: 1 },
  { cls: "HUcast", weapon: "Dark Flow", enemy: "Claw", type: "special", step: 1 },
  { cls: "RAmar", weapon: "Heaven Striker", enemy: "Pan Arms (Caves)", type: "special", step: 2 },
  { cls: "RAcast", weapon: "Frozen Shooter", enemy: "Sinow Zoa", type: "special", step: 1, context: { ...ctx, frozen: true } },
  { cls: "RAmarl", weapon: "Laser", enemy: "Delsaber (Ruins)", type: "hard", step: 1, context: { ...ctx, paralyzed: true } },
];

describe("requiredHitPercent (命中100%の逆算)", () => {
  for (const c of CASES) {
    it(`${c.cls} + ${c.weapon} vs ${c.enemy} ${c.step}段目${c.type}`, () => {
      const player = playerFromClass(c.cls, { useMaxStats: true });
      const context = c.context ?? ctx;
      const req = requiredHitPercent(player, weaponWithHit(c.weapon, 0), ENEMIES[c.enemy]!, c.type, c.step, context);
      expect(Number.isFinite(req)).toBe(true);
      // 必要Hit% で 100% に到達する
      const accAt = hitChance(player, weaponWithHit(c.weapon, req), ENEMIES[c.enemy]!, c.type, c.step, context);
      expect(accAt).toBeGreaterThanOrEqual(100 - 1e-9);
      // 1 少ないと 100% 未満 (req > 0 の場合)
      if (req > 0) {
        const accBelow = hitChance(player, weaponWithHit(c.weapon, req - 1), ENEMIES[c.enemy]!, c.type, c.step, context);
        expect(accBelow).toBeLessThan(100);
      }
    });
  }

  it("TJS (必中) は 0", () => {
    const player = playerFromClass("HUmar", { useMaxStats: true });
    const req = requiredHitPercent(player, weaponWithHit("Tsumikiri J-Sword", 0), ENEMIES["Deldepth"]!, "special", 1, ctx);
    expect(req).toBe(0);
  });
});

describe("minHitsToKill (確定撃破に必要なヒット数)", () => {
  it("Dark Flow 特殊 vs Claw: n-1 発では届かず n 発で確定", () => {
    const player = playerFromClass("HUcast", { useMaxStats: true });
    const weapon = weaponWithHit("Dark Flow", 0);
    const enemy = ENEMIES["Claw"]!;
    const n = minHitsToKill(player, weapon, enemy, "special", ctx)!;
    const min = damageRange(player, weapon, enemy, "special", ctx).min;
    expect(min * n).toBeGreaterThanOrEqual(enemy.hp);
    expect(min * (n - 1)).toBeLessThan(enemy.hp);
    // 実測値: min 557/hit, HP 2246 → 5発 (P31 パリティ値より)
    expect(n).toBe(Math.ceil(2246 / 557));
  });

  it("最小ダメージ 0 なら null", () => {
    const player = playerFromClass("FOnewearl", { useMaxStats: true });
    const weapon = weaponWithHit("Kunai", 0);
    const n = minHitsToKill(player, weapon, ENEMIES["Morfos"]!, "normal", ctx);
    expect(n).toBeNull();
  });
});

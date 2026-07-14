import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  damageRange,
  ENEMIES,
  hitChance,
  playerFromClass,
  totalAta,
  WEAPONS,
} from "../src/index.js";
import type { AttackType, CombatContext, Enemy, Weapon } from "../src/index.js";

/**
 * psostats.com/combo-calculator に全135敵を表示させて記録した結果との一括照合。
 * 実測日: 2026-07-15 (data/raw/parity-all-enemies.json)
 * 構成: HUcast (最大) + Excalibur Hit50%, N/H/S 各1ヒット, 最小ロール
 */

interface MeasuredRow {
  name: string;
  total: number;
  overallAcc: number;
  normal: { dmg: number; acc: number };
  hard: { dmg: number; acc: number };
  special: { dmg: number; acc: number };
}

const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../data/raw/parity-all-enemies.json"),
    "utf8",
  ),
) as { config: { ataInput: number; minAtpInput: number; maxAtpInput: number }; rows: MeasuredRow[] };

const player = playerFromClass("HUcast", { useMaxStats: true });
const base = WEAPONS["Excalibur"]!;
const weapon: Weapon = {
  ...base,
  grind: base.maxGrind ?? 0,
  hitPercent: 50,
  attributePercent: 0,
};
const context: CombatContext = { includeCriticals: false };

const enemyByName = new Map<string, Enemy>();
for (const e of Object.values(ENEMIES)) enemyByName.set(e.name, e);

const floor2 = (v: number) => Math.floor(v * 100) / 100;
const STEPS: { type: AttackType; step: 1 | 2 | 3; key: "normal" | "hard" | "special" }[] = [
  { type: "normal", step: 1, key: "normal" },
  { type: "hard", step: 2, key: "hard" },
  { type: "special", step: 3, key: "special" },
];

describe("psostats 全135敵の一括照合 (HUcast + Excalibur N/H/S)", () => {
  it("実測データが全敵分ある", () => {
    expect(fixture.rows.length).toBe(135);
  });

  it("入力欄 (ATA/武器ATP) が一致する", () => {
    expect(totalAta(player, weapon)).toBe(fixture.config.ataInput);
    expect(weapon.atpMin + 2 * (weapon.grind ?? 0)).toBe(fixture.config.minAtpInput);
    expect(weapon.atpMax + 2 * (weapon.grind ?? 0)).toBe(fixture.config.maxAtpInput);
  });

  for (const row of fixture.rows) {
    describe(row.name, () => {
      const enemy = enemyByName.get(row.name);

      it("敵データが存在する", () => {
        expect(enemy, row.name).toBeDefined();
      });

      it("N/H/S のダメージと命中率が一致する", () => {
        let total = 0;
        const rawAccs: number[] = [];
        for (const s of STEPS) {
          const dmg = damageRange(player, weapon, enemy!, s.type, context);
          const acc = hitChance(player, weapon, enemy!, s.type, s.step, context);
          const exp = row[s.key];
          expect(dmg.min, `${row.name} ${s.type} damage`).toBe(exp.dmg);
          expect(floor2(acc), `${row.name} ${s.type} accuracy`).toBeCloseTo(exp.acc, 1);
          total += dmg.min;
          rawAccs.push(acc);
        }
        expect(total, `${row.name} total`).toBe(row.total);
        // 総合命中率 = 各ヒット命中率の積
        const overall = rawAccs.reduce((p, a) => p * (a / 100), 1) * 100;
        expect(floor2(overall), `${row.name} overall accuracy`).toBeCloseTo(row.overallAcc, 1);
      });
    });
  }
});

import { describe, expect, it } from "vitest";
import {
  BARRIERS,
  CLASSES,
  damageRange,
  ENEMIES,
  evaluateSpecial,
  FRAMES,
  hitChance,
  playerFromClass,
  totalAta,
  WEAPONS,
} from "../src/index.js";
import type {
  AttackType,
  CombatContext,
  ComboAttack,
  PlayerStats,
  Weapon,
} from "../src/index.js";

/**
 * psostats.com/combo-calculator を実際に操作して得た結果との突き合わせ。
 * 実測日: 2026-07-15 (Playwright でフォーム操作し結果テーブルを記録)
 *
 * psostats の表示仕様:
 * - ダメージ = 最小ロール (max damage roll チェックで最大ロール)
 * - 命中率 = floor(x * 100) / 100 で表示
 * - Demon's/Devil's は発動 100% 前提で残りHPを順に削った値を表示
 */

interface Fixture {
  name: string;
  cls: keyof typeof CLASSES;
  weaponKey: string;
  specialOverride?: string;
  hitPercent: number;
  attributePercent: number;
  shifta?: number;
  zalure?: number;
  frozen?: boolean;
  paralyzed?: boolean;
  maxRoll?: boolean;
  barrier?: string;
  frame?: string;
  attacks: { type: AttackType; hits: number }[];
  enemyKey: string;
  /** psostats の入力欄の自動計算値 (整合性チェック用) */
  ataInput: number;
  minAtpInput: number;
  maxAtpInput: number;
  /** psostats の結果テーブル (攻撃ごとのダメージと命中率) */
  perAttack: { dmg: number; acc: number }[];
  total: number;
}

const FIXTURES: Fixture[] = [
  {
    name: "P1: HUcast + Excalibur (Berserk) N/H/S vs Bartle",
    cls: "HUcast", weaponKey: "Excalibur", hitPercent: 50, attributePercent: 0,
    attacks: [
      { type: "normal", hits: 1 }, { type: "hard", hits: 1 }, { type: "special", hits: 1 },
    ],
    enemyKey: "Bartle",
    ataInput: 301, minAtpInput: 900, maxAtpInput: 950,
    perAttack: [{ dmg: 348, acc: 100 }, { dmg: 657, acc: 100 }, { dmg: 1160, acc: 100 }],
    total: 2165,
  },
  {
    name: "P2: RAmarl + Vulcan (Charge) S15/Z20/属性50 H/H/S vs Gee",
    cls: "RAmarl", weaponKey: "Vulcan", specialOverride: "Charge",
    hitPercent: 40, attributePercent: 50, shifta: 15, zalure: 20,
    attacks: [
      { type: "hard", hits: 3 }, { type: "hard", hits: 3 }, { type: "special", hits: 3 },
    ],
    enemyKey: "Gee",
    ataInput: 293, minAtpInput: 23, maxAtpInput: 38,
    perAttack: [{ dmg: 383, acc: 47.09 }, { dmg: 383, acc: 100 }, { dmg: 677, acc: 89.58 }],
    total: 4329,
  },
  {
    name: "P3: HUnewearl + Vjaya S30 S/S/S vs Delsaber (Ruins)",
    cls: "HUnewearl", weaponKey: "Vjaya", hitPercent: 30, attributePercent: 0, shifta: 30,
    attacks: [
      { type: "special", hits: 1 }, { type: "special", hits: 1 }, { type: "special", hits: 1 },
    ],
    enemyKey: "Delsaber (Ruins)",
    ataInput: 265, minAtpInput: 190, maxAtpInput: 250,
    perAttack: [{ dmg: 1231, acc: 0 }, { dmg: 1231, acc: 47.15 }, { dmg: 1231, acc: 100 }],
    total: 3693,
  },
  {
    name: "P4: RAcast + Frozen Shooter 凍結中 H/S vs Sinow Zoa",
    cls: "RAcast", weaponKey: "Frozen Shooter", hitPercent: 45, attributePercent: 0,
    frozen: true,
    attacks: [{ type: "hard", hits: 1 }, { type: "special", hits: 1 }],
    enemyKey: "Sinow Zoa",
    ataInput: 329, minAtpInput: 258, maxAtpInput: 268,
    perAttack: [{ dmg: 268, acc: 93.38 }, { dmg: 268, acc: 100 }],
    total: 536,
  },
  {
    name: "P5: FOmar + Dark Flow S30 特殊5ヒット vs Olga Flow (Form 2)",
    cls: "FOmar", weaponKey: "Dark Flow", hitPercent: 60, attributePercent: 0, shifta: 30,
    attacks: [{ type: "special", hits: 5 }],
    enemyKey: "Olga Flow (Form 2)",
    ataInput: 273, minAtpInput: 756, maxAtpInput: 900,
    perAttack: [{ dmg: 419, acc: 53.09 }],
    total: 2095,
  },
  {
    name: "P7: HUmar + Tsumikiri J-Sword (TJS必中) H/H/S vs Astark",
    cls: "HUmar", weaponKey: "Tsumikiri J-Sword", hitPercent: 25, attributePercent: 0,
    attacks: [
      { type: "hard", hits: 1 }, { type: "hard", hits: 1 }, { type: "special", hits: 1 },
    ],
    enemyKey: "Astark",
    ataInput: 265, minAtpInput: 800, maxAtpInput: 856,
    perAttack: [{ dmg: 517, acc: 67.09 }, { dmg: 517, acc: 100 }, { dmg: 517, acc: 100 }],
    total: 1551,
  },
  {
    name: "P9: HUcaseal + Zanba (Berserk) S30/属性20/最大ロール H/H/S vs Hildelt (Forest)",
    cls: "HUcaseal", weaponKey: "Zanba", hitPercent: 40, attributePercent: 20, shifta: 30,
    maxRoll: true,
    attacks: [
      { type: "hard", hits: 1 }, { type: "hard", hits: 1 }, { type: "special", hits: 1 },
    ],
    enemyKey: "Hildelt (Forest)",
    ataInput: 296, minAtpInput: 386, maxAtpInput: 514,
    perAttack: [{ dmg: 646, acc: 100 }, { dmg: 646, acc: 100 }, { dmg: 1140, acc: 100 }],
    total: 2432,
  },
  {
    name: "P10: RAcaseal + Laser 麻痺中 N/H vs Arlan (Ruins)",
    cls: "RAcaseal", weaponKey: "Laser", hitPercent: 55, attributePercent: 0, paralyzed: true,
    // psostats 側は特殊 None のため N/H のみ比較
    attacks: [{ type: "normal", hits: 1 }, { type: "hard", hits: 1 }],
    enemyKey: "Arlan (Ruins)",
    ataInput: 336, minAtpInput: 250, maxAtpInput: 260,
    perAttack: [{ dmg: 111, acc: 100 }, { dmg: 210, acc: 100 }],
    total: 321,
  },
  {
    name: "P8: RAmar + Holy Ray (Arrest) Z30/属性30/Red Ring/最大ロール H/H/S vs Gi Gue",
    cls: "RAmar", weaponKey: "Holy Ray", hitPercent: 35, attributePercent: 30, zalure: 30,
    maxRoll: true, barrier: "Red Ring",
    attacks: [
      { type: "hard", hits: 1 }, { type: "hard", hits: 1 }, { type: "special", hits: 1 },
    ],
    enemyKey: "Gi Gue",
    ataInput: 374, minAtpInput: 390, maxAtpInput: 400,
    perAttack: [{ dmg: 393, acc: 100 }, { dmg: 393, acc: 100 }, { dmg: 115, acc: 100 }],
    total: 901,
  },
  // ---- 網羅テスト第2弾 (2026-07-15 実測) ----
  {
    name: "P11: HUmar + Orotiagito (1.75倍) H/S vs Zu (Crater)",
    cls: "HUmar", weaponKey: "Orotiagito", hitPercent: 30, attributePercent: 0,
    attacks: [{ type: "hard", hits: 1 }, { type: "special", hits: 1 }],
    enemyKey: "Zu (Crater)",
    ataInput: 285, minAtpInput: 750, maxAtpInput: 800,
    perAttack: [{ dmg: 462, acc: 89.69 }, { dmg: 476, acc: 75.44 }],
    total: 938,
  },
  {
    name: "P12: HUnewearl + Raikiri H vs Astark",
    cls: "HUnewearl", weaponKey: "Raikiri", hitPercent: 20, attributePercent: 0,
    attacks: [{ type: "hard", hits: 1 }],
    enemyKey: "Astark",
    ataInput: 249, minAtpInput: 550, maxAtpInput: 560,
    perAttack: [{ dmg: 378, acc: 55.89 }],
    total: 378,
  },
  {
    name: "P13: HUmar + Lavis Cannon (0.5倍) H/S vs Merillia",
    cls: "HUmar", weaponKey: "Lavis Cannon", hitPercent: 40, attributePercent: 0,
    attacks: [{ type: "hard", hits: 1 }, { type: "special", hits: 1 }],
    enemyKey: "Merillia",
    ataInput: 294, minAtpInput: 730, maxAtpInput: 750,
    perAttack: [{ dmg: 495, acc: 98.19 }, { dmg: 145, acc: 83.49 }],
    total: 640,
  },
  {
    name: "P14: HUcaseal + Lavis Blade (0.583倍・2ヒット) H/S vs Dolmdarl",
    cls: "HUcaseal", weaponKey: "Lavis Blade", hitPercent: 35, attributePercent: 0,
    attacks: [{ type: "hard", hits: 2 }, { type: "special", hits: 2 }],
    enemyKey: "Dolmdarl",
    ataInput: 293, minAtpInput: 380, maxAtpInput: 450,
    perAttack: [{ dmg: 295, acc: 68.89 }, { dmg: 101, acc: 54.25 }],
    total: 792,
  },
  {
    name: "P15: RAcast + Mille Marteaux (1.7倍・3ヒット) H/S vs Baranz (Mines)",
    cls: "RAcast", weaponKey: "Mille Marteaux", hitPercent: 30, attributePercent: 0,
    attacks: [{ type: "hard", hits: 3 }, { type: "special", hits: 3 }],
    enemyKey: "Baranz (Mines)",
    ataInput: 299, minAtpInput: 224, maxAtpInput: 244,
    perAttack: [{ dmg: 239, acc: 96.49 }, { dmg: 239, acc: 81.54 }],
    total: 1434,
  },
  {
    name: "P16: HUmar + Galatine (Spirit 3.0倍) H/S vs Hildelt (Forest)",
    cls: "HUmar", weaponKey: "Galatine", hitPercent: 25, attributePercent: 0,
    attacks: [{ type: "hard", hits: 1 }, { type: "special", hits: 1 }],
    enemyKey: "Hildelt (Forest)",
    ataInput: 302, minAtpInput: 1008, maxAtpInput: 1278,
    perAttack: [{ dmg: 586, acc: 100 }, { dmg: 1034, acc: 100 }],
    total: 1620,
  },
  {
    name: "P20: RAmarl + Laser 麻痺のみ (EVP×0.85) H/H/H vs Delsaber (Ruins)",
    cls: "RAmarl", weaponKey: "Laser", hitPercent: 0, attributePercent: 0, paralyzed: true,
    attacks: [
      { type: "hard", hits: 1 }, { type: "hard", hits: 1 }, { type: "hard", hits: 1 },
    ],
    enemyKey: "Delsaber (Ruins)",
    ataInput: 291, minAtpInput: 250, maxAtpInput: 260,
    perAttack: [{ dmg: 200, acc: 38.79 }, { dmg: 200, acc: 99.91 }, { dmg: 200, acc: 100 }],
    total: 600,
  },
  {
    name: "P21: RAmarl + Laser 麻痺+凍結 (EVP×0.55) H/H/H vs Delsaber (Ruins)",
    cls: "RAmarl", weaponKey: "Laser", hitPercent: 0, attributePercent: 0,
    paralyzed: true, frozen: true,
    attacks: [
      { type: "hard", hits: 1 }, { type: "hard", hits: 1 }, { type: "hard", hits: 1 },
    ],
    enemyKey: "Delsaber (Ruins)",
    ataInput: 291, minAtpInput: 250, maxAtpInput: 260,
    perAttack: [{ dmg: 200, acc: 97 }, { dmg: 200, acc: 100 }, { dmg: 200, acc: 100 }],
    total: 600,
  },
  {
    name: "P22: HUmar + TJS 1段目特殊 (素の式なら0% → 必中100%) vs Delsaber (Ruins)",
    cls: "HUmar", weaponKey: "Tsumikiri J-Sword", hitPercent: 0, attributePercent: 0,
    attacks: [{ type: "special", hits: 1 }],
    enemyKey: "Delsaber (Ruins)",
    ataInput: 240, minAtpInput: 800, maxAtpInput: 856,
    perAttack: [{ dmg: 472, acc: 100 }],
    total: 472,
  },
  {
    name: "P23: FOmarl + Guardianna N/H/H vs Morfos (ダメージ0クランプ)",
    cls: "FOmarl", weaponKey: "Guardianna", hitPercent: 30, attributePercent: 0,
    attacks: [
      { type: "normal", hits: 1 }, { type: "hard", hits: 1 }, { type: "hard", hits: 1 },
    ],
    enemyKey: "Morfos",
    ataInput: 240, minAtpInput: 218, maxAtpInput: 298,
    perAttack: [{ dmg: 0, acc: 100 }, { dmg: 0, acc: 91.2 }, { dmg: 0, acc: 100 }],
    total: 0,
  },
  {
    name: "P24: FOnewm + Gal Wind S20 N/H/H vs Recon",
    cls: "FOnewm", weaponKey: "Gal Wind", hitPercent: 25, attributePercent: 0, shifta: 20,
    attacks: [
      { type: "normal", hits: 1 }, { type: "hard", hits: 1 }, { type: "hard", hits: 1 },
    ],
    enemyKey: "Recon",
    ataInput: 245, minAtpInput: 300, maxAtpInput: 340,
    perAttack: [{ dmg: 119, acc: 100 }, { dmg: 225, acc: 100 }, { dmg: 225, acc: 100 }],
    total: 569,
  },
  {
    name: "P25: FOnewearl + Kunai 最大ロール N/H/H vs Pyro Goran (ダメージ0クランプ)",
    cls: "FOnewearl", weaponKey: "Kunai", hitPercent: 40, attributePercent: 0, maxRoll: true,
    attacks: [
      { type: "normal", hits: 1 }, { type: "hard", hits: 1 }, { type: "hard", hits: 1 },
    ],
    enemyKey: "Pyro Goran",
    ataInput: 258, minAtpInput: 95, maxAtpInput: 175,
    perAttack: [{ dmg: 0, acc: 100 }, { dmg: 0, acc: 89.18 }, { dmg: 0, acc: 100 }],
    total: 0,
  },
  {
    name: "P26: RAmar + Master Raven (3ヒット単発) H vs Merlan (Ruins)",
    cls: "RAmar", weaponKey: "Master Raven", hitPercent: 40, attributePercent: 0,
    attacks: [{ type: "hard", hits: 3 }],
    enemyKey: "Merlan (Ruins)",
    ataInput: 341, minAtpInput: 368, maxAtpInput: 398,
    perAttack: [{ dmg: 275, acc: 91.69 }],
    total: 825,
  },
  {
    name: "P27: RAcast + L&K38 Combat (5ヒット単発) N vs Gee",
    cls: "RAcast", weaponKey: "L&K38 Combat", hitPercent: 30, attributePercent: 0,
    attacks: [{ type: "normal", hits: 5 }],
    enemyKey: "Gee",
    ataInput: 294, minAtpInput: 200, maxAtpInput: 300,
    perAttack: [{ dmg: 176, acc: 100 }],
    total: 880,
  },
  {
    name: "P28: RAmarl + Last Swan (3ヒット) N/H vs Ob Lily (Caves)",
    cls: "RAmarl", weaponKey: "Last Swan", hitPercent: 35, attributePercent: 0,
    attacks: [{ type: "normal", hits: 3 }, { type: "hard", hits: 3 }],
    enemyKey: "Ob Lily (Caves)",
    ataInput: 308, minAtpInput: 98, maxAtpInput: 108,
    perAttack: [{ dmg: 101, acc: 100 }, { dmg: 191, acc: 100 }],
    total: 876,
  },
  {
    name: "P29: HUcast + ES Saber (グラインド250) H/H/H vs Barble",
    cls: "HUcast", weaponKey: "ES Saber", hitPercent: 0, attributePercent: 0,
    attacks: [
      { type: "hard", hits: 1 }, { type: "hard", hits: 1 }, { type: "hard", hits: 1 },
    ],
    enemyKey: "Barble",
    ataInput: 241, minAtpInput: 650, maxAtpInput: 650,
    perAttack: [{ dmg: 568, acc: 47.09 }, { dmg: 568, acc: 97.71 }, { dmg: 568, acc: 100 }],
    total: 1704,
  },
  {
    name: "P30: HUcast + M&A60 Vise + D-Parts ver1.01 (フレームATP+35) H/H/S vs Govulmer",
    cls: "HUcast", weaponKey: "M&A60 Vise", hitPercent: 30, attributePercent: 0,
    frame: "D-Parts ver1.01",
    attacks: [
      { type: "hard", hits: 3 }, { type: "hard", hits: 3 }, { type: "special", hits: 3 },
    ],
    enemyKey: "Govulmer",
    ataInput: 236, minAtpInput: 68, maxAtpInput: 78,
    perAttack: [{ dmg: 331, acc: 31.99 }, { dmg: 331, acc: 81.55 }, { dmg: 585, acc: 66.21 }],
    total: 3741,
  },
];

/** psostats の命中率表示 (floor 2桁) */
const floor2 = (v: number) => Math.floor(v * 100) / 100;

function buildInputs(f: Fixture): {
  player: PlayerStats;
  weapon: Weapon;
  context: CombatContext;
} {
  const barrier = f.barrier ? BARRIERS[f.barrier]! : { atp: 0, ata: 0 };
  const frame = f.frame ? FRAMES[f.frame]! : { atp: 0, ata: 0 };
  const player: PlayerStats = {
    ...playerFromClass(f.cls, { useMaxStats: true }),
    armorAtp: barrier.atp + frame.atp,
    armorAta: barrier.ata + frame.ata,
  };
  const base = WEAPONS[f.weaponKey]!;
  const weapon: Weapon = {
    ...base,
    grind: base.maxGrind ?? 0,
    hitPercent: f.hitPercent,
    attributePercent: f.attributePercent,
    ...(f.specialOverride ? { special: f.specialOverride } : {}),
  };
  const context: CombatContext = {
    shiftaLevel: f.shifta ?? 0,
    zalureLevel: f.zalure ?? 0,
    frozen: f.frozen ?? false,
    paralyzed: f.paralyzed ?? false,
    includeCriticals: false,
  };
  return { player, weapon, context };
}

describe("psostats.com/combo-calculator との突き合わせ", () => {
  for (const f of FIXTURES) {
    describe(f.name, () => {
      const { player, weapon, context } = buildInputs(f);
      const enemy = ENEMIES[f.enemyKey]!;

      it("敵データが存在する", () => {
        expect(enemy, f.enemyKey).toBeDefined();
      });

      it("ATA合計が psostats の自動計算値と一致する", () => {
        expect(totalAta(player, weapon)).toBe(f.ataInput);
      });

      it("武器ATP入力欄 (min/max) が一致する", () => {
        const raw = weapon.atpMin + 2 * (weapon.grind ?? 0) + (player.armorAtp ?? 0);
        expect(raw).toBe(f.minAtpInput);
        expect(raw + (weapon.atpMax - weapon.atpMin)).toBe(f.maxAtpInput);
      });

      f.attacks.forEach((attack, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const exp = f.perAttack[i]!;

        it(`${step}段目 ${attack.type}: ダメージ ${exp.dmg}`, () => {
          const dmg = damageRange(player, weapon, enemy, attack.type, context);
          expect(f.maxRoll ? dmg.max : dmg.min).toBe(exp.dmg);
        });

        it(`${step}段目 ${attack.type}: 命中率 ${exp.acc}%`, () => {
          const acc = hitChance(player, weapon, enemy, attack.type, step, context);
          // psostats は floor 2桁表示。浮動小数点の丸め差を考慮し ±0.05 で比較
          expect(floor2(acc)).toBeCloseTo(exp.acc, 1);
        });
      });

      it(`コンボ合計ダメージ ${f.total}`, () => {
        let total = 0;
        for (const attack of f.attacks) {
          const dmg = damageRange(player, weapon, enemy, attack.type, context);
          total += (f.maxRoll ? dmg.max : dmg.min) * attack.hits;
        }
        expect(total).toBe(f.total);
      });
    });
  }

  describe("P6: HUcast + Raygun (Demon's) S/S/S vs Dorphon — 削り値の一致", () => {
    // psostats 実測: 4379 (0%) / 2408 (35.19%) / 1325 (89.01%), 合計 8112
    // (psostats は発動100%前提で残りHPを順に削った値を表示する)
    const player = playerFromClass("HUcast", { useMaxStats: true });
    const base = WEAPONS["Raygun"]!;
    const weapon: Weapon = {
      ...base,
      grind: base.maxGrind ?? 0,
      hitPercent: 50,
      attributePercent: 0,
      special: "Demon's",
    };
    const enemy = ENEMIES["Dorphon"]!;
    const context: CombatContext = { includeCriticals: false };

    it("アンドロイドの Ultimate Demon's は 45% 削り", () => {
      const sp = evaluateSpecial(player, weapon, enemy, context);
      expect(sp?.hpCutFraction).toBeCloseTo(0.45);
    });

    it("発動100%前提の逐次削り値が一致する", () => {
      const fraction = 0.45;
      let remaining = enemy.hp;
      const cuts: number[] = [];
      for (let i = 0; i < 3; i++) {
        const cut = Math.floor(remaining * fraction);
        cuts.push(cut);
        remaining -= cut;
      }
      expect(cuts).toEqual([4379, 2408, 1325]);
      expect(cuts.reduce((a, b) => a + b, 0)).toBe(8112);
    });

    it("命中率が一致する (0% / 35.19% / 89.01%)", () => {
      const accs = [1, 2, 3].map((s) =>
        floor2(hitChance(player, weapon, enemy, "special", s as 1 | 2 | 3, context)),
      );
      expect(accs[0]).toBeCloseTo(0, 2);
      expect(accs[1]).toBeCloseTo(35.19, 2);
      expect(accs[2]).toBeCloseTo(89.01, 2);
    });
  });

  // ---- Devil's/Demon's の残り組み合わせ (2026-07-15 実測) ----

  interface HpCutFixture {
    name: string;
    cls: keyof typeof CLASSES;
    special: "Demon's" | "Devil's";
    hitPercent: number;
    enemyKey: string;
    fraction: number;
    ataInput: number;
    cuts: [number, number, number];
    accs: [number, number, number];
  }

  const HP_CUT_FIXTURES: HpCutFixture[] = [
    {
      name: "P17: RAmarl (非アンドロイド) + Demon's vs Dorphon — 75%削り",
      cls: "RAmarl", special: "Demon's", hitPercent: 40, enemyKey: "Dorphon",
      fraction: 0.75, ataInput: 316,
      cuts: [7299, 1824, 456], accs: [13.79, 61.19, 100],
    },
    {
      name: "P18: HUmar (非アンドロイド) + Devil's vs Girtablulu — 50%削り",
      cls: "HUmar", special: "Devil's", hitPercent: 40, enemyKey: "Girtablulu",
      fraction: 0.5, ataInput: 275,
      cuts: [8534, 4267, 2133], accs: [21.5, 62.75, 100],
    },
    {
      name: "P19: HUcast (アンドロイド) + Devil's vs Girtablulu — 20%削り",
      cls: "HUcast", special: "Devil's", hitPercent: 40, enemyKey: "Girtablulu",
      fraction: 0.2, ataInput: 266,
      cuts: [3413, 2731, 2184], accs: [17, 56.9, 100],
    },
  ];

  for (const f of HP_CUT_FIXTURES) {
    describe(f.name, () => {
      const player = playerFromClass(f.cls, { useMaxStats: true });
      const base = WEAPONS["Raygun"]!;
      const weapon: Weapon = {
        ...base,
        grind: base.maxGrind ?? 0,
        hitPercent: f.hitPercent,
        attributePercent: 0,
        special: f.special,
      };
      const enemy = ENEMIES[f.enemyKey]!;
      const context: CombatContext = { includeCriticals: false };

      it(`削り割合 ${f.fraction * 100}%`, () => {
        const sp = evaluateSpecial(player, weapon, enemy, context);
        expect(sp?.hpCutFraction).toBeCloseTo(f.fraction);
      });

      it("ATA合計が一致する", () => {
        expect(totalAta(player, weapon)).toBe(f.ataInput);
      });

      it("発動100%前提の逐次削り値が一致する", () => {
        let remaining = enemy.hp;
        const cuts: number[] = [];
        for (let i = 0; i < 3; i++) {
          const cut = Math.floor(remaining * f.fraction);
          cuts.push(cut);
          remaining -= cut;
        }
        expect(cuts).toEqual(f.cuts);
      });

      it("命中率が一致する", () => {
        const accs = [1, 2, 3].map((s) =>
          floor2(hitChance(player, weapon, enemy, "special", s as 1 | 2 | 3, context)),
        );
        expect(accs[0]).toBeCloseTo(f.accs[0], 2);
        expect(accs[1]).toBeCloseTo(f.accs[1], 2);
        expect(accs[2]).toBeCloseTo(f.accs[2], 2);
      });
    });
  }
});

import { describe, expect, it } from "vitest";
import {
  buildKillMatrix,
  guaranteedKillCombo,
  hitChance,
  makeWeapon,
  playerFromClass,
  ENEMIES,
  WEAPONS,
} from "../src/index.js";
import type { Enemy } from "../src/index.js";

const player = playerFromClass("HUcast", { useMaxStats: true, lck: 100 });

const weakEnemy: Enemy = {
  name: "Test Dummy",
  hp: 100,
  dfp: 0,
  evp: 0,
  difficulty: "ultimate",
};

describe("guaranteedKillCombo", () => {
  it("弱い敵は確定コンボが見つかり、最小ダメージ合計がHP以上", () => {
    const cell = guaranteedKillCombo(player, WEAPONS["Excalibur"]!, weakEnemy, "HUcast");
    expect(cell.guaranteed).not.toBeNull();
    expect(cell.guaranteed!.totalMinDamage).toBeGreaterThanOrEqual(weakEnemy.hp);
    // EVP 0 なので Hit% は不要
    expect(cell.guaranteed!.requiredHitPercent).toBe(0);
  });

  it("guaranteed コンボは全段で命中率100% (実 Hit% 基準)", () => {
    for (const wpName of ["Excalibur", "Vulcan", "Heaven Striker"]) {
      const weapon = { ...WEAPONS[wpName]!, hitPercent: 50 };
      for (const enName of ["Bartle", "Gulgus (Forest)", "Crimson Assassin (Caves)"]) {
        const enemy = ENEMIES[enName]!;
        const cell = guaranteedKillCombo(player, weapon, enemy, "HUcast");
        if (!cell.guaranteed) continue;
        cell.guaranteed.attacks.forEach((type, i) => {
          const acc = hitChance(player, weapon, enemy, type, (i + 1) as 1 | 2 | 3);
          expect(acc).toBeGreaterThanOrEqual(100 - 1e-9);
        });
        expect(cell.guaranteed.totalMinDamage).toBeGreaterThanOrEqual(enemy.hp);
      }
    }
  });

  it("命中が足りない場合は withMoreHit が要求 Hit% を返す", () => {
    // Hit% 0 の Excalibur では Ultimate の敵に全段100%は届かない
    const weapon = { ...WEAPONS["Excalibur"]!, hitPercent: 0 };
    const enemy = ENEMIES["Bartle"]!;
    const cell = guaranteedKillCombo(player, weapon, enemy, "HUcast");
    expect(cell.guaranteed).toBeNull();
    expect(cell.withMoreHit).not.toBeNull();
    expect(cell.withMoreHit!.requiredHitPercent).toBeGreaterThan(0);
    expect(cell.withMoreHit!.requiredHitPercent).toBeLessThanOrEqual(
      weapon.maxHitPercent ?? 100,
    );
    // 要求どおりの Hit% を付ければ実際に確定になる
    const withHit = {
      ...weapon,
      hitPercent: Math.ceil(cell.withMoreHit!.requiredHitPercent),
    };
    const cell2 = guaranteedKillCombo(player, withHit, enemy, "HUcast");
    expect(cell2.guaranteed).not.toBeNull();
  });

  it("hpCut 特殊 (Demon's) の確定ダメージは 0 として扱う", () => {
    const base = {
      kind: "saber" as const,
      atpMin: 500,
      atpMax: 500,
      ata: 100,
    };
    const demons = makeWeapon({ ...base, name: "Demon Test", special: "Demon's" });
    const charge = makeWeapon({ ...base, name: "Charge Test", special: "Charge" });
    const dCell = guaranteedKillCombo(player, demons, weakEnemy, "HUcast");
    const cCell = guaranteedKillCombo(player, charge, weakEnemy, "HUcast");
    // Charge は特殊が確定ダメージに乗る分、最大確定ダメージが大きい
    expect(cCell.bestMinDamage).toBeGreaterThan(dCell.bestMinDamage);
    // Demon's の special 段は確定0なので、確定コンボに含まれていても
    // 合計は special 抜きで HP を超えている必要がある
    if (dCell.guaranteed) {
      expect(dCell.guaranteed.totalMinDamage).toBeGreaterThanOrEqual(weakEnemy.hp);
    }
  });

  it("SNグリッチ有効時は1段目の要求 Hit% が2段目で置換される", () => {
    const weapon = { ...WEAPONS["Excalibur"]!, hitPercent: 0 };
    const enemy = ENEMIES["Bartle"]!;
    const plain = guaranteedKillCombo(player, weapon, enemy, "HUcast");
    const glitched = guaranteedKillCombo(player, weapon, enemy, "HUcast", { snGlitch: true });
    // グリッチで1段目の縛りが消える分、要求 Hit% は同じか下がる
    expect(glitched.withMoreHit!.requiredHitPercent).toBeLessThanOrEqual(
      plain.withMoreHit!.requiredHitPercent,
    );
    // その Hit% を付ければグリッチ込みで実際に確定になる
    const withHit = {
      ...weapon,
      hitPercent: Math.ceil(glitched.withMoreHit!.requiredHitPercent),
    };
    const confirm = guaranteedKillCombo(player, withHit, enemy, "HUcast", { snGlitch: true });
    expect(confirm.guaranteed).not.toBeNull();
  });

  it("コンボ不可武器は 1 段のみ", () => {
    const weapon = WEAPONS["Dark Flow"]!;
    expect(weapon.singleAttackOnly).toBe(true);
    const cell = guaranteedKillCombo(player, weapon, weakEnemy, "HUcast");
    for (const r of [cell.guaranteed, cell.withMoreHit]) {
      if (r) expect(r.attacks.length).toBe(1);
    }
  });

  it("どうやっても倒せない場合は両方 null で bestMinDamage に最大値", () => {
    const weapon = makeWeapon({
      name: "Weak", kind: "saber", atpMin: 10, atpMax: 10, ata: 100,
    });
    const tough: Enemy = { name: "Tank", hp: 99999, dfp: 0, evp: 0 };
    const cell = guaranteedKillCombo(player, weapon, tough, "HUcast");
    expect(cell.guaranteed).toBeNull();
    expect(cell.withMoreHit).toBeNull();
    expect(cell.bestMinDamage).toBeGreaterThan(0);
    expect(cell.bestMinDamage).toBeLessThan(tough.hp);
  });
});

describe("buildKillMatrix", () => {
  it("[武器][敵] の形の行列を返す", () => {
    const weapons = [WEAPONS["Excalibur"]!, WEAPONS["Vulcan"]!];
    const enemies = [ENEMIES["Bartle"]!, ENEMIES["Gulgus (Forest)"]!, weakEnemy];
    const matrix = buildKillMatrix({
      player, className: "HUcast", weapons, enemies,
    });
    expect(matrix).toHaveLength(2);
    for (const row of matrix) {
      expect(row).toHaveLength(3);
      for (const cell of row) {
        expect(cell.bestMinDamage).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

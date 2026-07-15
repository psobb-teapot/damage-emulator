import { describe, expect, it } from "vitest";
import {
  attackDamageModifier,
  ENEMIES,
  ENEMIES_ONE_PERSON,
  FRAMES,
  BARRIERS,
  resolveSpecial,
  WEAPONS,
} from "../src/index.js";

describe("生成データ: 武器", () => {
  it("全武器 (123種) が揃っている", () => {
    expect(Object.keys(WEAPONS).length).toBe(123);
  });

  it("Excalibur のステータスが正しい", () => {
    const w = WEAPONS["Excalibur"]!;
    expect(w.atpMin).toBe(900);
    expect(w.atpMax).toBe(950);
    expect(w.ata).toBe(60);
    expect(w.kind).toBe("saber");
    expect(w.special).toBe("Berserk");
  });

  it("全武器の特殊攻撃名が SPECIALS で解決できる", () => {
    for (const w of Object.values(WEAPONS)) {
      expect(() => resolveSpecial(w.special), `${w.name}: ${String(w.special)}`).not.toThrow();
    }
  });

  it("特殊持ち武器はすべてダメージ倍率を計算できる", () => {
    for (const w of Object.values(WEAPONS)) {
      if (!w.special) continue;
      const mod = attackDamageModifier(w, "special");
      expect(mod, w.name).toBeGreaterThanOrEqual(0);
    }
  });

  it("Vjaya は 5.1 倍・Heavy 命中", () => {
    const w = WEAPONS["Vjaya"]!;
    expect(attackDamageModifier(w, "special")).toBe(5.1);
    expect(w.specialUsesHeavyAccuracy).toBe(true);
  });

  it("Dark Flow は 1.7 倍・特殊のみ 5 ヒット・Heavy 命中・コンボ不可", () => {
    const w = WEAPONS["Dark Flow"]!;
    expect(attackDamageModifier(w, "special")).toBe(1.7);
    expect(w.specialHits).toBe(5); // 特殊攻撃のみ5連射
    expect(w.hitsPerAttack).toBeUndefined(); // 通常/強攻撃は剣の単発
    expect(w.specialUsesHeavyAccuracy).toBe(true);
    expect(w.singleAttackOnly).toBe(true);
  });

  it("Asteron Belt (Hell*) は減衰付き Hell", () => {
    const w = WEAPONS["Asteron Belt"]!;
    expect(w.special).toBe("Hell");
    expect(w.specialEffectiveness).toBe(0.5);
  });

  it("atpMin <= atpMax がすべての武器で成り立つ", () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.atpMin, w.name).toBeLessThanOrEqual(w.atpMax);
    }
  });
});

describe("生成データ: 敵", () => {
  it("全敵 (135種) が揃っている", () => {
    expect(Object.keys(ENEMIES).length).toBe(135);
  });

  it("Bartle (Forest Ultimate) のステータスが正しい", () => {
    const e = ENEMIES["Bartle"]!;
    expect(e.hp).toBe(2334);
    expect(e.dfp).toBe(600);
    expect(e.evp).toBe(593);
    expect(e.edk).toBe(70);
    expect(e.esp).toBe(17);
    expect(e.episode).toBe(1);
    expect(e.difficulty).toBe("ultimate");
  });

  it("ボスに isBoss が付いている", () => {
    expect(ENEMIES["Dark Falz (Form 3)"]?.isBoss).toBe(true);
    expect(ENEMIES["Sil Dragon"]?.isBoss).toBe(true);
    expect(ENEMIES["Olga Flow (Form 2)"]?.isBoss).toBe(true);
  });

  it("機械系に isMachine が付いている", () => {
    const machines = Object.values(ENEMIES).filter((e) => e.isMachine);
    expect(machines.length).toBeGreaterThan(0);
    for (const m of machines) expect(m.enemyType).toBe("Machine");
  });

  it("全敵にエピソードとロケーションがある", () => {
    for (const e of Object.values(ENEMIES)) {
      expect([1, 2, 4], e.name).toContain(e.episode);
      expect(e.location, e.name).toBeTruthy();
    }
  });
});

describe("生成データ: 一人用モードの敵", () => {
  it("マルチと同じ135種・同じキー", () => {
    expect(Object.keys(ENEMIES_ONE_PERSON).length).toBe(135);
    expect(Object.keys(ENEMIES_ONE_PERSON).sort()).toEqual(Object.keys(ENEMIES).sort());
  });

  it("Bartle の一人用ステータス (psostats/opm 実測)", () => {
    const e = ENEMIES_ONE_PERSON["Bartle"]!;
    expect(e.hp).toBe(1556);
    expect(e.dfp).toBe(451);
    expect(e.evp).toBe(424);
    expect(e.edk).toBe(70);
    expect(e.esp).toBe(12);
  });

  it("Delsaber (Ruins) の一人用ステータス", () => {
    const e = ENEMIES_ONE_PERSON["Delsaber (Ruins)"]!;
    expect(e.hp).toBe(2300);
    expect(e.dfp).toBe(647);
    expect(e.evp).toBe(600);
  });

  it("Dark Falz (Form 3) は HP 21000 → 10000", () => {
    expect(ENEMIES["Dark Falz (Form 3)"]!.hp).toBe(21000);
    expect(ENEMIES_ONE_PERSON["Dark Falz (Form 3)"]!.hp).toBe(10000);
  });

  it("一人用の HP はマルチ以下 (例外: Mericarol/Morfos は逆に高い)", () => {
    const higher: string[] = [];
    for (const [key, solo] of Object.entries(ENEMIES_ONE_PERSON)) {
      if (solo.hp > ENEMIES[key]!.hp) higher.push(key);
    }
    // psostats/opm のデータ上、一人用の方が HP が高いのはこの2体のみ
    expect(higher.sort()).toEqual(["Mericarol", "Morfos"]);
    expect(ENEMIES_ONE_PERSON["Mericarol"]!.hp).toBe(3825);
    expect(ENEMIES_ONE_PERSON["Morfos"]!.hp).toBe(4660);
  });

  it("種族・エリア・フラグはモード間で同一", () => {
    for (const [key, solo] of Object.entries(ENEMIES_ONE_PERSON)) {
      const multi = ENEMIES[key]!;
      expect(solo.enemyType, key).toBe(multi.enemyType);
      expect(solo.location, key).toBe(multi.location);
      expect(solo.isBoss ?? false, key).toBe(multi.isBoss ?? false);
      expect(solo.ccaMiniboss ?? false, key).toBe(multi.ccaMiniboss ?? false);
    }
  });
});

describe("生成データ: 防具", () => {
  it("フレームとバリアが揃っている", () => {
    expect(Object.keys(FRAMES).length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(BARRIERS).length).toBeGreaterThanOrEqual(10);
    expect(BARRIERS["Red Ring"]).toEqual({ atp: 20, ata: 20 });
  });
});

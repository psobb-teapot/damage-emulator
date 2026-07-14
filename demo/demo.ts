/**
 * デモ: HUcast (Lv200 max) + Excalibur で Ultimate の Bartle に
 * Hard→Hard→Special (Berserk) コンボを撃つ。
 *
 * 実行: npm run demo
 */
import {
  simulateCombo,
  playerFromClass,
  WEAPONS,
  ENEMIES,
} from "../src/index.js";

const result = simulateCombo({
  player: playerFromClass("HUcast", { useMaxStats: true, lck: 100 }),
  weapon: WEAPONS["Excalibur"]!,
  enemy: ENEMIES["Bartle (Ultimate)"]!,
  attacks: [{ type: "hard" }, { type: "hard" }, { type: "special" }],
  context: { shiftaLevel: 30, zalureLevel: 30 },
});

console.log("=== HUcast + Excalibur vs Bartle (Ultimate) / S30 Z30 ===\n");
console.log("段 | 攻撃    | 命中率  | ダメージ (min/avg/max) | 期待値");
console.log("---+---------+---------+------------------------+-------");
for (const h of result.hits) {
  const type = h.attackType.padEnd(7);
  const dmg = `${h.damage.min}/${h.damage.avg}/${h.damage.max}`.padEnd(22);
  console.log(
    ` ${h.comboStep} | ${type} | ${String(h.accuracy).padStart(6)}% | ${dmg} | ${h.expectedDamage}`,
  );
  if (h.special) {
    const act = h.special.activationChance != null ? ` 発動率 ${h.special.activationChance}%` : "";
    console.log(`   └ 特殊: ${h.special.name}${act} — ${h.special.effect}`);
  }
}
console.log("");
console.log(`合計 (全ヒット時): min ${result.totals.min} / avg ${result.totals.avg} / max ${result.totals.max}`);
console.log(`期待合計ダメージ : ${result.totals.expected} (敵HP ${ENEMIES["Bartle (Ultimate)"]!.hp})`);
console.log(`キル確率         : ${(result.killProbability * 100).toFixed(2)}%`);
console.log(`期待残りHP       : ${result.expectedRemainingHp}`);
if (result.resourceCost) console.log(`コスト           : ${result.resourceCost}`);

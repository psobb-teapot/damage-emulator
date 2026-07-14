/**
 * data/raw/*.json (psostats.com/combo-calculator 由来のスナップショット) から
 * src/data/{weapons,enemies,armor}.gen.ts を生成する。
 *
 * 実行: node tools/generate-data.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = (name) => JSON.parse(readFileSync(join(root, "data/raw", name), "utf8"));

const weapons = raw("weapons.json");
const enemies = raw("enemies.json");
const frames = raw("frames.json");
const barriers = raw("barriers.json");
const animation = raw("animation-frames.json");

/* ---------- 武器 ---------- */

// psostats の animation → WeaponKind
const ANIMATION_TO_KIND = {
  Saber: "saber",
  Sword: "sword",
  Dagger: "dagger",
  Partisan: "partisan",
  Slicer: "slicer",
  "Double Saber": "doubleSaber",
  Claw: "claw",
  Katana: "katana",
  "Twin Sword": "twinSword",
  Fist: "fist",
  Handgun: "handgun",
  Rifle: "rifle",
  Mechgun: "mechgun",
  Shot: "shot",
  Launcher: "launcher",
  Card: "card",
  Cane: "cane",
  Rod: "rod",
  Wand: "wand",
  // 固有アニメーションは最も近い種別へ (ヒット数は comboPreset から取得)
  "Master Raven": "handgun",
  "Last Swan": "handgun",
  "L&K38 Combat": "mechgun",
};

// psostats getSpecialAccuracyModifier で 0.7 になる特殊
const HEAVY_ACCURACY_SPECIALS = new Set(["Vjaya", "Dark Flow", "Frozen Shooter"]);

// psostats の特殊名 → 本モジュールの SPECIALS キー
// (Hell* = 減衰対象武器の Hell)
const SPECIAL_RENAME = { "Hell*": "Hell" };

const weaponEntries = [];
for (const [key, w] of Object.entries(weapons)) {
  if (key === "Unarmed") continue;
  const kind = ANIMATION_TO_KIND[w.animation];
  if (!kind) throw new Error(`未知の animation: ${w.animation} (${key})`);
  const specialRaw = w.special || null;
  const special = specialRaw ? (SPECIAL_RENAME[specialRaw] ?? specialRaw) : null;
  const hits = w.comboPreset?.attack1Hits > 0 ? w.comboPreset.attack1Hits : undefined;

  const fields = [
    `name: ${JSON.stringify(w.name)}`,
    `kind: ${JSON.stringify(kind)}`,
    `animation: ${JSON.stringify(w.animation)}`,
    `atpMin: ${w.minAtp}`,
    `atpMax: ${w.maxAtp}`,
    `ata: ${w.ata}`,
    `maxGrind: ${w.grind ?? 0}`,
    `maxHitPercent: ${w.maxHit ?? 0}`,
    `maxAttributePercent: ${w.maxAttr ?? 0}`,
    `horizontalDistance: ${w.horizontalDistance ?? 0}`,
  ];
  if (special) fields.push(`special: ${JSON.stringify(special)}`);
  if (specialRaw === "Hell*") fields.push(`specialEffectiveness: 0.5`);
  if (hits !== undefined) fields.push(`hitsPerAttack: ${hits}`);
  if (specialRaw && HEAVY_ACCURACY_SPECIALS.has(specialRaw)) {
    fields.push(`specialUsesHeavyAccuracy: true`);
  }
  if (w.comboPreset?.attack2 === "NONE") fields.push(`singleAttackOnly: true`);
  weaponEntries.push(`  ${JSON.stringify(key)}: { ${fields.join(", ")} },`);
}

writeFileSync(
  join(root, "src/data/weapons.gen.ts"),
  `// このファイルは tools/generate-data.mjs により自動生成される。手で編集しないこと。
// データ出典: psostats.com/combo-calculator (Ephinea PSOBB / wiki.pioneer2.net 由来)
import type { Weapon } from "../types.js";

export const ALL_WEAPONS: Record<string, Weapon> = {
${weaponEntries.join("\n")}
};
`,
);

/* ---------- 敵 ---------- */

const EPISODE_BY_LOCATION = {
  Forest: 1, Caves: 1, Mines: 1, Ruins: 1,
  Temple: 2, Spaceship: 2, CCA: 2, Seabed: 2, Tower: 2,
  Crater: 4, Desert: 4,
};

// Ultimate のボス (状態異常・即死無効)
const BOSS_PATTERN =
  /^(Sil Dragon|Dal Ra Lie|Vol Opt ver\. 2|Dark Falz|Barba Ray|Gol Dragon|Gal Gryphon|Olga Flow|Saint-Milion|Shambertin|Kondrieu)/;

const enemyEntries = [];
for (const [key, e] of Object.entries(enemies)) {
  const episode = EPISODE_BY_LOCATION[e.location];
  if (!episode) throw new Error(`未知の location: ${e.location} (${key})`);
  const fields = [
    `name: ${JSON.stringify(e.name)}`,
    `hp: ${e.hp}`,
    `dfp: ${e.dfp}`,
    `evp: ${e.evp}`,
    `edk: ${e.edk}`,
    `esp: ${e.esp}`,
    `difficulty: "ultimate"`,
    `episode: ${episode}`,
    `location: ${JSON.stringify(e.location)}`,
    `enemyType: ${JSON.stringify(e.type)}`,
  ];
  if (e.type === "Machine") fields.push(`isMachine: true`);
  if (BOSS_PATTERN.test(e.name)) fields.push(`isBoss: true`);
  if (e.ccaMiniboss) fields.push(`ccaMiniboss: true`);
  enemyEntries.push(`  ${JSON.stringify(key)}: { ${fields.join(", ")} },`);
}

writeFileSync(
  join(root, "src/data/enemies.gen.ts"),
  `// このファイルは tools/generate-data.mjs により自動生成される。手で編集しないこと。
// データ出典: psostats.com/combo-calculator (Ultimate 難易度・マルチプレイ時の値)
import type { Enemy } from "../types.js";

export const ALL_ENEMIES: Record<string, Enemy> = {
${enemyEntries.join("\n")}
};
`,
);

/* ---------- 防具 (フレーム / バリア) ---------- */

const armorLines = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `  ${JSON.stringify(k)}: { atp: ${v.atp}, ata: ${v.ata} },`)
    .join("\n");

writeFileSync(
  join(root, "src/data/armor.gen.ts"),
  `// このファイルは tools/generate-data.mjs により自動生成される。手で編集しないこと。
// データ出典: psostats.com/combo-calculator
export interface ArmorStats {
  atp: number;
  ata: number;
}

export const FRAMES: Record<string, ArmorStats> = {
${armorLines(frames)}
};

export const BARRIERS: Record<string, ArmorStats> = {
${armorLines(barriers)}
};
`,
);

/* ---------- アニメーションフレーム (攻撃速度) ---------- */

writeFileSync(
  join(root, "src/data/animation.gen.ts"),
  `// このファイルは tools/generate-data.mjs により自動生成される。手で編集しないこと。
// データ出典: psostats.com/combo-calculator (コンボの所要フレーム数)
/**
 * n1/n2/n3 = 各段 Normal の所要フレーム、h1/h2/h3 = Heavy/Special。
 * n1c/h1c 等の "c" はコンボを継続する場合 (アニメーションキャンセル) の値。
 */
export type AnimationFrames = Partial<
  Record<"n1" | "n1c" | "n2" | "n2c" | "n3" | "h1" | "h1c" | "h2" | "h2c" | "h3", number>
>;

/** 男性キャラの基本アニメーション */
export const FRAME_DATA: Record<string, AnimationFrames> = ${JSON.stringify(animation.frameData, null, 2)};

/** 女性キャラの差分アニメーション */
export const FEMALE_FRAME_DATA: Record<string, AnimationFrames> = ${JSON.stringify(animation.femaleFrameData, null, 2)};

/** クラス固有の差分アニメーション */
export const CLASS_SPECIFIC_FRAME_DATA: Record<string, Record<string, AnimationFrames>> = ${JSON.stringify(animation.classSpecificFrameData, null, 2)};

/** POSS ユニットの ATA ブースト対象武器 */
export const POSS_WEAPONS: ReadonlySet<string> = new Set(${JSON.stringify(animation.possWeapons, null, 2)});
`,
);

console.log(
  `generated: weapons=${weaponEntries.length} enemies=${enemyEntries.length} frames=${Object.keys(frames).length} barriers=${Object.keys(barriers).length} animations=${Object.keys(animation.frameData).length}`,
);

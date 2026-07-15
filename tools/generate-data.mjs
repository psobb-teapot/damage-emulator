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
const enemiesOnePerson = raw("enemies-opm.json");
const frames = raw("frames.json");
const barriers = raw("barriers.json");
const animation = raw("animation-frames.json");
const weaponClasses = raw("weapon-classes.json");

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
  "L&K38 Combat": "shot",
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
  // プリセットが SPECIAL 指定 (Dark Flow) の場合、ヒット数は特殊攻撃専用
  const presetIsSpecial = w.comboPreset?.attack1 === "SPECIAL";
  const hits =
    !presetIsSpecial && w.comboPreset?.attack1Hits > 0 ? w.comboPreset.attack1Hits : undefined;
  const specialHits =
    presetIsSpecial && w.comboPreset?.attack1Hits > 0 ? w.comboPreset.attack1Hits : undefined;

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
  if (specialHits !== undefined) fields.push(`specialHits: ${specialHits}`);
  if (specialRaw && HEAVY_ACCURACY_SPECIALS.has(specialRaw)) {
    fields.push(`specialUsesHeavyAccuracy: true`);
  }
  if (w.comboPreset?.attack2 === "NONE") fields.push(`singleAttackOnly: true`);
  // 装備可能クラス (wiki.pioneer2.net の12ビットフラグ由来)
  const bits = weaponClasses.bits[key];
  if (bits) {
    const usable = weaponClasses.classOrder.filter((_, i) => bits[i] === "1");
    fields.push(`usableClasses: ${JSON.stringify(usable)}`);
  }
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

// wiki.pioneer2.net/w/Monsters の掲載順 (2026-07-15 取得)。
// エリアは Forest→Caves→Mines→Ruins→Temple→Spaceship→CCA→Seabed→Tower→
// Crater→Desert (UI の LOCATION_ORDER と同じ)、エリア内は wiki の表の行順で、
// レア敵は元になる敵の直後 (wiki の掲載どおり)。
// 注意: この順序は UI の敵リスト表示順と共有 URL の cmpB ビットマスクの
// ビット位置を決める。
const WIKI_ORDER = [
  // Ep1 Forest
  "El Rappy (Forest)", "Pal Rappy (Forest)", "Gulgus (Forest)",
  "Gulgus-Gue (Forest)", "Bartle", "Barble", "Tollaw",
  "Mothvist (Forest)", "Mothvert (Forest)", "Hildelt (Forest)",
  "Hildetorr (Forest)", "Sil Dragon",
  // Ep1 Caves
  "Vulmer", "Govulmer", "Melqueek", "Ob Lily (Caves)", "Mil Lily (Caves)",
  "Nano Dragon", "Pan Arms (Caves)", "Hidoom (Caves)", "Migium (Caves)",
  "Crimson Assassin (Caves)", "Pofuilly Slime", "Pouilly Slime",
  "Dal Ra Lie", "Dal Ra Lie (Shell)",
  // Ep1 Mines
  "Gillchic (Mines)", "Dubchic (Mines)", "Duvuik (Mines)",
  "Canabin", "Canabin (Ring)", "Canune", "Sinow Blue", "Sinow Red",
  "Baranz (Mines)", "Vol Opt ver. 2 (Form 1)", "Vol Opt ver. 2 (Form 2)",
  // Ep1 Ruins
  "Arlan (Ruins)", "Merlan (Ruins)", "Del-D (Ruins)", "Claw", "Bulclaw",
  "Delsaber (Ruins)", "Gran Sorcerer (Ruins)", "Indi Belra (Ruins)",
  "Dark Gunner", "Dark Bringer", "Darvant", "Darvant (Falz)",
  "Dark Falz (Form 1)", "Dark Falz (Form 2)", "Dark Falz (Form 3)",
  // Ep2 Temple
  "El Rappy (Temple)", "Love Rappy (Temple)", "Arlan (Temple)",
  "Merlan (Temple)", "Del-D (Temple)", "Ob Lily (Temple)",
  "Mil Lily (Temple)", "Mothvist (Temple)", "Mothvert (Temple)",
  "Crimson Assassin (Temple)", "Hildelt (Temple)", "Hildetorr (Temple)",
  "Indi Belra (Temple)", "Barba Ray",
  // Ep2 Spaceship
  "Gulgus (Space)", "Gulgus-Gue (Space)", "Pan Arms (Space)",
  "Hidoom (Space)", "Migium (Space)", "Gillchic (Space)", "Dubchic (Space)",
  "Duvuik (Space)", "Delsaber (Space)", "Baranz (Space)",
  "Gran Sorcerer (Space)", "Gol Dragon",
  // Ep2 CCA
  "Merillia", "Meriltas", "Gee", "Ul Gibbon", "Zol Gibbon", "Sinow Berill",
  "Sinow Spigell", "Gi Gue", "Gibbles", "Mericarol", "Merikle", "Mericus",
  "Gal Gryphon",
  // Ep2 Seabed
  "Dolmolm", "Dolmdarl", "Sinow Zoa", "Sinow Zele", "Morfos", "Deldepth",
  "Recobox", "Recon", "Delbiter", "Olga Flow (Form 1)", "Olga Flow (Form 2)",
  // Ep2 Tower
  "Del Lily", "Ill Gill", "Epsilon",
  // Ep4 Crater
  "Sand Rappy (Crater)", "Del Rappy (Crater)", "Satellite Lizard (Crater)",
  "Yowie (Crater)", "Boota", "Ze Boota", "Ba Boota", "Zu (Crater)",
  "Pazuzu (Crater)", "Astark", "Dorphon", "Dorphon Eclair",
  // Ep4 Desert
  "Sand Rappy (Desert)", "Del Rappy (Desert)", "Satellite Lizard (Desert)",
  "Yowie (Desert)", "Goran", "Pyro Goran", "Goran Detonator", "Merissa A",
  "Merissa AA", "Zu (Desert)", "Pazuzu (Desert)", "Girtablulu",
  "Saint-Milion (Phase 1)", "Saint-Milion (Phase 2)",
  "Shambertin (Phase 1)", "Shambertin (Phase 2)",
  "Kondrieu (Phase 1)", "Kondrieu (Phase 2)",
];
const WIKI_INDEX = new Map(WIKI_ORDER.map((key, i) => [key, i]));

function enemyEntriesOf(dataset) {
  const sorted = Object.entries(dataset).sort(([a], [b]) => {
    const ia = WIKI_INDEX.has(a) ? WIKI_INDEX.get(a) : Infinity;
    const ib = WIKI_INDEX.has(b) ? WIKI_INDEX.get(b) : Infinity;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });
  for (const [key] of sorted) {
    if (!WIKI_INDEX.has(key)) console.warn(`WIKI_ORDER に無い敵: ${key}`);
  }
  const entries = [];
  for (const [key, e] of sorted) {
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
    entries.push(`  ${JSON.stringify(key)}: { ${fields.join(", ")} },`);
  }
  return entries;
}

writeFileSync(
  join(root, "src/data/enemies.gen.ts"),
  `// このファイルは tools/generate-data.mjs により自動生成される。手で編集しないこと。
// データ出典: psostats.com/combo-calculator (Ultimate 難易度)
import type { Enemy } from "../types.js";

/** マルチプレイ時の敵ステータス */
export const ALL_ENEMIES: Record<string, Enemy> = {
${enemyEntriesOf(enemies).join("\n")}
};

/** 一人用モード (One-person mode) の敵ステータス (psostats.com/combo-calculator/opm) */
export const ALL_ENEMIES_ONE_PERSON: Record<string, Enemy> = {
${enemyEntriesOf(enemiesOnePerson).join("\n")}
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
  `generated: weapons=${weaponEntries.length} enemies=${Object.keys(enemies).length} (+opm ${Object.keys(enemiesOnePerson).length}) frames=${Object.keys(frames).length} barriers=${Object.keys(barriers).length} animations=${Object.keys(animation.frameData).length}`,
);

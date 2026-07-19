import { hitChance, requiredHitPercent } from "../accuracy.js";
import { findBestCombo } from "../autoCombo.js";
import { simulateCombo } from "../combo.js";
import { damageRange, minHitsToKill } from "../damage.js";
import { BARRIERS, FRAMES } from "../data/armor.gen.js";
import { CLASSES, playerFromClass } from "../data/classes.js";
import { ENEMIES, ENEMIES_ONE_PERSON } from "../data/enemies.js";
import { SPECIALS } from "../data/specials.js";
import { WEAPONS } from "../data/weapons.js";
import { equipmentBonus, type PossUnit } from "../equipment.js";
import { comboFrames } from "../frames.js";
import { killProbabilityWithAccuracy } from "../probability.js";
import { atpRange, effectiveDfp, totalAta } from "../stats.js";
import { criticalChance, DEFAULT_HITS_PER_ATTACK } from "../constants.js";
import type {
  AttackType,
  ComboAttack,
  ComboInput,
  Difficulty,
  Weapon,
  WeaponKind,
} from "../types.js";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} が見つかりません`);
  return el as T;
};

const input = (id: string) => $<HTMLInputElement>(id);
const select = (id: string) => $<HTMLSelectElement>(id);
const num = (id: string, fallback = 0): number => {
  const v = Number(input(id).value);
  return Number.isFinite(v) ? v : fallback;
};

const WEAPON_KIND_LABELS: Record<WeaponKind, string> = {
  saber: "セイバー",
  sword: "ソード",
  dagger: "ダガー",
  partisan: "パルチザン",
  slicer: "スライサー",
  katana: "カタナ",
  twinSword: "ツインソード",
  doubleSaber: "ダブルセイバー",
  claw: "クロー",
  fist: "ナックル",
  handgun: "ハンドガン",
  rifle: "ライフル",
  mechgun: "マシンガン",
  shot: "ショット",
  launcher: "ランチャー",
  card: "カード",
  cane: "ケイン",
  rod: "ロッド",
  wand: "ワンド",
};

const ATTACK_LABELS: Record<AttackType, string> = { normal: "N", hard: "H", special: "S" };

/** カスタム武器用: 武器種 → 代表アニメーション名 (フレーム計算に使用) */
const KIND_TO_ANIMATION: Record<WeaponKind, string> = {
  saber: "Saber", sword: "Sword", dagger: "Dagger", partisan: "Partisan",
  slicer: "Slicer", katana: "Katana", twinSword: "Twin Sword",
  doubleSaber: "Double Saber", claw: "Claw", fist: "Fist", handgun: "Handgun",
  rifle: "Rifle", mechgun: "Mechgun", shot: "Shot", launcher: "Launcher",
  card: "Card", cane: "Cane", rod: "Rod", wand: "Wand",
};

const fmt = (v: number): string => v.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

/* ================= セレクトの初期化 ================= */

function fillSelect(el: HTMLSelectElement, entries: [string, string][]): void {
  el.innerHTML = "";
  for (const [value, label] of entries) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    el.appendChild(opt);
  }
}

function fillGroupedSelect(
  el: HTMLSelectElement,
  head: [string, string][],
  groups: Map<string, [string, string][]>,
): void {
  el.innerHTML = "";
  for (const [value, label] of head) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    el.appendChild(opt);
  }
  for (const [groupLabel, entries] of groups) {
    const og = document.createElement("optgroup");
    og.label = groupLabel;
    for (const [value, label] of entries) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      og.appendChild(opt);
    }
    el.appendChild(og);
  }
}

fillSelect(select("cls"), Object.keys(CLASSES).map((k) => [k, k]));
select("cls").value = "HUcast";

{
  const groups = new Map<string, [string, string][]>();
  for (const kind of Object.keys(WEAPON_KIND_LABELS) as WeaponKind[]) {
    groups.set(WEAPON_KIND_LABELS[kind], []);
  }
  for (const [key, w] of Object.entries(WEAPONS)) {
    const sp = w.special ? ` [${typeof w.special === "string" ? w.special : w.special.name}]` : "";
    groups.get(WEAPON_KIND_LABELS[w.kind])!.push([key, `${key}${sp}`]);
  }
  for (const [k, v] of groups) if (v.length === 0) groups.delete(k);
  fillGroupedSelect(select("wpPreset"), [["custom", "カスタム武器"]], groups);
}

/* ---- 武器のテキスト検索 (datalist 補完) ---- */

/** 小文字化した武器名 → 正式キー (大文字小文字を無視した確定用) */
const WEAPON_KEY_BY_LOWER = new Map<string, string>(
  Object.keys(WEAPONS).map((k) => [k.toLowerCase(), k]),
);
{
  const list = $<HTMLDataListElement>("wpSearchList");
  for (const [key, w] of Object.entries(WEAPONS)) {
    const opt = document.createElement("option");
    opt.value = key;
    const sp = w.special ? ` [${typeof w.special === "string" ? w.special : w.special.name}]` : "";
    opt.label = `${WEAPON_KIND_LABELS[w.kind]}${sp}`;
    list.appendChild(opt);
  }
}

/** 検索テキストに一致する武器キー (完全一致 → 前方一致 → 部分一致の順) */
function matchWeaponKey(text: string): string | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const exact = WEAPON_KEY_BY_LOWER.get(q);
  if (exact) return exact;
  const keys = Object.keys(WEAPONS);
  return (
    keys.find((k) => k.toLowerCase().startsWith(q)) ??
    keys.find((k) => k.toLowerCase().includes(q)) ??
    null
  );
}

/** 武器を確定し、プリセット反映と再描画まで行う */
function commitWeaponSearch(key: string): void {
  select("wpPreset").value = key;
  input("wpSearch").value = key;
  applyWeaponPreset();
  render();
}

/** 検索欄の表示をプリセット選択と同期する (カスタムは空欄) */
function syncWeaponSearch(): void {
  const key = select("wpPreset").value;
  input("wpSearch").value = key === "custom" ? "" : key;
}

fillSelect(
  select("wpKind"),
  (Object.keys(WEAPON_KIND_LABELS) as WeaponKind[]).map((k) => [k, WEAPON_KIND_LABELS[k]]),
);

fillSelect(select("wpSpecial"), [
  ["", "なし"],
  ...Object.keys(SPECIALS).map((k): [string, string] => [k, k]),
]);

// ゲーム進行順のエリア順序
const LOCATION_ORDER = [
  "Forest", "Caves", "Mines", "Ruins",
  "Temple", "Spaceship", "CCA", "Seabed", "Tower",
  "Crater", "Desert",
];
/** 敵キー → エリア順の通し番号 (セレクト・比較テーブルの既定順) */
const ENEMY_ORDER = new Map<string, number>();
/** 通し番号 → 敵キー (URL圧縮のビットマスク用) */
const ORDERED_ENEMY_KEYS: string[] = [];
{
  const groups = new Map<string, [string, string][]>();
  for (const loc of LOCATION_ORDER) {
    const eps = Object.values(ENEMIES).find((e) => e.location === loc)?.episode;
    groups.set(`Ep${eps} ${loc}`, []);
  }
  for (const [key, e] of Object.entries(ENEMIES)) {
    const label = `Ep${e.episode} ${e.location ?? "?"}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push([key, key]);
  }
  let order = 0;
  for (const [, entries] of groups) {
    for (const [key] of entries) {
      ENEMY_ORDER.set(key, order++);
      ORDERED_ENEMY_KEYS.push(key);
    }
  }
  fillGroupedSelect(select("enPreset"), [["custom", "カスタム敵"]], groups);
}

const noneFirst = (keys: string[]) => ["None", ...keys.filter((k) => k !== "None").sort()];
fillSelect(select("frame"), noneFirst(Object.keys(FRAMES)).map((k) => [k, k]));
fillSelect(select("barrier"), noneFirst(Object.keys(BARRIERS)).map((k) => [k, k]));
fillSelect(select("possUnit"), [
  ["", "なし"],
  ["POSS1", "POSS x1 (+30)"],
  ["POSS2", "POSS x2 (+60)"],
  ["POSS3", "POSS x3 (+90)"],
  ["POSS4", "POSS x4 (+120)"],
]);

/* ================= コンボビルダー ================= */

const comboSteps = $("comboSteps");
const STEP_DEFAULTS: (AttackType | "none")[] = ["hard", "hard", "special"];

for (let step = 1; step <= 3; step++) {
  const div = document.createElement("div");
  div.className = "combo-step";
  div.id = `comboStep${step}`;
  const types: (AttackType | "none")[] = ["none", "normal", "hard", "special"];
  const noneTitle =
    step === 1
      ? "空振り (敵のスポーン前に振り、2段目以降のコンボ命中補正だけ乗せる)"
      : "この段以降で攻撃しない (途中の段なら空振り)";
  div.innerHTML = `
    <div class="combo-step-title">${step} 段目</div>
    <div class="combo-types">
      ${types
        .map(
          (t) => `
        <label class="combo-type t-${t}" ${t === "none" ? `title="${noneTitle}"` : ""}>
          <input type="radio" name="combo${step}" value="${t}" ${
            t === STEP_DEFAULTS[step - 1] ? "checked" : ""
          } />
          <span>${t === "none" ? "–" : ATTACK_LABELS[t as AttackType]}</span>
        </label>`,
        )
        .join("")}
    </div>
    <label class="field combo-hits">
      <span>ヒット数上書き</span>
      <input type="number" id="hits${step}" min="1" max="10" placeholder="自動" />
    </label>
  `;
  comboSteps.appendChild(div);
}

function comboRadio(step: number, value: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[name="combo${step}"][value="${value}"]`);
}

function checkedCombo(step: number): string {
  return (
    document.querySelector<HTMLInputElement>(`input[name="combo${step}"]:checked`)?.value ?? "none"
  );
}

/* ================= プリセット反映 ================= */

function applyClassPreset(): void {
  const cls = CLASSES[select("cls").value];
  if (!cls) return;
  const stats = input("useMax").checked ? cls.max : cls.lv200;
  input("baseAtp").value = String(stats.atp);
  input("baseAta").value = String(stats.ata);
}

function applyWeaponPreset(): void {
  const preset = WEAPONS[select("wpPreset").value];
  if (!preset) return;
  select("wpKind").value = preset.kind;
  input("wpAtpMin").value = String(preset.atpMin);
  input("wpAtpMax").value = String(preset.atpMax);
  input("wpAta").value = String(preset.ata);
  input("wpGrind").value = String(preset.grind ?? preset.maxGrind ?? 0);
  input("wpGrind").max = String(preset.maxGrind ?? 250);
  // 属性%/Hit% は武器の最大値をデフォルトにする (psostats 準拠)
  input("wpAttr").value = String(preset.maxAttributePercent ?? 0);
  input("wpHit").value = String(preset.maxHitPercent ?? 0);
  input("wpHits").value = "";
  select("wpSpecial").value =
    typeof preset.special === "string" ? preset.special : (preset.special?.name ?? "");
  select("wpEff").value = String(preset.specialEffectiveness ?? 1);
  input("wpHeavyAcc").checked = preset.specialUsesHeavyAccuracy ?? false;
  input("wpHeavyDmg").checked = preset.specialUsesHeavyDamage ?? false;

  // コンボ不可武器: 特殊があれば S 単発、なければ H 単発をプリセット
  if (preset.singleAttackOnly) {
    const first = preset.special ? "special" : "hard";
    comboRadio(1, first)!.checked = true;
    comboRadio(2, "none")!.checked = true;
    comboRadio(3, "none")!.checked = true;
  }
}

/** 現在のモード (マルチ/一人用) の敵データセット */
function activeEnemies(): Record<string, import("../types.js").Enemy> {
  return input("enSolo").checked ? ENEMIES_ONE_PERSON : ENEMIES;
}

function applyEnemyPreset(): void {
  const preset = activeEnemies()[select("enPreset").value];
  if (!preset) return;
  input("enHp").value = String(preset.hp);
  input("enDfp").value = String(preset.dfp);
  input("enEvp").value = String(preset.evp);
  input("enEdk").value = String(preset.edk ?? 0);
  input("enEsp").value = String(preset.esp ?? 0);
  select("enDifficulty").value = preset.difficulty ?? "ultimate";
  input("enMachine").checked = preset.isMachine ?? false;
  input("enBoss").checked = preset.isBoss ?? false;
}

/* ================= 制約の反映 ================= */

/** 属性%/Hit% クイック入力の上限表示と有効/無効を更新する */
function updateQuickInputs(): void {
  const preset = WEAPONS[select("wpPreset").value];
  const maxAttr = preset ? (preset.maxAttributePercent ?? 0) : 100;
  const maxHit = preset ? (preset.maxHitPercent ?? 0) : 100;
  input("wpAttr").max = String(maxAttr);
  input("wpHit").max = String(maxHit);
  input("wpAttr").disabled = maxAttr === 0;
  input("wpHit").disabled = maxHit === 0;
  $("wpAttrMax").textContent = maxAttr === 0 ? "(付与不可)" : `/ 最大 ${maxAttr}`;
  $("wpHitMax").textContent = maxHit === 0 ? "(付与不可)" : `/ 最大 ${maxHit}`;
}

/** 現在の武器の制約 (コンボ不可 / 特殊なし) をコンボビルダーへ反映する */
function updateConstraints(): void {
  const preset = WEAPONS[select("wpPreset").value];
  const kindMatches = preset && preset.kind === select("wpKind").value;
  const single = !!(kindMatches && preset.singleAttackOnly);
  const hasSpecial = select("wpSpecial").value !== "";

  const note = $("comboNote");
  if (single) {
    note.hidden = false;
    note.textContent = `${preset!.name} はコンボ攻撃ができません (1段のみ)`;
  } else {
    note.hidden = true;
  }

  for (let step = 1; step <= 3; step++) {
    const stepEl = $(`comboStep${step}`);
    const disableStep = single && step > 1;
    stepEl.classList.toggle("step-disabled", disableStep);
    for (const radio of stepEl.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
      const isSpecial = radio.value === "special";
      // 単発武器は空振り開始も不可 (振った時点で終わり)
      const isNoneOnSingle = single && step === 1 && radio.value === "none";
      radio.disabled = disableStep || (isSpecial && !hasSpecial) || isNoneOnSingle;
      radio.parentElement!.classList.toggle(
        "type-disabled",
        (isSpecial && !hasSpecial && !disableStep) || isNoneOnSingle,
      );
      radio.parentElement!.title =
        isSpecial && !hasSpecial ? "この武器に特殊攻撃はありません" : "";
    }
    if (disableStep) comboRadio(step, "none")!.checked = true;
    // 単発武器で1段目が空振りになっていたら攻撃へ退避
    if (single && step === 1 && checkedCombo(1) === "none") {
      comboRadio(1, hasSpecial ? "special" : "hard")!.checked = true;
    }
    // 特殊なし武器で S が選択されていたら H へ退避
    if (!hasSpecial && checkedCombo(step) === "special") {
      comboRadio(step, "hard")!.checked = true;
    }
    input(`hits${step}`).disabled = disableStep;
  }
}

/* ================= 入力の収集 ================= */

function readCombo(): (ComboAttack | null)[] {
  const raw = [1, 2, 3].map((s) => checkedCombo(s));
  // 末尾の「–」は打ち切り、先頭・途中の「–」は空振り (null) として段数を進める
  let last = -1;
  raw.forEach((t, i) => {
    if (t !== "none") last = i;
  });
  if (last < 0) return [];
  return raw.slice(0, last + 1).map((type, i) => {
    if (type === "none") return null;
    const hitsRaw = input(`hits${i + 1}`).value;
    return {
      type: type as AttackType,
      hits: hitsRaw ? Math.max(1, Math.min(10, Number(hitsRaw))) : undefined,
    };
  });
}

function readWeapon(): Weapon {
  const specialKey = select("wpSpecial").value;
  const kind = select("wpKind").value as WeaponKind;
  const preset = WEAPONS[select("wpPreset").value];
  const kindMatches = preset && preset.kind === kind;
  return {
    name: preset ? preset.name : "カスタム武器",
    kind,
    animation: kindMatches ? preset.animation : KIND_TO_ANIMATION[kind],
    horizontalDistance: kindMatches ? preset.horizontalDistance : 0,
    singleAttackOnly: kindMatches ? preset.singleAttackOnly : undefined,
    usableClasses: kindMatches ? preset.usableClasses : undefined,
    specialHits: kindMatches ? preset.specialHits : undefined,
    hitsPerAttack: input("wpHits").value
      ? num("wpHits", 1)
      : kindMatches
        ? preset.hitsPerAttack
        : undefined,
    atpMin: num("wpAtpMin"),
    atpMax: Math.max(num("wpAtpMin"), num("wpAtpMax")),
    ata: num("wpAta"),
    grind: num("wpGrind"),
    hitPercent: num("wpHit"),
    attributePercent: num("wpAttr"),
    special: specialKey || null,
    specialUsesHeavyAccuracy: input("wpHeavyAcc").checked,
    specialUsesHeavyDamage: input("wpHeavyDmg").checked,
    specialEffectiveness: Number(select("wpEff").value),
  };
}

/** 現在の装備選択による防具 ATP/ATA 合計 (フレーム+バリア+セット効果+追加値) */
function armorTotals(weapon: Weapon): { atp: number; ata: number } {
  const frame = FRAMES[select("frame").value] ?? { atp: 0, ata: 0 };
  const barrier = BARRIERS[select("barrier").value] ?? { atp: 0, ata: 0 };
  const setBonus = equipmentBonus({
    weapon,
    frameName: select("frame").value,
    barrierName: select("barrier").value,
    possUnit: (select("possUnit").value || null) as PossUnit | null,
    commanderBlade: input("commanderBlade").checked,
  });
  return {
    atp: frame.atp + barrier.atp + setBonus.atp + num("armorAtp"),
    ata: frame.ata + barrier.ata + setBonus.ata + num("armorAta"),
  };
}

function readInput(): ComboInput {
  const cls = CLASSES[select("cls").value];
  const weapon = readWeapon();
  const armor = armorTotals(weapon);

  return {
    player: {
      baseAtp: num("baseAtp"),
      baseAta: num("baseAta"),
      lck: num("lck"),
      classCategory: cls?.category ?? "hunter",
      isAndroid: cls?.isAndroid ?? false,
      armorAtp: armor.atp,
      armorAta: armor.ata,
      maxHp: cls ? (input("useMax").checked ? cls.max.hp : cls.lv200.hp) : undefined,
      maxTp: cls ? (input("useMax").checked ? cls.max.tp : cls.lv200.tp) : undefined,
    },
    weapon,
    enemy: {
      name: select("enPreset").value === "custom" ? "カスタム敵" : select("enPreset").value,
      hp: Math.max(1, num("enHp", 1)),
      dfp: num("enDfp"),
      evp: num("enEvp"),
      edk: num("enEdk"),
      esp: num("enEsp"),
      isMachine: input("enMachine").checked,
      isBoss: input("enBoss").checked,
      ccaMiniboss: activeEnemies()[select("enPreset").value]?.ccaMiniboss,
      difficulty: select("enDifficulty").value as Difficulty,
    },
    attacks: readCombo(),
    context: {
      shiftaLevel: num("shifta"),
      zalureLevel: num("zalure"),
      frozen: input("ctxFrozen").checked,
      paralyzed: input("ctxParalyzed").checked,
      v501: input("ctxV501").checked,
      v502: input("ctxV502").checked,
      smartlink: input("ctxSmartlink").checked,
      snGlitch: input("ctxSnGlitch").checked,
      distance: num("ctxDistance"),
      includeCriticals: input("ctxCrits").checked,
    },
  };
}

/* ================= 要約・チップ表示 ================= */

function updateSummaries(inputData: ComboInput): void {
  const cls = CLASSES[select("cls").value];
  $("charSummary").innerHTML = [
    `ATP <b>${fmt(num("baseAtp"))}</b>`,
    `ATA <b>${num("baseAta")}</b>`,
    `LCK <b>${num("lck")}</b>`,
    cls?.isAndroid ? `<span class="badge">アンドロイド</span>` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const w = inputData.weapon;
  const grind = w.grind ?? 0;
  const specialName = typeof w.special === "string" ? w.special : w.special?.name;
  $("wpSummary").innerHTML = [
    WEAPON_KIND_LABELS[w.kind],
    `ATP <b>${w.atpMin}–${w.atpMax}</b>${grind > 0 ? ` <small>+${grind * 2}</small>` : ""}`,
    `ATA <b>${w.ata}</b>`,
    specialName
      ? `<span class="badge badge-special">${specialName}</span>`
      : `<span class="badge badge-muted">特殊なし</span>`,
    w.singleAttackOnly ? `<span class="badge badge-warn">コンボ不可</span>` : "",
    w.usableClasses && !w.usableClasses.includes(select("cls").value)
      ? `<span class="badge badge-special">${select("cls").value} は装備不可</span>`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const e = inputData.enemy;
  const preset = activeEnemies()[select("enPreset").value];
  $("enSummary").innerHTML = [
    `HP <b>${fmt(e.hp)}</b>`,
    `DFP <b>${fmt(e.dfp)}</b>`,
    `EVP <b>${fmt(e.evp)}</b>`,
    `EDK/ESP <b>${e.edk}/${e.esp}</b>`,
    typeBadge(preset?.enemyType),
    e.isBoss ? `<span class="badge badge-warn">ボス</span>` : "",
    preset?.ccaMiniboss ? `<span class="badge badge-warn">属性%無効</span>` : "",
    input("enSolo").checked ? `<span class="badge">一人用</span>` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function chip(text: string): string {
  return `<span class="chip">${text}</span>`;
}

/** 種族バッジ (Native=深緑 / A.Beast=黒めの赤 / Machine=シルバー / Dark=紫めの黒) */
function typeBadge(enemyType: string | undefined): string {
  if (!enemyType) return "";
  const cls =
    {
      "Native": "badge-type-native",
      "A.Beast": "badge-type-abeast",
      "Machine": "badge-type-machine",
      "Dark": "badge-type-dark",
    }[enemyType] ?? "badge-muted";
  return `<span class="badge ${cls}">${enemyType}</span>`;
}

function updateChips(inputData: ComboInput): void {
  const c = inputData.context ?? {};
  const equip: string[] = [];
  if (select("frame").value !== "None") equip.push(chip(select("frame").value));
  if (select("barrier").value !== "None") equip.push(chip(select("barrier").value));
  if (select("possUnit").value) equip.push(chip(select("possUnit").value));
  if (input("commanderBlade").checked) equip.push(chip("CB"));
  if (c.v501) equip.push(chip("V501"));
  if (c.v502) equip.push(chip("V502"));
  if (c.smartlink) equip.push(chip("Smartlink"));
  if (num("armorAtp") > 0) equip.push(chip(`+${num("armorAtp")}ATP`));
  if (num("armorAta") > 0) equip.push(chip(`+${num("armorAta")}ATA`));
  $("equipChips").innerHTML =
    equip.length > 0 ? equip.join("") : `<span class="chip chip-muted">装備なし</span>`;

  // セット効果の表示
  const bonus = equipmentBonus({
    weapon: inputData.weapon,
    frameName: select("frame").value,
    barrierName: select("barrier").value,
    possUnit: (select("possUnit").value || null) as PossUnit | null,
    commanderBlade: input("commanderBlade").checked,
  });
  const note = $("setEffectNote");
  if (bonus.atp > 0 || bonus.ata > 0) {
    note.hidden = false;
    note.textContent = `セット効果発動中: ATP +${fmt(bonus.atp)} / ATA +${bonus.ata}`;
  } else {
    note.hidden = true;
  }
}

/* ================= ビュー切替タブ ================= */

type ViewId = "detail" | "enemies" | "line" | "classes";
let activeView: ViewId = "detail";

function setActiveView(view: ViewId): void {
  activeView = view;
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".view-tab")) {
    btn.classList.toggle("view-active", btn.dataset.view === view);
  }
  for (const id of ["detail", "enemies", "line", "classes"] as const) {
    $(`view-${id}`).hidden = id !== view;
  }
}

document.querySelector(".view-tabs")!.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>(".view-tab");
  if (!btn) return;
  setActiveView(btn.dataset.view as ViewId);
  render();
});

/* ================= 全クラスで最適コンボを比較 ================= */

function renderClassCompare(inputData: ComboInput): void {
  $("clsTargetNote").textContent = `対象の敵: ${inputData.enemy.name}${
    input("enSolo").checked ? " (一人用)" : ""
  } — `;
  const usable = inputData.weapon.usableClasses;
  const rows = Object.keys(CLASSES)
    .map((clsName) => {
      const armor = armorTotals(inputData.weapon);
      const player = {
        ...playerFromClass(clsName, {
          useMaxStats: input("useMax").checked,
          lck: num("lck"),
        }),
        armorAtp: armor.atp,
        armorAta: armor.ata,
      };
      const best = findBestCombo(
        player, inputData.weapon, inputData.enemy, clsName, inputData.context ?? {},
      );
      if (!best) return null;
      const sim = simulateCombo({
        player,
        weapon: inputData.weapon,
        enemy: inputData.enemy,
        attacks: best.attacks.map((type) => ({ type })),
        context: inputData.context,
      });
      const equippable = !usable || usable.includes(clsName);
      return { clsName, best, kill: sim.killProbability * 100, equippable };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // 装備可能クラスを上位に、その中でキル確率→ダメージ→フレームの順
  rows.sort((a, b) => {
    if (a.equippable !== b.equippable) return a.equippable ? -1 : 1;
    if (b.kill !== a.kill) return b.kill - a.kill;
    if (b.best.totalDamage !== a.best.totalDamage) return b.best.totalDamage - a.best.totalDamage;
    return (a.best.frames ?? 9999) - (b.best.frames ?? 9999);
  });

  const tbody = $("classCompareRows");
  tbody.innerHTML = "";
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.className =
      "compare-row" +
      (row.clsName === select("cls").value ? " row-active" : "") +
      (row.equippable ? "" : " row-unequippable");
    const comboLabel = row.best.attacks.map((t) => ATTACK_LABELS[t]).join("→");
    const killClass = row.kill >= 99.95 ? "kill-hi" : row.kill <= 0.05 ? "kill-lo" : "";
    const star = i === 0 && row.equippable ? "★ " : "";
    tr.innerHTML = `
      <td>${star}${row.clsName}${row.equippable ? "" : ` <span class="badge badge-special">装備不可</span>`}</td>
      <td class="num">${comboLabel}</td>
      <td class="num">${fmt(row.best.totalDamage)}</td>
      <td class="num ${killClass}">${row.kill.toFixed(1)}%</td>
      <td class="num">${row.best.overallAccuracy.toFixed(1)}%</td>
      <td class="num">${row.best.frames != null ? `${row.best.frames}F` : "–"}</td>
    `;
    tr.addEventListener("click", () => {
      select("cls").value = row.clsName;
      applyClassPreset();
      for (let step = 1; step <= 3; step++) {
        const type = row.best.attacks[step - 1] ?? "none";
        const radio = comboRadio(step, type);
        if (radio) radio.checked = true;
        input(`hits${step}`).value = "";
      }
      setActiveView("detail");
      render();
    });
    tbody.appendChild(tr);
  });
}

/* ================= 条件バー (敵の状態のミラー・全比較タブ) ================= */

// トグル → 上部カードの実コントロールを操作 (双方向同期)
for (const btn of document.querySelectorAll<HTMLButtonElement>(".cond-toggle[data-cond]")) {
  btn.addEventListener("click", () => {
    const el = input(btn.dataset.cond!);
    el.checked = !el.checked;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
// ザルアは 0〜30 の任意レベルを選べるセレクト (上部スライダーと双方向同期)
for (const sel of document.querySelectorAll<HTMLSelectElement>(".cond-zalure-select")) {
  for (let lv = 0; lv <= 30; lv++) {
    const opt = document.createElement("option");
    opt.value = String(lv);
    opt.textContent = String(lv);
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => {
    const z = input("zalure");
    z.value = sel.value;
    z.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** 条件バーの表示状態を上部カードと同期する */
function updateCondBars(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>(".cond-toggle[data-cond]")) {
    btn.classList.toggle("cond-active", input(btn.dataset.cond!).checked);
  }
  const z = num("zalure");
  for (const field of document.querySelectorAll<HTMLElement>(".cond-zalure-field")) {
    field.classList.toggle("cond-active", z > 0);
    field.querySelector<HTMLSelectElement>(".cond-zalure-select")!.value = String(z);
  }
}

/** 条件変更時にテーブルを一瞬光らせて再計算を知覚させる */
let lastCondKey = "";
function flashIfCondChanged(): void {
  const key = [
    input("enSolo").checked, num("zalure"),
    input("ctxFrozen").checked, input("ctxParalyzed").checked,
  ].join("|");
  const changed = lastCondKey !== "" && lastCondKey !== key;
  lastCondKey = key;
  if (!changed) return;
  const section = document.querySelector<HTMLElement>(".view-section:not([hidden])");
  const target = section?.querySelector<HTMLElement>(".compare-scroll") ?? section;
  if (!target) return;
  target.classList.remove("cond-flash");
  void target.offsetWidth; // アニメーション再始動
  target.classList.add("cond-flash");
}

/* ================= 複数の敵リスト (「複数の敵」「確定ライン」タブで共有) ================= */

let compareList: string[] = [];
let compareSort: { col: "name" | "hp" | "avg" | "kill" | "acc" | null; asc: boolean } = {
  col: null,
  asc: false,
};

function addToCompare(keys: string[]): void {
  for (const key of keys) {
    if (!compareList.includes(key)) compareList.push(key);
  }
  render();
}

// 追加UI (敵ピッカー+ボタン) は「複数の敵」「確定ライン」両タブに同じものがある
{
  const groups = new Map<string, [string, string][]>();
  for (const [key, e] of Object.entries(ENEMIES)) {
    const label = `Ep${e.episode} ${e.location ?? "?"}`;
    if (!groups.has(label)) groups.set(label, []);
  }
  // ENEMY_ORDER と同じ並びで構築
  const ordered = [...Object.entries(ENEMIES)].sort(
    ([a], [b]) => (ENEMY_ORDER.get(a) ?? 999) - (ENEMY_ORDER.get(b) ?? 999),
  );
  const pickerGroups = new Map<string, [string, string][]>();
  for (const [key, e] of ordered) {
    const label = `Ep${e.episode} ${e.location ?? "?"}`;
    if (!pickerGroups.has(label)) pickerGroups.set(label, []);
    pickerGroups.get(label)!.push([key, key]);
  }
  for (const picker of document.querySelectorAll<HTMLSelectElement>(".cmp-picker")) {
    fillGroupedSelect(picker, [], pickerGroups);
  }
}
for (const btn of document.querySelectorAll<HTMLButtonElement>(".cmp-add-picked")) {
  btn.addEventListener("click", () => {
    const picker = btn.parentElement!.querySelector<HTMLSelectElement>(".cmp-picker");
    if (picker?.value) addToCompare([picker.value]);
  });
}
for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-cmp-type]")) {
  btn.addEventListener("click", () => {
    const type = btn.dataset.cmpType!;
    addToCompare(
      Object.entries(activeEnemies())
        .filter(([, e]) => e.enemyType === type)
        .map(([k]) => k),
    );
  });
}
for (const btn of document.querySelectorAll<HTMLButtonElement>(".cmp-all")) {
  btn.addEventListener("click", () => addToCompare(Object.keys(activeEnemies())));
}
for (const btn of document.querySelectorAll<HTMLButtonElement>(".cmp-clear")) {
  btn.addEventListener("click", () => {
    compareList = [];
    render();
  });
}

// ソートはヘッダへの委譲で処理 (「複数の敵」タブのみ)
$("enemiesHead").addEventListener("click", (ev) => {
  const th = (ev.target as HTMLElement).closest<HTMLElement>("th[data-sort]");
  if (!th) return;
  const col = th.dataset.sort as NonNullable<typeof compareSort.col>;
  // クリックごとに 降順 → 昇順 → エリア順 (既定) を循環
  if (compareSort.col !== col) compareSort = { col, asc: false };
  else if (!compareSort.asc) compareSort = { col, asc: true };
  else compareSort = { col: null, asc: false };
  render();
});

/** タブのバッジと空表示/テーブルの切替。有効な敵数を返す */
function syncCompareListState(): number {
  const dataset = activeEnemies();
  compareList = compareList.filter((key) => dataset[key]);
  const n = compareList.length;
  for (const [badgeId, emptyId, tableId] of [
    ["enemiesCount", "enemiesEmpty", "enemiesTable"],
    ["lineCount", "lineEmpty", "lineTable"],
  ] as const) {
    const badge = $(badgeId);
    badge.hidden = n === 0;
    badge.textContent = String(n);
    $(emptyId).hidden = n > 0;
    $(tableId).hidden = n === 0;
  }
  return n;
}

function renderEnemiesView(inputData: ComboInput): void {
  if (compareList.length === 0) return;
  const dataset = activeEnemies();

  const rows = compareList.map((key) => {
    const enemy = dataset[key]!;
    const r = simulateCombo({ ...inputData, enemy });
    const acc = r.hits.reduce((p, h) => p * (h.accuracy / 100), 1) * 100;
    return {
      key,
      enemy,
      avg: r.totals.avg,
      kill: r.killProbability * 100,
      acc,
      pct: Math.min(100, (r.totals.avg / enemy.hp) * 100),
    };
  });

  if (compareSort.col) {
    const dir = compareSort.asc ? 1 : -1;
    const col = compareSort.col;
    rows.sort((a, b) => {
      if (col === "name") return a.key.localeCompare(b.key) * dir;
      if (col === "hp") return (a.enemy.hp - b.enemy.hp) * dir;
      if (col === "avg") return (a.avg - b.avg) * dir;
      if (col === "kill") return (a.kill - b.kill) * dir;
      return (a.acc - b.acc) * dir;
    });
  } else {
    // 既定はエリア順 (Ep1 Forest → … → Ep4 Desert)
    rows.sort((a, b) => (ENEMY_ORDER.get(a.key) ?? 999) - (ENEMY_ORDER.get(b.key) ?? 999));
  }

  const tbody = $("compareRows");
  tbody.innerHTML = "";
  // 既定 (エリア順) のときはエリア見出し行でグループ化する
  const grouped = compareSort.col === null;
  let currentArea = "";
  for (const row of rows) {
    if (grouped) {
      const area = `Ep${row.enemy.episode} ${row.enemy.location ?? "?"}`;
      if (area !== currentArea) {
        currentArea = area;
        const groupTr = document.createElement("tr");
        groupTr.className = "compare-group";
        groupTr.innerHTML = `<td colspan="7">${area}</td>`;
        tbody.appendChild(groupTr);
      }
    }
    const tr = document.createElement("tr");
    tr.className = "compare-row" + (row.key === select("enPreset").value ? " row-active" : "");
    const killClass = row.kill >= 99.95 ? "kill-hi" : row.kill <= 0.05 ? "kill-lo" : "";
    const areaBadge = grouped
      ? ""
      : ` <span class="badge badge-muted">Ep${row.enemy.episode} ${row.enemy.location ?? ""}</span>`;
    tr.innerHTML = `
      <td class="${grouped ? "cell-indent" : ""}">${row.key}${areaBadge} ${typeBadge(row.enemy.enemyType)}</td>
      <td class="num">${fmt(row.enemy.hp)}</td>
      <td class="num">${fmt(row.avg)}</td>
      <td class="pct-cell"><span class="pct-bar" style="width:${row.pct}%"></span><span class="pct-text">${row.pct.toFixed(0)}%</span></td>
      <td class="num ${killClass}">${row.kill.toFixed(1)}%</td>
      <td class="num">${row.acc.toFixed(1)}%</td>
      <td><button type="button" class="cmp-remove" data-key="${row.key}" title="リストから外す">×</button></td>
    `;
    tr.addEventListener("click", () => {
      select("enPreset").value = row.key;
      applyEnemyPreset();
      setActiveView("detail");
      render();
    });
    tr.querySelector(".cmp-remove")!.addEventListener("click", (ev) => {
      ev.stopPropagation();
      compareList = compareList.filter((k) => k !== row.key);
      render();
    });
    tbody.appendChild(tr);
  }
}

/** 確定ライン (逆算) タブの描画。想定Hit% スライダーの値で達成判定する */
function renderLineView(inputData: ComboInput): void {
  $("lineHitOut").textContent = input("lineHit").value;
  if (compareList.length === 0) return;
  const dataset = activeEnemies();
  const { player, weapon, attacks } = inputData;
  const ctx = inputData.context ?? {};
  const currentHit = num("lineHit"); // 想定Hit% (武器のHit%とは独立)
  const maxHitCap = WEAPONS[select("wpPreset").value]?.maxHitPercent ?? 100;

  const hitsOf = (a: ComboAttack): number =>
    a.hits ??
    (a.type === "special"
      ? (weapon.specialHits ?? weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind])
      : (weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind]));

  // ヒット数列の対象 = 最多ヒットの段 (Dark Flow の特殊5本など)。空振り段 (null) は除外
  const firstIdx = attacks.findIndex((a) => a !== null);
  if (firstIdx < 0) return;
  let hitsType = attacks[firstIdx]!.type;
  let hitsStep = firstIdx + 1;
  let maxHits = hitsOf(attacks[firstIdx]!);
  attacks.forEach((a, i) => {
    if (!a) return;
    const h = hitsOf(a);
    if (h > maxHits) {
      maxHits = h;
      hitsType = a.type;
      hitsStep = i + 1;
    }
  });

  const stepThs = attacks
    .map((a, i) =>
      a
        ? `<th>${i + 1}段目${ATTACK_LABELS[a.type]}<br><small>必要Hit%</small></th>`
        : `<th>${i + 1}段目<br><small>空振り</small></th>`,
    )
    .join("");
  const hitsThs =
    maxHits > 1
      ? Array.from(
          { length: maxHits },
          (_, i) => `<th title="n本発射時のキル確率 (想定Hit%の命中判定・ダメージ乱数込み)">${ATTACK_LABELS[hitsType]}×${i + 1}</th>`,
        ).join("")
      : `<th title="しきい値を満たすのに必要な発数 (命中判定込み)">必要発数 <small>(${ATTACK_LABELS[hitsType]})</small></th>`;
  $("lineHead").innerHTML =
    `<tr><th>敵</th>${stepThs}${hitsThs}<th></th></tr>`;

  const keys = [...compareList].sort(
    (a, b) => (ENEMY_ORDER.get(a) ?? 999) - (ENEMY_ORDER.get(b) ?? 999),
  );

  const tbody = $("lineRows");
  tbody.innerHTML = "";
  let currentArea = "";
  const colCount = 2 + attacks.length + (maxHits > 1 ? maxHits : 1);
  for (const key of keys) {
    const enemy = dataset[key]!;
    const area = `Ep${enemy.episode} ${enemy.location ?? "?"}`;
    if (area !== currentArea) {
      currentArea = area;
      const groupTr = document.createElement("tr");
      groupTr.className = "compare-group";
      groupTr.innerHTML = `<td colspan="${colCount}">${area}</td>`;
      tbody.appendChild(groupTr);
    }

    const reqs = attacks.map((a, i) =>
      a ? requiredHitPercent(player, weapon, enemy, a.type, (i + 1) as 1 | 2 | 3, ctx) : null,
    );
    const reqCells = reqs
      .map((req) => {
        if (req === null) {
          return `<td class="num req-imp" title="空振り (敵に当てない)">—</td>`;
        }
        // Hit% は 5% 単位でしか付かないため、入手可能な値へ切り上げて表示
        const attainable = !Number.isFinite(req) ? Infinity : Math.ceil(req / 5) * 5;
        if (attainable > maxHitCap) {
          return `<td class="num req-imp" title="この武器の Hit% 上限では命中100%にできない (厳密値 ${Number.isFinite(req) ? req : "—"})">不可</td>`;
        }
        const ok = currentHit >= attainable;
        return `<td class="num ${ok ? "req-ok" : "req-ng"}" title="${ok ? "想定 Hit% で達成" : `Hit% ${attainable} 以上で命中100%`}${attainable !== req ? ` (厳密値 ${req})` : ""}">${attainable}</td>`;
      })
      .join("");

    const dmg = damageRange(player, weapon, enemy, hitsType, ctx);
    const threshold = num("lineThreshold", 100);
    const critC = (ctx.includeCriticals ?? true) ? criticalChance(player.lck) / 100 : 0;
    // 想定Hit% での1本あたり命中率を織り込む
    const assumedWeapon = { ...weapon, hitPercent: currentHit };
    const perHitAcc =
      hitChance(player, assumedWeapon, enemy, hitsType, hitsStep as 1 | 2 | 3, ctx) / 100;
    const fmtP = (p: number): string =>
      p >= 99.995 ? "✓" : p >= 99 ? `${p.toFixed(2)}%` : p >= 10 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`;
    let hitsCells: string;
    if (maxHits > 1) {
      const pByHits = killProbabilityWithAccuracy(
        dmg.min, dmg.max, enemy.hp, maxHits, perHitAcc, critC,
      );
      hitsCells = Array.from({ length: maxHits }, (_, i) => {
        const p = (pByHits[i] ?? 0) * 100;
        if (p <= 0.005) return `<td class="num hit-no" title="${i + 1}本では撃破不可">×</td>`;
        const meets = p >= threshold - 1e-9;
        const cls = meets ? "hit-ok" : "hit-low";
        const title =
          `${i + 1}本発射時のキル確率 ${p.toFixed(2)}% ` +
          `(1本あたり命中率 ${(perHitAcc * 100).toFixed(1)}%・命中判定込み)` +
          (!meets ? ` — しきい値 ${threshold}% 未満` : "");
        return `<td class="num ${cls}" title="${title}">${fmtP(p)}</td>`;
      }).join("");
    } else {
      // 単発武器: しきい値を満たす最小発数 (命中判定込み)
      if (threshold >= 100 && perHitAcc >= 1) {
        const n = minHitsToKill(player, weapon, enemy, hitsType, ctx);
        hitsCells = `<td class="num">${n != null ? `${n}発` : "–"}</td>`;
      } else {
        const pByHits = killProbabilityWithAccuracy(
          dmg.min, dmg.max, enemy.hp, 30, perHitAcc, critC,
        );
        const idx = pByHits.findIndex((p) => p * 100 >= threshold - 1e-9);
        hitsCells = `<td class="num" title="しきい値 ${threshold}% を満たす最小発数 (命中判定込み)">${idx >= 0 ? `${idx + 1}発` : "–"}</td>`;
      }
    }

    const tr = document.createElement("tr");
    tr.className = "compare-row" + (key === select("enPreset").value ? " row-active" : "");
    tr.innerHTML = `
      <td class="cell-indent">${key} ${typeBadge(enemy.enemyType)}</td>
      ${reqCells}
      ${hitsCells}
      <td><button type="button" class="cmp-remove" data-key="${key}" title="リストから外す">×</button></td>
    `;
    tr.addEventListener("click", () => {
      select("enPreset").value = key;
      applyEnemyPreset();
      setActiveView("detail");
      render();
    });
    tr.querySelector(".cmp-remove")!.addEventListener("click", (ev) => {
      ev.stopPropagation();
      compareList = compareList.filter((k) => k !== key);
      render();
    });
    tbody.appendChild(tr);
  }
}

/* ================= URL 共有 ================= */

const STATE_FIELDS = [
  "cls", "useMax", "lck", "baseAtp", "baseAta",
  "wpPreset", "wpKind", "wpAtpMin", "wpAtpMax", "wpAta", "wpGrind", "wpAttr", "wpHit",
  "wpHits", "wpSpecial", "wpEff", "wpHeavyAcc", "wpHeavyDmg",
  "enPreset", "enSolo", "enHp", "enDfp", "enEvp", "enEdk", "enEsp", "enDifficulty", "enMachine", "enBoss",
  "shifta", "zalure", "ctxDistance", "ctxFrozen", "ctxParalyzed", "ctxCrits",
  "ctxV501", "ctxV502", "ctxSmartlink", "ctxSnGlitch",
  "frame", "barrier", "possUnit", "commanderBlade", "armorAtp", "armorAta",
  "hits1", "hits2", "hits3", "lineHit", "lineThreshold",
] as const;

/* --- 圧縮ユーティリティ (URL短縮のため deflate + base64url) --- */

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (s: string): Uint8Array =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function deflate(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/** 比較リスト → エリア順ビットマスクの base64url (135敵 ≈ 23文字) */
function compareListToBits(): string {
  const bytes = new Uint8Array(Math.ceil(ORDERED_ENEMY_KEYS.length / 8));
  for (const key of compareList) {
    const idx = ENEMY_ORDER.get(key);
    if (idx != null) bytes[idx >> 3] = (bytes[idx >> 3] ?? 0) | (1 << (idx & 7));
  }
  return toBase64Url(bytes);
}

function bitsToCompareList(bits: string): string[] {
  const bytes = fromBase64Url(bits);
  const keys: string[] = [];
  ORDERED_ENEMY_KEYS.forEach((key, idx) => {
    if (((bytes[idx >> 3] ?? 0) >> (idx & 7)) & 1) keys.push(key);
  });
  return keys;
}

function serializeStateObject(): Record<string, string> {
  const state: Record<string, string> = {};
  for (const id of STATE_FIELDS) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    state[id] = el.type === "checkbox" ? ((el as HTMLInputElement).checked ? "1" : "0") : el.value;
  }
  for (let s = 1; s <= 3; s++) state[`combo${s}`] = checkedCombo(s);
  if (compareList.length > 0) state["cmpB"] = compareListToBits();
  if (activeView !== "detail") state["view"] = activeView;
  return state;
}

function applyState(state: Record<string, string>): boolean {
  for (const id of STATE_FIELDS) {
    if (!(id in state)) continue;
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (el.type === "checkbox") (el as HTMLInputElement).checked = state[id] === "1";
    else el.value = state[id]!;
  }
  for (let s = 1; s <= 3; s++) {
    const radio = comboRadio(s, state[`combo${s}`] ?? "none");
    if (radio) radio.checked = true;
  }
  if (state["cmpB"]) compareList = bitsToCompareList(state["cmpB"]);
  else compareList = state["cmp"] ? state["cmp"].split("|") : [];
  if (state["view"]) setActiveView(state["view"] as ViewId);
  return true;
}

async function restoreFromUrl(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  try {
    const z = params.get("z");
    if (z) return applyState(JSON.parse(await inflate(fromBase64Url(z))) as Record<string, string>);
    const s = params.get("s"); // 旧形式 (無圧縮 base64) の共有 URL 互換
    if (s) return applyState(JSON.parse(decodeURIComponent(escape(atob(s)))) as Record<string, string>);
  } catch {
    /* 壊れた共有 URL は既定状態で開く */
  }
  return false;
}

let syncSeq = 0;
function syncUrl(): Promise<void> {
  const seq = ++syncSeq;
  const json = JSON.stringify(serializeStateObject());
  return deflate(json)
    .then((bytes) => {
      if (seq !== syncSeq) return; // 古い書き込みが最新を上書きしないように
      const url = new URL(location.href);
      url.searchParams.delete("s");
      url.searchParams.set("z", toBase64Url(bytes));
      history.replaceState(null, "", url);
    })
    .catch(() => {
      // CompressionStream 非対応環境では旧形式で保存
      const url = new URL(location.href);
      url.searchParams.delete("z");
      url.searchParams.set("s", btoa(unescape(encodeURIComponent(json))));
      history.replaceState(null, "", url);
    });
}

$("shareBtn").addEventListener("click", async () => {
  await syncUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    const btn = $("shareBtn");
    const original = btn.textContent;
    btn.textContent = "コピーしました";
    setTimeout(() => (btn.textContent = original), 1500);
  } catch {
    /* clipboard 不許可時は URL バーからコピー可能 */
  }
});

/* ================= 結果の描画 ================= */

function render(): void {
  const errorBox = $("resultError");
  errorBox.hidden = true;

  try {
    updateConstraints();
    updateQuickInputs();
    const inputData = readInput();
    updateSummaries(inputData);
    updateChips(inputData);

    // ヒット数プレースホルダ (攻撃タイプごとの自動値)
    for (let s = 1; s <= 3; s++) {
      const type = checkedCombo(s);
      if (type === "none") {
        input(`hits${s}`).placeholder = "自動";
        continue;
      }
      const w = inputData.weapon;
      const auto =
        type === "special"
          ? (w.specialHits ?? w.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[w.kind])
          : (w.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[w.kind]);
      input(`hits${s}`).placeholder = `自動 (${auto})`;
    }

    if (inputData.attacks.length === 0) {
      throw new Error("コンボを 1 段以上指定してください。");
    }
    const result = simulateCombo(inputData);
    const enemyHp = inputData.enemy.hp;

    // 計算根拠 (実効値)
    const range = atpRange(inputData.player, inputData.weapon, inputData.context);
    const dfpEff = effectiveDfp(inputData.enemy, inputData.context);
    $("derivedStats").innerHTML =
      `ATA合計 <b>${totalAta(inputData.player, inputData.weapon)}</b> · ` +
      `実効ATP <b>${fmt(range.min)}–${fmt(range.max)}</b> · ` +
      `実効DFP <b>${fmt(dfpEff)}</b>`;

    // HPバー
    const bar = $("hpbar");
    bar.innerHTML = "";
    let consumed = 0;
    for (const hit of result.hits) {
      if (consumed >= enemyHp) break;
      const isHpCut = hit.special?.category === "hpCut";
      const dmg = isHpCut
        ? (enemyHp - consumed) *
          (hit.special?.hpCutFraction ?? 0) *
          ((hit.special?.activationChance ?? 0) / 100)
        : hit.damage.avg;
      const w = (Math.min(dmg, enemyHp - consumed) / enemyHp) * 100;
      consumed += Math.min(dmg, enemyHp - consumed);
      const seg = document.createElement("span");
      seg.className = `seg s-${hit.attackType}`;
      seg.style.width = `${w}%`;
      seg.style.opacity = String(0.35 + 0.65 * (hit.accuracy / 100));
      seg.title = `${hit.comboStep}段目 ${ATTACK_LABELS[hit.attackType]} — ${fmt(dmg)} dmg / 命中 ${hit.accuracy}%`;
      bar.appendChild(seg);
    }
    const rest = document.createElement("span");
    rest.className = "seg s-rest";
    bar.appendChild(rest);

    $("hpbarEnemy").textContent = `${inputData.enemy.name} — HP ${fmt(enemyHp)}`;
    $("hpbarValue").textContent =
      consumed >= enemyHp ? "撃破圏内 (平均ダメージ)" : `平均で残り ${fmt(enemyHp - consumed)}`;

    // 統計
    const killPct = result.killProbability * 100;
    $("statKill").textContent = `${killPct.toFixed(killPct > 99 && killPct < 100 ? 2 : 1)}%`;
    $("statKill").parentElement!.classList.toggle("kill-sure", killPct >= 99.95);

    // クリティカル前提の明示と内訳
    const critsOn = inputData.context?.includeCriticals ?? true;
    const critPct = criticalChance(inputData.player.lck);
    $("statKillLabel").innerHTML = critsOn
      ? `キル確率 <small>クリ込み (LCK ${inputData.player.lck} → ${critPct}%)</small>`
      : `キル確率 <small>クリなし</small>`;
    const killNote = $("statKillNote");
    if (critsOn && killPct > 0.05) {
      const noCrit = simulateCombo({
        ...inputData,
        context: { ...inputData.context, includeCriticals: false },
      });
      const noCritPct = noCrit.killProbability * 100;
      if (noCritPct <= 0.05) {
        killNote.hidden = false;
        killNote.textContent = "クリティカル必須 — クリなしでは撃破不可";
        killNote.classList.add("note-warn");
      } else if (killPct - noCritPct >= 0.1) {
        killNote.hidden = false;
        killNote.textContent = `うちクリティカル依存 +${(killPct - noCritPct).toFixed(1)}% (クリなし ${noCritPct.toFixed(1)}%)`;
        killNote.classList.remove("note-warn");
      } else {
        killNote.hidden = true;
      }
    } else {
      killNote.hidden = true;
    }
    $("statExpected").textContent = fmt(result.totals.expected);
    $("statAvg").textContent = fmt(result.totals.avg);
    // コンボ合計の下限 (乱数最小・クリなし)。下限で HP を超えれば乱数によらず撃破確定
    const rangeNote = $("statAvgRange");
    if (result.totals.max > 0) {
      rangeNote.hidden = false;
      if (result.totals.min >= enemyHp) {
        rangeNote.textContent = `下限 ${fmt(result.totals.min)} — 全弾命中なら乱数によらず撃破`;
        rangeNote.classList.add("note-sure");
      } else {
        rangeNote.textContent = `下限 ${fmt(result.totals.min)} / 上限 ${fmt(result.totals.max)}`;
        rangeNote.classList.remove("note-sure");
      }
    } else {
      // hpCut 特殊 (Demon's 等) のみのコンボは ATP ダメージ幅を持たない
      rangeNote.hidden = true;
    }
    $("statRemain").textContent = fmt(result.expectedRemainingHp);

    // ヒットテーブル
    const rows = $("hitRows");
    rows.innerHTML = "";
    for (const hit of result.hits) {
      const tr = document.createElement("tr");
      const sameStepHits = result.hits.filter((h) => h.comboStep === hit.comboStep).length;
      const accText =
        hit.accuracyAtMaxRange != null && hit.accuracyAtMaxRange !== hit.accuracy
          ? `${hit.accuracyAtMaxRange.toFixed(1)}–${hit.accuracy.toFixed(1)}%`
          : `${hit.accuracy.toFixed(1)}%`;
      tr.innerHTML = `
        <td class="num">${hit.comboStep}${sameStepHits > 1 ? `-${hit.hitIndex}` : ""}</td>
        <td class="num t-${hit.attackType}">${ATTACK_LABELS[hit.attackType]}</td>
        <td class="num" title="最遠距離–密着時の命中率">${accText}</td>
        <td><span class="num dmg-avg">${fmt(hit.damage.avg)}</span>
            <span class="dmg-range">${fmt(hit.damage.min)}–${fmt(hit.damage.max)}</span></td>
        <td class="num">${fmt(hit.expectedDamage)}</td>
      `;
      rows.appendChild(tr);
    }

    // 特殊・コスト
    const notes = $("specialNotes");
    notes.innerHTML = "";
    const specials = new Map<string, (typeof result.hits)[number]["special"]>();
    for (const hit of result.hits) {
      if (hit.special) specials.set(hit.special.name, hit.special);
    }
    for (const sp of specials.values()) {
      if (!sp) continue;
      const div = document.createElement("div");
      const act = sp.activationChance != null ? ` 発動率 ${sp.activationChance.toFixed(1)}%` : "";
      div.innerHTML = `<span class="special-name">${sp.name}</span>${act} — ${sp.effect}`;
      notes.appendChild(div);
    }

    const cost = $("resultCost");
    if (result.resourceCost) {
      cost.hidden = false;
      cost.textContent = `コスト: ${result.resourceCost}`;
    } else {
      cost.hidden = true;
    }

    // 所要フレーム (空振り段は通常振りとして計上)
    const fr = comboFrames(
      inputData.weapon,
      select("cls").value,
      inputData.attacks.map((a) => a?.type ?? "normal"),
    );
    $("comboFramesOut").textContent =
      fr.frames != null ? `所要フレーム: ${fr.frames}F` : "所要フレーム: データなし";

    // タブごとの表示
    updateCondBars();
    const listCount = syncCompareListState();
    if (activeView === "enemies" && listCount > 0) renderEnemiesView(inputData);
    if (activeView === "line") renderLineView(inputData);
    if (activeView === "classes") renderClassCompare(inputData);
    flashIfCondChanged();
    void syncUrl();
  } catch (e) {
    errorBox.hidden = false;
    errorBox.textContent = e instanceof Error ? e.message : String(e);
  }
}

/* ================= イベント配線 ================= */

select("cls").addEventListener("change", () => {
  applyClassPreset();
  render();
});
input("useMax").addEventListener("change", () => {
  applyClassPreset();
  render();
});
select("wpPreset").addEventListener("change", () => {
  applyWeaponPreset();
  syncWeaponSearch();
  render();
});

// 武器のテキスト検索: datalist 候補の確定 (完全一致) は即反映、Enter は最良一致で確定
// フォーカス時は全選択し、表示中の武器名をそのまま打ち替えられるようにする
input("wpSearch").addEventListener("focus", () => {
  input("wpSearch").select();
});
input("wpSearch").addEventListener("input", () => {
  const key = WEAPON_KEY_BY_LOWER.get(input("wpSearch").value.trim().toLowerCase());
  if (key) commitWeaponSearch(key);
});
input("wpSearch").addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return;
  ev.preventDefault();
  const key = matchWeaponKey(input("wpSearch").value);
  if (key) commitWeaponSearch(key);
});
input("wpSearch").addEventListener("change", () => {
  const text = input("wpSearch").value;
  if (!text.trim()) {
    // 空欄で確定した場合は現在の選択を表示し直す
    syncWeaponSearch();
    return;
  }
  const key = matchWeaponKey(text);
  if (key) commitWeaponSearch(key);
  else syncWeaponSearch(); // 一致なし: 現在の選択へ戻す
});
select("enPreset").addEventListener("change", () => {
  applyEnemyPreset();
  render();
});
// モード切替時はプリセットの値を選び直す (カスタムは値を維持)
input("enSolo").addEventListener("change", () => {
  if (select("enPreset").value !== "custom") applyEnemyPreset();
});

// 武器の「個体差」を超える編集をしたらプリセットを「カスタム」へ
// (グラインド・属性%・Hit%・ヒット数は同じ武器の個体調整なのでプリセットを維持)
const weaponFieldIds = [
  "wpKind", "wpAtpMin", "wpAtpMax", "wpAta",
  "wpSpecial", "wpEff", "wpHeavyAcc", "wpHeavyDmg",
];
for (const id of weaponFieldIds) {
  $(id).addEventListener("input", () => {
    select("wpPreset").value = "custom";
    syncWeaponSearch();
  });
}
const enemyFieldIds = ["enHp", "enDfp", "enEvp", "enEdk", "enEsp", "enDifficulty", "enMachine", "enBoss"];
for (const id of enemyFieldIds) {
  $(id).addEventListener("input", () => {
    select("enPreset").value = "custom";
  });
}

// オートコンボ
$("autoComboBtn").addEventListener("click", () => {
  try {
    const inputData = readInput();
    const best = findBestCombo(
      inputData.player,
      inputData.weapon,
      inputData.enemy,
      select("cls").value,
      inputData.context,
    );
    if (!best) return;
    for (let step = 1; step <= 3; step++) {
      const type = best.attacks[step - 1] ?? "none";
      const radio = comboRadio(step, type);
      if (radio && !radio.disabled) radio.checked = true;
      input(`hits${step}`).value = "";
    }
    render();
  } catch {
    /* 入力不備時は render 側でエラー表示済み */
  }
});

// 属性% / Hit% はゲーム仕様どおり 5% 単位にスナップ
for (const id of ["wpAttr", "wpHit"]) {
  input(id).addEventListener("change", () => {
    const el = input(id);
    const max = Number(el.max || 100);
    const snapped = Math.max(0, Math.min(max, Math.round(num(id) / 5) * 5));
    if (String(snapped) !== el.value) el.value = String(snapped);
  });
}

input("shifta").addEventListener("input", () => {
  $("shiftaOut").textContent = input("shifta").value;
});
input("zalure").addEventListener("input", () => {
  $("zalureOut").textContent = input("zalure").value;
});

document.querySelector("main")!.addEventListener("input", render);
document.querySelector("main")!.addEventListener("change", render);

/* ================= 初期状態 ================= */

void (async () => {
  const restored = await restoreFromUrl();
  if (!restored) {
    applyClassPreset();
    select("wpPreset").value = "Excalibur";
    applyWeaponPreset();
    select("enPreset").value = "Bartle";
    applyEnemyPreset();
    // 終盤の標準装備 Red Ring をデフォルトに
    select("barrier").value = "Red Ring";
    // 想定Hit% の初期値は武器の Hit%
    input("lineHit").value = input("wpHit").value;
  }
  $("shiftaOut").textContent = input("shifta").value;
  $("zalureOut").textContent = input("zalure").value;
  syncWeaponSearch();
  setActiveView(activeView);
  render();
})();

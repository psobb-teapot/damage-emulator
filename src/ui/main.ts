import { requiredHitPercent } from "../accuracy.js";
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
    for (const [key] of entries) ENEMY_ORDER.set(key, order++);
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
  const types: (AttackType | "none")[] =
    step === 1 ? ["normal", "hard", "special"] : ["none", "normal", "hard", "special"];
  div.innerHTML = `
    <div class="combo-step-title">${step} 段目</div>
    <div class="combo-types">
      ${types
        .map(
          (t) => `
        <label class="combo-type t-${t}">
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
      radio.disabled = disableStep || (isSpecial && !hasSpecial);
      radio.parentElement!.classList.toggle(
        "type-disabled",
        isSpecial && !hasSpecial && !disableStep,
      );
      radio.parentElement!.title =
        isSpecial && !hasSpecial ? "この武器に特殊攻撃はありません" : "";
    }
    if (disableStep) comboRadio(step, "none")!.checked = true;
    // 特殊なし武器で S が選択されていたら H へ退避
    if (!hasSpecial && checkedCombo(step) === "special") {
      comboRadio(step, "hard")!.checked = true;
    }
    input(`hits${step}`).disabled = disableStep;
  }
}

/* ================= 入力の収集 ================= */

function readCombo(): ComboAttack[] {
  const attacks: ComboAttack[] = [];
  for (let step = 1; step <= 3; step++) {
    const type = checkedCombo(step);
    if (type === "none") break;
    const hitsRaw = input(`hits${step}`).value;
    attacks.push({
      type: type as AttackType,
      hits: hitsRaw ? Math.max(1, Math.min(10, Number(hitsRaw))) : undefined,
    });
  }
  return attacks;
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
      return { clsName, best, kill: sim.killProbability * 100 };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  rows.sort((a, b) => {
    if (b.kill !== a.kill) return b.kill - a.kill;
    if (b.best.totalDamage !== a.best.totalDamage) return b.best.totalDamage - a.best.totalDamage;
    return (a.best.frames ?? 9999) - (b.best.frames ?? 9999);
  });

  const tbody = $("classCompareRows");
  tbody.innerHTML = "";
  rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.className =
      "compare-row" + (row.clsName === select("cls").value ? " row-active" : "");
    const comboLabel = row.best.attacks.map((t) => ATTACK_LABELS[t]).join("→");
    const killClass = row.kill >= 99.95 ? "kill-hi" : row.kill <= 0.05 ? "kill-lo" : "";
    tr.innerHTML = `
      <td>${i === 0 ? "★ " : ""}${row.clsName}</td>
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

// 追加ボタン群は「複数の敵」「確定ライン」両タブに同じものがある
for (const btn of document.querySelectorAll<HTMLButtonElement>(".cmp-add-current")) {
  btn.addEventListener("click", () => {
    const key = select("enPreset").value;
    if (key !== "custom") addToCompare([key]);
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

  const hitsOf = (a: (typeof attacks)[number]): number =>
    a.hits ??
    (a.type === "special"
      ? (weapon.specialHits ?? weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind])
      : (weapon.hitsPerAttack ?? DEFAULT_HITS_PER_ATTACK[weapon.kind]));

  // ヒット数列の対象 = 最多ヒットの段 (Dark Flow の特殊5本など)
  let hitsType = attacks[0]!.type;
  let hitsStep = 1;
  let maxHits = hitsOf(attacks[0]!);
  attacks.forEach((a, i) => {
    const h = hitsOf(a);
    if (h > maxHits) {
      maxHits = h;
      hitsType = a.type;
      hitsStep = i + 1;
    }
  });

  const stepThs = attacks
    .map((a, i) => `<th>${i + 1}段目${ATTACK_LABELS[a.type]}<br><small>必要Hit%</small></th>`)
    .join("");
  const hitsThs =
    maxHits > 1
      ? Array.from(
          { length: maxHits },
          (_, i) => `<th title="最小ロール・クリなしで確定撃破できるか">${ATTACK_LABELS[hitsType]}×${i + 1}</th>`,
        ).join("")
      : `<th title="最小ロール・クリなしで確定撃破に必要なヒット数">確殺ヒット数 <small>(${ATTACK_LABELS[hitsType]})</small></th>`;
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
      requiredHitPercent(player, weapon, enemy, a.type, (i + 1) as 1 | 2 | 3, ctx),
    );
    const reqCells = reqs
      .map((req) => {
        if (!Number.isFinite(req) || req > maxHitCap) {
          return `<td class="num req-imp" title="この武器の Hit% 上限では命中100%にできない">不可</td>`;
        }
        const ok = currentHit >= req;
        return `<td class="num ${ok ? "req-ok" : "req-ng"}" title="${ok ? "想定 Hit% で達成" : `Hit% を ${req} 以上にすると命中100%`}">${req}</td>`;
      })
      .join("");

    const minDmg = damageRange(player, weapon, enemy, hitsType, ctx).min;
    const hitReq = reqs[hitsStep - 1]!;
    const accOk = Number.isFinite(hitReq) && hitReq <= maxHitCap && currentHit >= hitReq;
    let hitsCells: string;
    if (maxHits > 1) {
      hitsCells = Array.from({ length: maxHits }, (_, i) => {
        const n = i + 1;
        const dmgOk = minDmg > 0 && minDmg * n >= enemy.hp;
        if (!dmgOk) return `<td class="num hit-no" title="最小ロールではダメージ不足">×</td>`;
        if (!accOk) return `<td class="num hit-part" title="ダメージは足りるが想定Hit%では命中100%でない">△</td>`;
        return `<td class="num hit-ok" title="確定撃破 (min roll × ${n}ヒット ≥ HP・命中100%)">✓</td>`;
      }).join("");
    } else {
      const n = minHitsToKill(player, weapon, enemy, hitsType, ctx);
      hitsCells = `<td class="num">${n != null ? `${n}発` : "–"}</td>`;
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
  "hits1", "hits2", "hits3", "lineHit",
] as const;

function serializeState(): string {
  const state: Record<string, string> = {};
  for (const id of STATE_FIELDS) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    state[id] = el.type === "checkbox" ? ((el as HTMLInputElement).checked ? "1" : "0") : el.value;
  }
  for (let s = 1; s <= 3; s++) state[`combo${s}`] = checkedCombo(s);
  if (compareList.length > 0) state["cmp"] = compareList.join("|");
  if (activeView !== "detail") state["view"] = activeView;
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

function restoreState(encoded: string): boolean {
  try {
    const state = JSON.parse(decodeURIComponent(escape(atob(encoded)))) as Record<string, string>;
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
    compareList = state["cmp"] ? state["cmp"].split("|") : [];
    if (state["view"]) setActiveView(state["view"] as ViewId);
    return true;
  } catch {
    return false;
  }
}

function syncUrl(): void {
  const url = new URL(location.href);
  url.searchParams.set("s", serializeState());
  history.replaceState(null, "", url);
}

$("shareBtn").addEventListener("click", async () => {
  syncUrl();
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

    // 所要フレーム
    const fr = comboFrames(
      inputData.weapon,
      select("cls").value,
      inputData.attacks.map((a) => a.type),
    );
    $("comboFramesOut").textContent =
      fr.frames != null ? `所要フレーム: ${fr.frames}F` : "所要フレーム: データなし";

    // タブごとの表示
    const listCount = syncCompareListState();
    if (activeView === "enemies" && listCount > 0) renderEnemiesView(inputData);
    if (activeView === "line") renderLineView(inputData);
    if (activeView === "classes") renderClassCompare(inputData);
    syncUrl();
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
  render();
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

input("shifta").addEventListener("input", () => {
  $("shiftaOut").textContent = input("shifta").value;
});
input("zalure").addEventListener("input", () => {
  $("zalureOut").textContent = input("zalure").value;
});

document.querySelector("main")!.addEventListener("input", render);
document.querySelector("main")!.addEventListener("change", render);

/* ================= 初期状態 ================= */

const params = new URLSearchParams(location.search);
const restored = params.has("s") && restoreState(params.get("s")!);
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
setActiveView(activeView);
render();

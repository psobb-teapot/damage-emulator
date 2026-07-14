import { simulateCombo } from "../combo.js";
import { BARRIERS, FRAMES } from "../data/armor.gen.js";
import { CLASSES } from "../data/classes.js";
import { ENEMIES } from "../data/enemies.js";
import { SPECIALS } from "../data/specials.js";
import { WEAPONS } from "../data/weapons.js";
import { DEFAULT_HITS_PER_ATTACK } from "../constants.js";
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
  dagger: "ダガー (2ヒット)",
  partisan: "パルチザン",
  slicer: "スライサー",
  katana: "カタナ",
  twinSword: "ツインソード (2ヒット)",
  doubleSaber: "ダブルセイバー (2ヒット)",
  claw: "クロー",
  fist: "ナックル (2ヒット)",
  handgun: "ハンドガン",
  rifle: "ライフル",
  mechgun: "マシンガン (3ヒット)",
  shot: "ショット",
  launcher: "ランチャー",
  card: "カード",
  cane: "ケイン",
  rod: "ロッド",
  wand: "ワンド",
};

const ATTACK_LABELS: Record<AttackType, string> = {
  normal: "N",
  hard: "H",
  special: "S",
};

/* ---------- セレクトの初期化 ---------- */

function fillSelect(el: HTMLSelectElement, entries: [string, string][]): void {
  el.innerHTML = "";
  for (const [value, label] of entries) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    el.appendChild(opt);
  }
}

/** optgroup 付きセレクト。groups: グループ名 → [value, label][] */
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

// 武器: 種別ごとにグループ化
{
  const groups = new Map<string, [string, string][]>();
  for (const kind of Object.keys(WEAPON_KIND_LABELS) as WeaponKind[]) {
    groups.set(WEAPON_KIND_LABELS[kind].replace(/ \(.*\)$/, ""), []);
  }
  for (const [key, w] of Object.entries(WEAPONS)) {
    const label = WEAPON_KIND_LABELS[w.kind].replace(/ \(.*\)$/, "");
    groups.get(label)!.push([key, `${key}${w.special ? ` [${typeof w.special === "string" ? w.special : w.special.name}]` : ""}`]);
  }
  for (const [k, v] of groups) if (v.length === 0) groups.delete(k);
  fillGroupedSelect(select("wpPreset"), [["custom", "カスタム"]], groups);
}

fillSelect(
  select("wpKind"),
  (Object.keys(WEAPON_KIND_LABELS) as WeaponKind[]).map((k) => [k, WEAPON_KIND_LABELS[k]]),
);

fillSelect(select("wpSpecial"), [
  ["", "なし"],
  ...Object.keys(SPECIALS).map((k): [string, string] => [k, k]),
]);

// 敵: エピソード+エリアごとにグループ化
{
  const groups = new Map<string, [string, string][]>();
  for (const [key, e] of Object.entries(ENEMIES)) {
    const label = `Ep${e.episode} ${e.location ?? "?"}`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push([key, key]);
  }
  fillGroupedSelect(select("enPreset"), [["custom", "カスタム"]], groups);
}

const noneFirst = (keys: string[]) => ["None", ...keys.filter((k) => k !== "None").sort()];
fillSelect(select("frame"), noneFirst(Object.keys(FRAMES)).map((k) => [k, k]));
fillSelect(select("barrier"), noneFirst(Object.keys(BARRIERS)).map((k) => [k, k]));

/* ---------- コンボビルダー ---------- */

const comboSteps = $("comboSteps");
const STEP_DEFAULTS: (AttackType | "none")[] = ["hard", "hard", "special"];

for (let step = 1; step <= 3; step++) {
  const div = document.createElement("div");
  div.className = "combo-step";
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

/* ---------- プリセット反映 ---------- */

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
  // グラインドは上限値をデフォルトに (最大強化前提)
  input("wpGrind").value = String(preset.grind ?? preset.maxGrind ?? 0);
  input("wpGrind").max = String(preset.maxGrind ?? 250);
  input("wpAttr").value = String(preset.attributePercent ?? 0);
  input("wpAttr").max = String(preset.maxAttributePercent ?? 100);
  input("wpHit").value = String(preset.hitPercent ?? 0);
  input("wpHit").max = String(preset.maxHitPercent ?? 100);
  input("wpHits").value = preset.hitsPerAttack != null ? String(preset.hitsPerAttack) : "";
  select("wpSpecial").value =
    typeof preset.special === "string" ? preset.special : (preset.special?.name ?? "");
  select("wpEff").value = String(preset.specialEffectiveness ?? 1);
  input("wpHeavyAcc").checked = preset.specialUsesHeavyAccuracy ?? false;
  input("wpHeavyDmg").checked = preset.specialUsesHeavyDamage ?? false;
}

function applyEnemyPreset(): void {
  const preset = ENEMIES[select("enPreset").value];
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

/* ---------- 入力の収集 ---------- */

function readCombo(): ComboAttack[] {
  const attacks: ComboAttack[] = [];
  for (let step = 1; step <= 3; step++) {
    const checked = document.querySelector<HTMLInputElement>(`input[name="combo${step}"]:checked`);
    const type = checked?.value ?? "none";
    if (type === "none") break; // 「なし」以降は打ち切り
    const hitsRaw = input(`hits${step}`).value;
    attacks.push({
      type: type as AttackType,
      hits: hitsRaw ? Math.max(1, Math.min(10, Number(hitsRaw))) : undefined,
    });
  }
  return attacks;
}

function readInput(): ComboInput {
  const cls = CLASSES[select("cls").value];
  const specialKey = select("wpSpecial").value;
  const weapon: Weapon = {
    name: select("wpPreset").value === "custom" ? "カスタム武器" : select("wpPreset").value,
    kind: select("wpKind").value as WeaponKind,
    atpMin: num("wpAtpMin"),
    atpMax: Math.max(num("wpAtpMin"), num("wpAtpMax")),
    ata: num("wpAta"),
    grind: num("wpGrind"),
    hitPercent: num("wpHit"),
    attributePercent: num("wpAttr"),
    special: specialKey || null,
    hitsPerAttack: input("wpHits").value ? num("wpHits", 1) : undefined,
    specialUsesHeavyAccuracy: input("wpHeavyAcc").checked,
    specialUsesHeavyDamage: input("wpHeavyDmg").checked,
    specialEffectiveness: Number(select("wpEff").value),
  };

  const frame = FRAMES[select("frame").value] ?? { atp: 0, ata: 0 };
  const barrier = BARRIERS[select("barrier").value] ?? { atp: 0, ata: 0 };

  return {
    player: {
      baseAtp: num("baseAtp"),
      baseAta: num("baseAta"),
      lck: num("lck"),
      classCategory: cls?.category ?? "hunter",
      isAndroid: cls?.isAndroid ?? false,
      armorAtp: frame.atp + barrier.atp + num("armorAtp"),
      armorAta: frame.ata + barrier.ata + num("armorAta"),
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
      distance: num("ctxDistance"),
      includeCriticals: input("ctxCrits").checked,
    },
  };
}

/* ---------- 結果の描画 ---------- */

const fmt = (v: number): string => v.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

function render(): void {
  const errorBox = $("resultError");
  errorBox.hidden = true;

  let inputData: ComboInput;
  try {
    inputData = readInput();
    if (inputData.attacks.length === 0) {
      throw new Error("コンボを 1 段以上指定してください。");
    }
    const result = simulateCombo(inputData);
    const enemyHp = inputData.enemy.hp;

    // --- HPバー: 各ヒットの平均ダメージを積み上げ、不透明度=命中率 ---
    const bar = $("hpbar");
    bar.innerHTML = "";
    let consumed = 0;
    for (const hit of result.hits) {
      if (consumed >= enemyHp) break;
      const isHpCut = hit.special?.category === "hpCut";
      // Demon's は「残りの期待削り」を近似表示
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

    // --- 統計 ---
    const killPct = result.killProbability * 100;
    $("statKill").textContent = `${killPct.toFixed(killPct > 99 && killPct < 100 ? 2 : 1)}%`;
    $("statKill").parentElement!.classList.toggle("kill-sure", killPct >= 99.95);
    $("statExpected").textContent = fmt(result.totals.expected);
    $("statAvg").textContent = fmt(result.totals.avg);
    $("statRemain").textContent = fmt(result.expectedRemainingHp);

    // --- ヒットテーブル ---
    const rows = $("hitRows");
    rows.innerHTML = "";
    for (const hit of result.hits) {
      const tr = document.createElement("tr");
      const label = ATTACK_LABELS[hit.attackType];
      const multi = (inputData.attacks[hit.comboStep - 1]?.hits ??
        inputData.weapon.hitsPerAttack ??
        DEFAULT_HITS_PER_ATTACK[inputData.weapon.kind]) > 1;
      tr.innerHTML = `
        <td class="num">${hit.comboStep}${multi ? `-${hit.hitIndex}` : ""}</td>
        <td class="num t-${hit.attackType}">${label}</td>
        <td class="num">${hit.accuracy.toFixed(1)}%</td>
        <td><span class="num dmg-avg">${fmt(hit.damage.avg)}</span>
            <span class="dmg-range">${fmt(hit.damage.min)}–${fmt(hit.damage.max)}</span></td>
        <td class="num">${fmt(hit.expectedDamage)}</td>
      `;
      rows.appendChild(tr);
    }

    // --- 特殊・コスト ---
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
  } catch (e) {
    errorBox.hidden = false;
    errorBox.textContent = e instanceof Error ? e.message : String(e);
  }
}

/* ---------- イベント配線 ---------- */

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

// 武器・敵の個別フィールドを編集したらプリセットを「カスタム」へ
const weaponFieldIds = [
  "wpKind", "wpAtpMin", "wpAtpMax", "wpAta", "wpGrind", "wpAttr", "wpHit",
  "wpHits", "wpSpecial", "wpEff", "wpHeavyAcc", "wpHeavyDmg",
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

input("shifta").addEventListener("input", () => {
  $("shiftaOut").textContent = input("shifta").value;
});
input("zalure").addEventListener("input", () => {
  $("zalureOut").textContent = input("zalure").value;
});

document.querySelector("main")!.addEventListener("input", render);
document.querySelector("main")!.addEventListener("change", render);

/* ---------- 初期状態 ---------- */

applyClassPreset();
select("wpPreset").value = "Excalibur";
applyWeaponPreset();
select("enPreset").value = "Bartle";
applyEnemyPreset();
render();

/**
 * wiki.pioneer2.net の MediaWiki API から全武器の装備可能クラス
 * (infobox の |class= 12ビットフラグ) を取得して
 * data/raw/weapon-classes.json に保存する。
 *
 * ビット順は PSO 標準のクラス順:
 * HUmar, HUnewearl, HUcast, HUcaseal, RAmar, RAmarl, RAcast, RAcaseal,
 * FOmar, FOmarl, FOnewm, FOnewearl
 *
 * 実行: node tools/fetch-weapon-classes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const weapons = JSON.parse(readFileSync(join(root, "data/raw/weapons.json"), "utf8"));

// wiki ページ名が武器キーと異なるものの対応表
const TITLE_OVERRIDES = {
  "Flowen's Sword (3084)": "Flowen's Sword",
};

const keys = Object.keys(weapons).filter((k) => k !== "Unarmed");
const titleOf = (key) => TITLE_OVERRIDES[key] ?? key;

async function fetchBatch(titles) {
  const url =
    "https://wiki.pioneer2.net/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&redirects=1&titles=" +
    encodeURIComponent(titles.join("|"));
  const res = await fetch(url, { headers: { "User-Agent": "pso-damage-emulator data fetch" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const result = {};
const misses = [];

for (let i = 0; i < keys.length; i += 40) {
  const batch = keys.slice(i, i + 40);
  const data = await fetchBatch(batch.map(titleOf));
  // リダイレクト・正規化を逆引き
  const titleToKey = new Map(batch.map((k) => [titleOf(k), k]));
  for (const n of data.query.normalized ?? []) {
    const key = titleToKey.get(n.from);
    if (key) {
      titleToKey.delete(n.from);
      titleToKey.set(n.to, key);
    }
  }
  for (const r of data.query.redirects ?? []) {
    const key = titleToKey.get(r.from);
    if (key) {
      titleToKey.delete(r.from);
      titleToKey.set(r.to, key);
    }
  }
  for (const page of Object.values(data.query.pages)) {
    const key = titleToKey.get(page.title);
    if (!key) continue;
    const content = page.revisions?.[0]?.slots?.main?.["*"];
    const m = content?.match(/\|\s*class\s*=\s*([01]{12})/);
    if (m) result[key] = m[1];
    else misses.push(key);
  }
  console.log(`fetched ${Math.min(i + 40, keys.length)}/${keys.length}`);
}

console.log("with class bits:", Object.keys(result).length);
console.log("misses:", misses.join(", ") || "(none)");

writeFileSync(
  join(root, "data/raw/weapon-classes.json"),
  JSON.stringify({ classOrder: [
    "HUmar", "HUnewearl", "HUcast", "HUcaseal",
    "RAmar", "RAmarl", "RAcast", "RAcaseal",
    "FOmar", "FOmarl", "FOnewm", "FOnewearl",
  ], bits: result, misses }, null, 1),
);

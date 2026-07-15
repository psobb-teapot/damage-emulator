import type { Enemy } from "../types.js";
import { ALL_ENEMIES, ALL_ENEMIES_ONE_PERSON } from "./enemies.gen.js";

/**
 * 全敵データ (Ultimate 難易度・マルチプレイ時の値)。
 * psostats.com/combo-calculator 由来のスナップショット。
 * 再生成: node tools/generate-data.mjs
 *
 * Ultimate 以外の難易度は Enemy 型で自由に定義して渡せる
 * (ステータスは wiki.pioneer2.net の各敵ページを参照)。
 */
export const ENEMIES: Record<string, Enemy> = ALL_ENEMIES;

/**
 * 一人用モード (One-person mode) の敵ステータス。
 * マルチプレイより HP/DFP/EVP 等が低い。
 * データ出典: psostats.com/combo-calculator/opm
 */
export const ENEMIES_ONE_PERSON: Record<string, Enemy> = ALL_ENEMIES_ONE_PERSON;

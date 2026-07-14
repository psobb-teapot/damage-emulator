import type { ClassCategory } from "../types.js";

/**
 * 各クラスの Lv200 基本ステータス (マテリアル・マグなし)。
 * 出典: https://wiki.pioneer2.net/w/<クラス名> (2026-07-15 取得)
 * max はマテリアル等による上限値。ATA の小数は wiki 記載のまま。
 */
export interface ClassStats {
  category: ClassCategory;
  isAndroid: boolean;
  lv200: { hp: number; tp: number; atp: number; dfp: number; mst: number; ata: number; evp: number };
  max: { hp: number; tp: number; atp: number; dfp: number; mst: number; ata: number; evp: number };
}

export const CLASSES: Record<string, ClassStats> = {
  HUmar: {
    category: "hunter",
    isAndroid: false,
    lv200: { hp: 1420, tp: 793, atp: 943, dfp: 422, mst: 594, ata: 174.8, evp: 682 },
    max: { hp: 1670, tp: 1181, atp: 1397, dfp: 579, mst: 732, ata: 200, evp: 756 },
  },
  HUnewearl: {
    category: "hunter",
    isAndroid: false,
    lv200: { hp: 1308, tp: 1084, atp: 835, dfp: 538, mst: 885, ata: 147.9, evp: 666 },
    max: { hp: 1558, tp: 1626, atp: 1237, dfp: 589, mst: 1177, ata: 199, evp: 811 },
  },
  HUcast: {
    category: "hunter",
    isAndroid: true,
    lv200: { hp: 1762, tp: 0, atp: 1146, dfp: 501, mst: 0, ata: 158.7, evp: 585 },
    max: { hp: 2012, tp: 0, atp: 1639, dfp: 601, mst: 0, ata: 191, evp: 660 },
  },
  HUcaseal: {
    category: "hunter",
    isAndroid: true,
    lv200: { hp: 1380, tp: 0, atp: 901, dfp: 399, mst: 0, ata: 184.9, evp: 777 },
    max: { hp: 1630, tp: 0, atp: 1301, dfp: 525, mst: 0, ata: 218, evp: 877 },
  },
  RAmar: {
    category: "ranger",
    isAndroid: false,
    lv200: { hp: 1520, tp: 704, atp: 806, dfp: 359, mst: 505, ata: 230.3, evp: 639 },
    max: { hp: 1770, tp: 1114, atp: 1260, dfp: 515, mst: 665, ata: 249, evp: 715 },
  },
  RAmarl: {
    category: "ranger",
    isAndroid: false,
    lv200: { hp: 1315, tp: 931, atp: 743, dfp: 426, mst: 732, ata: 216.7, evp: 798 },
    max: { hp: 1565, tp: 1480, atp: 1145, dfp: 577, mst: 1031, ata: 241, evp: 900 },
  },
  RAcast: {
    category: "ranger",
    isAndroid: true,
    lv200: { hp: 1964, tp: 0, atp: 859, dfp: 505, mst: 0, ata: 199.4, evp: 626 },
    max: { hp: 2214, tp: 0, atp: 1350, dfp: 606, mst: 0, ata: 224, evp: 699 },
  },
  RAcaseal: {
    category: "ranger",
    isAndroid: true,
    lv200: { hp: 1890, tp: 0, atp: 775, dfp: 562, mst: 0, ata: 208.2, evp: 713 },
    max: { hp: 2140, tp: 0, atp: 1175, dfp: 688, mst: 0, ata: 231, evp: 787 },
  },
  FOmar: {
    category: "force",
    isAndroid: false,
    lv200: { hp: 1175, tp: 1783, atp: 753, dfp: 321, mst: 990, ata: 138.9, evp: 551 },
    max: { hp: 1425, tp: 2558, atp: 1002, dfp: 470, mst: 1340, ata: 163, evp: 651 },
  },
  FOmarl: {
    category: "force",
    isAndroid: false,
    lv200: { hp: 1273, tp: 1699, atp: 721, dfp: 351, mst: 934, ata: 144.9, evp: 513 },
    max: { hp: 1523, tp: 2474, atp: 872, dfp: 498, mst: 1284, ata: 170, evp: 588 },
  },
  FOnewm: {
    category: "force",
    isAndroid: false,
    lv200: { hp: 1232, tp: 1945, atp: 613, dfp: 408, mst: 1098, ata: 128, evp: 531 },
    max: { hp: 1482, tp: 2798, atp: 814, dfp: 463, mst: 1500, ata: 180, evp: 679 },
  },
  FOnewearl: {
    category: "force",
    isAndroid: false,
    lv200: { hp: 1148, tp: 2098, atp: 483, dfp: 334, mst: 1200, ata: 133.6, evp: 735 },
    max: { hp: 1398, tp: 3173, atp: 583, dfp: 390, mst: 1750, ata: 186, evp: 883 },
  },
};

/** クラス名から PlayerStats のベースを作るヘルパー */
export function playerFromClass(
  className: keyof typeof CLASSES,
  options: { useMaxStats?: boolean; lck?: number; armorAtp?: number; armorAta?: number } = {},
) {
  const cls = CLASSES[className];
  if (!cls) throw new Error(`未知のクラス: ${String(className)}`);
  const stats = options.useMaxStats ? cls.max : cls.lv200;
  return {
    baseAtp: stats.atp,
    baseAta: stats.ata,
    lck: options.lck ?? 100,
    classCategory: cls.category,
    armorAtp: options.armorAtp ?? 0,
    armorAta: options.armorAta ?? 0,
    maxHp: stats.hp,
    maxTp: stats.tp,
  };
}

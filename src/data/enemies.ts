import type { Enemy } from "../types.js";

/**
 * サンプル敵データ (マルチプレイ時のステータス)。
 * 出典: https://wiki.pioneer2.net/w/<敵名> (2026-07-15 取得)
 * ここにない敵は Enemy 型で自由に定義して渡せる。
 */
export const ENEMIES: Record<string, Enemy> = {
  // --- Episode 1 Forest ---
  "Booma (Normal)": {
    name: "Booma",
    hp: 92, dfp: 0, evp: 70, edk: 10, esp: 0,
    difficulty: "normal", episode: 1,
  },
  "Bartle (Ultimate)": {
    name: "Bartle",
    hp: 2334, dfp: 600, evp: 593, edk: 70, esp: 17,
    difficulty: "ultimate", episode: 1,
  },
  "Hildebear (Normal)": {
    name: "Hildebear",
    hp: 320, dfp: 30, evp: 30, edk: 28, esp: 25,
    difficulty: "normal", episode: 1,
  },
  "Hildelt (Ultimate)": {
    name: "Hildelt",
    hp: 2850, dfp: 676, evp: 477, edk: 98, esp: 60,
    difficulty: "ultimate", episode: 1,
  },

  // --- Episode 1 Ruins ---
  "Delsaber (Normal)": {
    name: "Delsaber",
    hp: 590, dfp: 80, evp: 200, edk: 35, esp: 15,
    difficulty: "normal", episode: 1,
  },
  "Delsaber (Ultimate)": {
    name: "Delsaber",
    hp: 3450, dfp: 802, evp: 970, edk: 107, esp: 45,
    difficulty: "ultimate", episode: 1,
  },

  // --- Episode 2 ---
  "Hildelt (Ultimate, Ep2)": {
    name: "Hildelt",
    hp: 2926, dfp: 600, evp: 510, edk: 79, esp: 50,
    difficulty: "ultimate", episode: 2,
  },
  "Delsaber (Ultimate, Ep2)": {
    name: "Delsaber",
    hp: 3296, dfp: 707, evp: 888, edk: 60, esp: 40,
    difficulty: "ultimate", episode: 2,
  },
};

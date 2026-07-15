import { defineConfig } from "vite";

// ブラウザ用の単一ファイルバンドル (IIFE)。
// 外部サイト (Rappy Runs 等) が <script> 1 本で読み込み、
// グローバル PsoDamage から計算 API とデータテーブルを使うための出力。
export default defineConfig({
  build: {
    outDir: "dist-bundle",
    lib: {
      entry: "src/index.ts",
      name: "PsoDamage",
      formats: ["iife"],
      fileName: () => "pso-damage-emulator.js",
    },
  },
});

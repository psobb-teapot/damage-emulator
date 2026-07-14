/**
 * psostats の combo_calc3.js からアニメーションフレーム表と
 * POSS対象武器リストを抽出して data/raw/animation-frames.json に保存する。
 * 使い方: node tools/extract-frames.cjs <combo_calc3.js のパス>
 */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(process.argv[2], "utf8");

function grabObject(name) {
  const re = new RegExp("const " + name + " = (\\{[\\s\\S]*?\\n\\})");
  const m = src.match(re);
  if (!m) throw new Error(name + " not found");
  // eslint-disable-next-line no-eval
  return eval("(" + m[1] + ")");
}

const frameData = grabObject("frameData");
const femaleFrameData = grabObject("femaleFrameData");
const classSpecificFrameData = grabObject("classSpecificFrameData");
const possMatch = src.match(/const possWeapons = (\[[\s\S]*?\])/);
// eslint-disable-next-line no-eval
const possWeapons = eval(possMatch[1]);

const out = { frameData, femaleFrameData, classSpecificFrameData, possWeapons };
fs.writeFileSync(
  path.join(__dirname, "../data/raw/animation-frames.json"),
  JSON.stringify(out, null, 1),
);
console.log(
  "frameData:", Object.keys(frameData).length,
  "female:", Object.keys(femaleFrameData).length,
  "classSpecific:", Object.keys(classSpecificFrameData).join(","),
  "poss:", possWeapons.length,
);

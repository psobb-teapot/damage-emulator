export * from "./types.js";
export * from "./constants.js";
export { atpRange, effectiveAtp, effectiveDfp, effectiveEvp, totalAta, equipmentAtp } from "./stats.js";
export { damageRange, rawDamage, attackDamageModifier, criticalDamage } from "./damage.js";
export { hitChance, hitChanceRange, distancePenaltyApplies } from "./accuracy.js";
export { evaluateSpecial, hpCutFraction } from "./special.js";
export { simulateCombo } from "./combo.js";
export {
  equipmentBonus,
  POSS_ATA_BOOST,
  COMMANDER_BLADE_ATA,
  type PossUnit,
  type EquipmentBonus,
  type EquipmentSelection,
} from "./equipment.js";
export { comboFrames, frameDataFor, type ComboFramesResult } from "./frames.js";
export { findBestCombo, type AutoComboResult } from "./autoCombo.js";
export {
  FRAME_DATA,
  FEMALE_FRAME_DATA,
  CLASS_SPECIFIC_FRAME_DATA,
  POSS_WEAPONS,
  type AnimationFrames,
} from "./data/animation.gen.js";
export { SPECIALS, resolveSpecial } from "./data/specials.js";
export { WEAPONS, makeWeapon } from "./data/weapons.js";
export { ENEMIES } from "./data/enemies.js";
export { FRAMES, BARRIERS, type ArmorStats } from "./data/armor.gen.js";
export { CLASSES, playerFromClass, type ClassStats } from "./data/classes.js";

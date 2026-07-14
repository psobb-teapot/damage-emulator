/**
 * PSOBB コンボ/ダメージ計算エンジンの型定義。
 * 計算式の出典: https://wiki.pioneer2.net/w/Game_mechanics /
 * https://wiki.pioneer2.net/w/Special_attacks (Ephinea PSO Wiki)
 */

/** 攻撃タイプ: 通常 / 強攻撃(Heavy) / 特殊攻撃 */
export type AttackType = "normal" | "hard" | "special";

/** クラス系統。ATP のばらつき幅(Pvar)と距離ペナルティの有無に影響する */
export type ClassCategory = "hunter" | "ranger" | "force";

export type Difficulty = "normal" | "hard" | "vhard" | "ultimate";

export type WeaponKind =
  | "saber"
  | "sword"
  | "dagger"
  | "partisan"
  | "slicer"
  | "katana"
  | "twinSword"
  | "doubleSaber"
  | "claw"
  | "fist"
  | "handgun"
  | "rifle"
  | "mechgun"
  | "shot"
  | "launcher"
  | "card"
  | "cane"
  | "rod"
  | "wand";

/** 特殊攻撃のカテゴリ */
export type SpecialCategory =
  | "instantKill" // Dim/Shadow/Dark/Hell
  | "paralysis" // Bind/Hold/Seize/Arrest
  | "freeze" // Ice/Frost/Freeze/Blizzard
  | "confuse" // Panic/Riot/Havoc/Chaos
  | "shock" // (Frozen Shooter 等の固有含む状態異常一般)
  | "hpDrain" // Draw/Drain/Fill/Gush
  | "tpDrain" // Heart/Mind/Soul/Geist
  | "expSteal" // Master's/Lord's/King's
  | "hpCut" // Devil's/Demon's
  | "sacrificial" // Charge/Spirit/Berserk (+ Vjaya)
  | "elemental"; // Heat/Fire 系 (固定ダメージ、簡易対応)

export interface SpecialDefinition {
  name: string;
  category: SpecialCategory;
  /**
   * 発動率・効果量の基準値(%)。
   * instantKill/paralysis/freeze/confuse: (power - 敵EDK/ESP) が基礎発動率。
   * hpDrain/tpDrain/expSteal: 吸収割合(%)。
   * hpCut: 現在HPを削る割合(%)。
   */
  power?: number;
  /** sacrificial のダメージ倍率 (Charge/Spirit/Berserk=3.33, Vjaya=5.67) */
  damageModifier?: number;
  /** 発動率が固定の特殊 (例: Frozen Shooter の凍結 100%) */
  fixedActivation?: number;
  /** 1振りあたりのコスト表示用 (例: "Meseta 200") */
  costPerSwing?: string;
}

export interface Weapon {
  name: string;
  kind: WeaponKind;
  /** 武器 ATP の最小値・最大値 (グラインド・属性補正前) */
  atpMin: number;
  atpMax: number;
  ata: number;
  /** グラインド値 (ATP +2/grind) */
  grind?: number;
  /** 対象の敵に有効な属性値 % (0-100)。EQATP に (1 + attr/100) を乗算 */
  attributePercent?: number;
  /** 特殊攻撃名 (data/specials.ts のキー、またはカスタム定義) */
  special?: string | SpecialDefinition | null;
  /** 1回の攻撃入力あたりのヒット数 (未指定なら武器種のデフォルト) */
  hitsPerAttack?: number;
  /**
   * 特殊攻撃が Heavy 相当の命中率を持つ例外武器
   * (Dark Flow, Vjaya, Dark Meteor, Frozen Shooter, Snow Queen)
   */
  specialUsesHeavyAccuracy?: boolean;
  /** 特殊攻撃が Heavy 相当の威力を持つ例外武器 (Frozen Shooter / Snow Queen) */
  specialUsesHeavyDamage?: boolean;
  /**
   * 特殊攻撃時に発動率が減衰する武器 (剣類 50%, スライサー類 33% など)。
   * 1 = 減衰なし, 0.5, 0.33
   */
  specialEffectiveness?: 1 | 0.5 | 0.33 | number;
}

export interface PlayerStats {
  /** キャラクター自身の ATP (武器を除く。マグ・マテリアル込みのステータス画面値 − 武器ATP) */
  baseAtp: number;
  /** キャラクター自身の ATA (武器を除く) */
  baseAta: number;
  lck: number;
  classCategory?: ClassCategory;
  /** フレーム/バリア/ユニットの ATP 合計 */
  armorAtp?: number;
  /** フレーム/バリア/ユニットの ATA 合計 */
  armorAta?: number;
  /** HP吸収・TP吸収の上限計算に使用 (任意) */
  maxHp?: number;
  maxTp?: number;
}

export interface Enemy {
  name: string;
  hp: number;
  dfp: number;
  evp: number;
  /** 即死耐性 (Hell 系の発動率計算に使用) */
  edk?: number;
  /** 状態異常耐性 (凍結・麻痺・混乱の発動率計算に使用) */
  esp?: number;
  /** 機械系 (Ultimate で Devil's/Demon's の削り量が低下) */
  isMachine?: boolean;
  /** ボス (麻痺・即死などが無効) */
  isBoss?: boolean;
  difficulty?: Difficulty;
  episode?: 1 | 2 | 4;
}

/** 戦闘状況 (バフ・デバフ・ユニット・距離など) */
export interface CombatContext {
  /** シフタのテクニックレベル (0-30)。ATP +[10 + 1.3*(Lv-1)]% */
  shiftaLevel?: number;
  /** ザルアのテクニックレベル (0-30)。敵 DFP/EVP −[10 + 1.3*(Lv-1)]% */
  zalureLevel?: number;
  /** 敵が凍結中 (EVP×0.7) */
  frozen?: boolean;
  /** 敵が麻痺/ショック中 (EVP×0.85) */
  paralyzed?: boolean;
  /** 射撃武器の距離 (ペナルティ = 距離×0.33、HU/FO かつ Smartlink 無しのみ) */
  distance?: number;
  smartlink?: boolean;
  v501?: boolean;
  v502?: boolean;
  /** クリティカル (LCK/5 %, ×1.5) を期待値に含めるか。デフォルト true */
  includeCriticals?: boolean;
}

/** コンボ 1 段の指定 */
export interface ComboAttack {
  type: AttackType;
  /** この段のヒット数を上書き (未指定は武器から導出) */
  hits?: number;
}

export interface ComboInput {
  player: PlayerStats;
  weapon: Weapon;
  enemy: Enemy;
  /** コンボ列 (1〜3 段) 例: [{type:"hard"},{type:"hard"},{type:"special"}] */
  attacks: ComboAttack[];
  context?: CombatContext;
}

export interface DamageRange {
  min: number;
  avg: number;
  max: number;
}

export interface SpecialResult {
  name: string;
  category: SpecialCategory;
  /** 発動率 % (命中が前提。命中率とは別) */
  activationChance?: number;
  /** 発動時の追加効果の説明 */
  effect: string;
  /** Devil's/Demon's 発動時の削りダメージ (現在HP基準・期待値計算では動的) */
  hpCutFraction?: number;
}

export interface HitResult {
  comboStep: 1 | 2 | 3;
  attackType: AttackType;
  hitIndex: number;
  /** 命中率 % (0-100) */
  accuracy: number;
  /** クリティカル発生率 % */
  criticalChance: number;
  /** 通常ヒット時ダメージ (クリティカル抜き) */
  damage: DamageRange;
  /** クリティカル込みの平均ダメージ期待値 (1ヒットあたり、命中時) */
  avgWithCritical: number;
  /** 命中率×ダメージの期待値 */
  expectedDamage: number;
  special?: SpecialResult;
}

export interface ComboResult {
  hits: HitResult[];
  totals: {
    /** 全ヒット命中前提の最小/平均/最大合計 (Hell/Demon's の追加効果は除く) */
    min: number;
    avg: number;
    max: number;
    /** 命中率・クリティカル・Hell/Demon's を織り込んだ合計期待ダメージ */
    expected: number;
  };
  /** このコンボで敵 (enemy.hp) を倒せる確率 (0-1) */
  killProbability: number;
  /** 敵の残りHP期待値 */
  expectedRemainingHp: number;
  /** 特殊攻撃のコスト表示 (Charge のメセタ等) */
  resourceCost?: string;
}

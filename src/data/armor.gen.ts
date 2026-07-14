// このファイルは tools/generate-data.mjs により自動生成される。手で編集しないこと。
// データ出典: psostats.com/combo-calculator
export interface ArmorStats {
  atp: number;
  ata: number;
}

export const FRAMES: Record<string, ArmorStats> = {
  "Crimson Coat": { atp: 0, ata: 0 },
  "D-Parts ver1.01": { atp: 35, ata: 0 },
  "None": { atp: 0, ata: 0 },
  "Samurai Armor": { atp: 0, ata: 0 },
  "Sweetheart (1)": { atp: 0, ata: 0 },
  "Sweetheart (2)": { atp: 0, ata: 0 },
  "Sweetheart (3)": { atp: 0, ata: 0 },
  "Thirteen": { atp: 0, ata: 0 },
};

export const BARRIERS: Record<string, ArmorStats> = {
  "None": { atp: 0, ata: 0 },
  "Red Ring": { atp: 20, ata: 20 },
  "Ranger Wall": { atp: 0, ata: 20 },
  "Kasami Bracer": { atp: 35, ata: 0 },
  "Combat Gear": { atp: 35, ata: 0 },
  "Safety Heart": { atp: 0, ata: 0 },
  "S-Parts ver2.01": { atp: 0, ata: 15 },
  "Black Ring (1)": { atp: 50, ata: 0 },
  "Black Ring (2)": { atp: 100, ata: 0 },
  "Black Ring (3)": { atp: 150, ata: 0 },
};

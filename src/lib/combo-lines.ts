// Definição de quais peças (slots) cada linha de Beyblade usa.
// Espelha a lógica do BeybladeManager — usado tanto no cliente (para renderizar
// os seletores) quanto no servidor (para montar os pools e validar).

export const COMBO_LINES = ["BX", "UX", "CX", "BX_EXPAND", "UX_EXPAND", "CX_EXPAND"] as const;
export type ComboLine = (typeof COMBO_LINES)[number];

export type ComboSlot = {
  key: string;
  label: string;
  category: string; // BeyPartCategory
  lines: string[]; // BeyPartLine(s) de onde puxar as opções
};

export function slotsForLine(line: ComboLine): ComboSlot[] {
  switch (line) {
    case "BX":
    case "UX":
    case "BX_EXPAND":
      return [
        { key: "blade", label: "Blade", category: "BLADE", lines: [line] },
        { key: "ratchet", label: "Ratchet", category: "RATCHET", lines: ["RATCHET"] },
        { key: "bit", label: "Bit", category: "BIT", lines: ["BIT"] },
      ];
    case "UX_EXPAND":
      return [
        { key: "blade", label: "Blade", category: "BLADE", lines: ["UX_EXPAND"] },
        { key: "bit", label: "Bit", category: "BIT", lines: ["BIT"] },
      ];
    case "CX":
      return [
        { key: "lockChip", label: "Lock Chip", category: "LOCK_CHIP", lines: ["CX", "CX_EXPAND"] },
        { key: "metalBlade", label: "Metal Blade", category: "MAIN_BLADE", lines: ["CX"] },
        { key: "assistBlade", label: "Assist Blade", category: "ASSIST_BLADE", lines: ["CX", "CX_EXPAND"] },
        { key: "ratchet", label: "Ratchet", category: "RATCHET", lines: ["RATCHET"] },
        { key: "bit", label: "Bit", category: "BIT", lines: ["BIT"] },
      ];
    case "CX_EXPAND":
      return [
        { key: "lockChip", label: "Lock Chip", category: "LOCK_CHIP", lines: ["CX", "CX_EXPAND"] },
        { key: "overBlade", label: "Over Blade", category: "OVER_BLADE", lines: ["CX_EXPAND"] },
        { key: "metalBlade", label: "Metal Blade", category: "MAIN_BLADE", lines: ["CX_EXPAND"] },
        { key: "assistBlade", label: "Assist Blade", category: "ASSIST_BLADE", lines: ["CX", "CX_EXPAND"] },
        { key: "ratchet", label: "Ratchet", category: "RATCHET", lines: ["RATCHET"] },
        { key: "bit", label: "Bit", category: "BIT", lines: ["BIT"] },
      ];
  }
}

import { FinishType } from "@prisma/client";

export const FINISH_TYPE_POINTS: Record<FinishType, number> = {
  SPIN_FINISH: 1,
  OVER_FINISH: 2,
  BURST_FINISH: 2,
  EXTREME_FINISH: 3,
};

export const FINISH_TYPE_LABELS: Record<FinishType, string> = {
  SPIN_FINISH: "Spin Finish",
  OVER_FINISH: "Over Finish",
  BURST_FINISH: "Burst Finish",
  EXTREME_FINISH: "Extreme Finish",
};

export const FINISH_TYPE_DESCRIPTIONS: Record<FinishType, string> = {
  SPIN_FINISH: "Opponent stops spinning — 1 point",
  OVER_FINISH: "Opponent leaves the stadium — 2 points",
  BURST_FINISH: "Opponent's Beyblade bursts — 2 points",
  EXTREME_FINISH: "Extreme burst or ring-out — 3 points",
};

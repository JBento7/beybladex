// Registration rules — ONE place used by the join API, the event page, the
// tournament list and the home panel. Pure (no imports), unit-tested.
//
// Spots: every registration RECEIVED takes a spot, pending payment approval
// included (the rule the platform already applied). The capacity check runs
// inside a transaction that locks the tournament row, so two people can't
// take the last spot.
//
// Time zone: event dates are typed as local wall time (America/Sao_Paulo) and
// stored as if they were UTC (e.g. "23:59" → 23:59Z). Displays format them in
// UTC so they read as typed. For comparisons with "now" they must be turned
// back into the real instant: wall time + 3 h (Brazil has had no DST since
// 2019, so the offset is fixed).
export const LEAGUE_UTC_OFFSET_MINUTES = 180; // America/Sao_Paulo = UTC−03:00

/** Real instant of a wall-time-as-UTC date. */
export function wallTimeToInstant(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return new Date(d).getTime() + LEAGUE_UTC_OFFSET_MINUTES * 60_000;
}

export type RegistrationCode = "OPEN" | "NOT_OPEN" | "CLOSED" | "DEADLINE" | "FULL";
export const REGISTRATION_MESSAGES: Record<Exclude<RegistrationCode, "OPEN">, string> = {
  NOT_OPEN: "Inscrições ainda não abertas",
  CLOSED: "Inscrições encerradas",
  DEADLINE: "Prazo de inscrição encerrado",
  FULL: "Torneio lotado",
};

export function registrationState(input: {
  status: string;
  registrationDeadline: Date | string | null | undefined;
  maxParticipants: number | null | undefined;
  participantCount: number;
  now?: number;
}): { open: boolean; code: RegistrationCode; message: string | null; spotsLeft: number | null } {
  const now = input.now ?? Date.now();
  const spotsLeft = input.maxParticipants ? Math.max(0, input.maxParticipants - input.participantCount) : null;
  const done = (code: RegistrationCode) => ({ open: code === "OPEN", code, message: code === "OPEN" ? null : REGISTRATION_MESSAGES[code], spotsLeft });
  if (input.status === "DRAFT") return done("NOT_OPEN");
  if (input.status !== "REGISTRATION") return done("CLOSED");
  const deadline = wallTimeToInstant(input.registrationDeadline);
  // The deadline minute itself is still open; it closes right after it.
  if (deadline != null && now > deadline + 59_999) return done("DEADLINE");
  if (spotsLeft === 0) return done("FULL");
  return done("OPEN");
}

export type MyRegistration = "NONE" | "PENDING" | "APPROVED";
export function myRegistrationState(p: { approved?: boolean | null } | null | undefined): MyRegistration {
  if (!p) return "NONE";
  return p.approved === false ? "PENDING" : "APPROVED";
}
export const MY_REGISTRATION_MESSAGES: Record<Exclude<MyRegistration, "NONE">, string> = {
  PENDING: "Aguardando aprovação",
  APPROVED: "Você já está inscrito",
};

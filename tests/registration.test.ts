// Registration rule (lib/registration): status, deadline (league time zone), spots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registrationState, myRegistrationState, wallTimeToInstant } from "../src/lib/registration.ts";

// Deadline typed as 11/11/2026 23:59 (Brasília) → stored as 23:59Z.
const deadline = new Date("2026-11-11T23:59:00Z");
const at = (iso: string) => Date.parse(iso);
const base = { status: "REGISTRATION", registrationDeadline: deadline, maxParticipants: 4, participantCount: 1 };

test("before, at and after the deadline (Brasília time)", () => {
  // 23:30 in Brasília = 02:30Z next day: still open.
  assert.equal(registrationState({ ...base, now: at("2026-11-12T02:30:00Z") }).code, "OPEN");
  // 23:59:30 in Brasília: the deadline minute itself is open.
  assert.equal(registrationState({ ...base, now: at("2026-11-12T02:59:30Z") }).code, "OPEN");
  // 00:00 in Brasília: closed.
  const after = registrationState({ ...base, now: at("2026-11-12T03:00:00Z") });
  assert.equal(after.code, "DEADLINE");
  assert.equal(after.message, "Prazo de inscrição encerrado");
});

test("time zone: the old comparison closed 3 hours early", () => {
  // 21:00 in Brasília (00:00Z) — before the deadline, must be open.
  const now = at("2026-11-12T00:00:00Z");
  assert.ok(now > deadline.getTime()); // what the old code compared against
  assert.equal(registrationState({ ...base, now }).open, true);
  assert.equal(wallTimeToInstant(deadline), at("2026-11-12T02:59:00Z"));
});

test("full, closed, not open yet", () => {
  assert.deepEqual([registrationState({ ...base, participantCount: 4 }).code, registrationState({ ...base, participantCount: 4 }).message], ["FULL", "Torneio lotado"]);
  assert.equal(registrationState({ ...base, maxParticipants: null, participantCount: 999 }).code, "OPEN");
  for (const status of ["IN_PROGRESS", "FINISHED"]) assert.equal(registrationState({ ...base, status }).message, "Inscrições encerradas");
  assert.equal(registrationState({ ...base, status: "DRAFT" }).code, "NOT_OPEN");
  assert.equal(registrationState({ ...base, participantCount: 3 }).spotsLeft, 1);
});

test("my registration: pending vs approved", () => {
  assert.equal(myRegistrationState(null), "NONE");
  assert.equal(myRegistrationState({ approved: false }), "PENDING");
  assert.equal(myRegistrationState({ approved: true }), "APPROVED");
});

// Local replay rules (lib/replayCore): format detection, storage advice,
// labels, account isolation, recovery after a closed page, cleanup.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  battleId, cameraErrorMessage, cleanupPreselect, clipLabel, estimatedClipBytes, formatBytes, formatDuration, formatLabel,
  nextTake, ownClips, visibleTo, parseQuality, pickRecorderMime, recoverAction, speedLabel, storageAdvice, totalBytes,
} from "../src/lib/replayCore.ts";

test("format: first supported candidate, never a fixed format", () => {
  assert.equal(pickRecorderMime((t) => t.startsWith("video/webm")), "video/webm;codecs=vp9");
  assert.equal(pickRecorderMime((t) => t === "video/mp4"), "video/mp4");
  assert.equal(pickRecorderMime(() => false), "", "browser default");
  assert.equal(pickRecorderMime(undefined), "", "old Safari without isTypeSupported");
  assert.equal(pickRecorderMime(() => { throw new Error("x"); }), "");
  assert.equal(formatLabel("video/webm;codecs=vp8"), "WebM");
  assert.equal(formatLabel("video/mp4"), "MP4");
});

test("storage advice and sizes", () => {
  const clip = estimatedClipBytes("medium");
  assert.ok(clip > 50_000_000 && clip < 60_000_000, "3 min at 2.5 Mbps ≈ 56 MB");
  assert.equal(storageAdvice(undefined, clip), "unknown");
  assert.equal(storageAdvice({ usage: 0, quota: clip - 1 }, clip), "full");
  assert.equal(storageAdvice({ usage: 0, quota: clip * 3 }, clip), "low");
  assert.equal(storageAdvice({ usage: 0, quota: clip * 50 }, clip), "ok");
  assert.equal(formatBytes(0), "0 KB");
  assert.equal(formatBytes(1536 * 1024), "1,5 MB");
  assert.equal(formatDuration(65_400), "1:05");
  assert.equal(totalBytes([{ sizeBytes: 10 }, { sizeBytes: 5 }]), 15);
  assert.equal(parseQuality("x"), "medium");
});

test("labels, takes and battle identity", () => {
  assert.equal(clipLabel({ setNumber: 2, battle: 3, take: 1 }), "Set 2 · Batalha 3");
  assert.equal(clipLabel({ setNumber: 1, battle: 1, take: 2 }), "Set 1 · Batalha 1 (tomada 2)");
  assert.equal(battleId(1, 4), "1:4");
  const clips = [{ matchId: "m", setNumber: 1, battle: 1, take: 1 }, { matchId: "m", setNumber: 1, battle: 2, take: 1 }];
  assert.equal(nextTake(clips, "m", 1, 1), 2);
  assert.equal(nextTake(clips, "m", 1, 3), 1);
  assert.equal(nextTake(clips, "other", 1, 1), 1);
  assert.equal(speedLabel(0.25), "0,25×");
});

test("account isolation and recovery after a closed page", () => {
  const clips = [{ ownerId: "a" }, { ownerId: "b" }, { ownerId: "a" }];
  assert.equal(ownClips(clips, "a").length, 2);
  assert.deepEqual(ownClips(clips, null), [], "no account → nothing listed");
  // Tied to the account AND the device that recorded it.
  assert.equal(visibleTo({ ownerId: "a", deviceId: "d1" }, "a", "d1"), true);
  assert.equal(visibleTo({ ownerId: "a", deviceId: "d1" }, "a", "d2"), false, "same account, other device");
  assert.equal(visibleTo({ ownerId: "a", deviceId: "d1" }, "b", "d1"), false, "other account, same device");
  assert.equal(visibleTo({ ownerId: "a" }, "a", "d1"), true, "older clip without device id");
  assert.equal(recoverAction({ status: "RECORDING", chunks: 3 }), "interrupt");
  assert.equal(recoverAction({ status: "RECORDING", chunks: 0 }), "delete");
  assert.equal(recoverAction({ status: "KEPT", chunks: 3 }), "keep");
});

test("cleanup never pre-selects clips kept for review", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const day = 86_400_000;
  const clips = [
    { id: "old2", createdAt: now - 3 * day, status: "AVAILABLE" as const },
    { id: "old1", createdAt: now - 5 * day, status: "INTERRUPTED" as const },
    { id: "kept", createdAt: now - 9 * day, status: "KEPT" as const },
    { id: "new", createdAt: now - 1000, status: "AVAILABLE" as const },
  ];
  assert.deepEqual(cleanupPreselect(clips, now), ["old1", "old2"], "oldest first, kept excluded, recent excluded");
});

test("camera errors map to plain messages", () => {
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /negada/);
  assert.match(cameraErrorMessage({ name: "NotFoundError" }), /Nenhuma câmera/);
  assert.match(cameraErrorMessage({ name: "NotReadableError" }), /ocupada/);
  assert.match(cameraErrorMessage({ name: "UNSUPPORTED" }), /não permite/);
  assert.match(cameraErrorMessage({ name: "QuotaExceededError" }), /espaço/);
  assert.match(cameraErrorMessage(new Error("x")), /Não foi possível/);
});

// Placar layout choice from the page AREA (not sensors / window.screen) and
// the diagnostics text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseLayout, describeError, diagnosticsText, isLandscapeArea, parseLayoutPref } from "../src/lib/screenLayout.ts";

test("layout follows the area the browser gives the page", () => {
  assert.equal(isLandscapeArea(844, 390), true);
  assert.equal(isLandscapeArea(390, 844), false);
  assert.equal(isLandscapeArea(500, 500), false);
  assert.equal(chooseLayout("auto", true), "camera", "phone lying down → camera layout, even below desktop breakpoints");
  assert.equal(chooseLayout("auto", false), "padrao");
  assert.equal(chooseLayout("camera", false), "camera", "forced camera layout keeps its portrait version");
  assert.equal(chooseLayout("padrao", true), "padrao", "explicit choice respected");
  assert.equal(parseLayoutPref(null), "auto");
  assert.equal(parseLayoutPref("camera"), "camera");
});

test("diagnostics: technical facts only, errors named", () => {
  const t = diagnosticsText(
    { innerWidth: 390, innerHeight: 844, visualWidth: 390, visualHeight: 800, mqLandscape: false, orientationType: "portrait-primary", orientationAngle: 0, fullscreenElement: null, canFullscreen: true, canLock: false, standalone: true },
    { layout: "padrao", pref: "auto", version: "abc1234", lastError: "NotSupportedError: lock() not available", userAgent: "UA" },
  );
  assert.match(t, /390 × 844 → vertical/);
  assert.match(t, /screen.orientation.lock disponível: não/);
  assert.match(t, /standalone\): sim/);
  assert.match(t, /NotSupportedError/);
  assert.doesNotMatch(t, /token|senha|@/i);
  assert.equal(describeError({ name: "NotAllowedError", message: "denied" }), "NotAllowedError: denied");
});

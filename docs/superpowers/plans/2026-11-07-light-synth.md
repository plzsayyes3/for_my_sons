# Light Synthesizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a playable light instrument to For My Sons, with automatic and pointer emission and four physical controls.
**Architecture:** Pure bounded particle simulation consumed by a Canvas 2D UI. Standalone static assets, integrated with the existing launcher and offline shell.
**Tech Stack:** HTML, CSS, JavaScript, Node test runner.
**Spec:** docs/superpowers/specs/2026-11-07-light-synth-design.md

## Global Constraints
- No new dependencies or audio in this release.
- At most 600 particles; six-second lifespan; delta capped at 50 ms.
- Support phone/tablet/desktop, portrait/landscape and keyboard ranges.
- Reduced motion starts paused; hidden document suspends work and cancels pointers.

## Review Focus
- Long frames or invalid dt must not destabilize the simulation.
- Continuous multi-touch must not grow memory without bounds.
- Releasing a finger outside the drawing must end emission.
- Short landscape viewports must retain access to controls.
- New launcher and offline assets must resolve under the Pages subdirectory.

### Task 1: Simulation and controls
**Files:** Create light-synth/model.js, tests/light-synth.test.js.
**Interfaces:** createSimulation({random, maxParticles}) returns {particles, params, setParameter(name,value), emit(x,y,count), step(dt,{automatic,pointers}), clear()}; normalized positions, seconds.
- [x] Write tests proving automatic and touch emission, gravity, randomness, orbit, rhythm, bounded count/lifetime/delta and finite coordinates.
- [x] Run node --test tests/light-synth.test.js and verify missing simulation failure.
- [x] Implement model and run the same tests to PASS.

### Task 2: Visual instrument and integration
**Files:** Create light-synth/index.html, style.css, app.js, assets/light-synth.svg. Modify apps.json, service-worker.js.
**Interfaces:** Browser consumes window.LightSynth.createSimulation. Native ranges set normalized parameters in [0,1]. Renderer reads particle position, previous position, age, life and hue.
- [x] Implement canvas, four controls, pause/clear/auto, responsive panel, pointer cancellation and visibility suspension.
- [x] Add launcher and offline entries; test local asset references and cache integration.
- [x] Run npm test and JavaScript syntax checks.
- [x] Use managed browser preview when available to verify rendering, touch, controls, pause and narrow/landscape layout.
- [x] Review diff, commit and publish through the existing GitHub Pages workflow; verify workflow outcome.

## Verification record
- Feature model tests: 8 passing, including 30 Hz / 120 Hz density regression.
- Browser: desktop, 390×844 portrait and 844×390 landscape frames; dial drag 12→82, orbit range to 100, canvas drawing, pause, auto OFF and clear observed.
- Full suite baseline has four unrelated failures: shared database store version; generic profile ID restriction; settings display model private paths; settings renderer restore call. The same failures occur without the new test file; existing affected product files were not changed.
- Pages deployment checks: 167 passing before adding this feature test file.
- Independent review: no important bugs. Fixed fractional secondary emission so high-refresh displays retain both automatic streams; regression observed RED then GREEN.

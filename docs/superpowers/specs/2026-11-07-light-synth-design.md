# Light synthesizer — first visual release

Approved direction: automatic flowing light plus touch-created light, with gravity, rhythm, randomness and orbit controls. Add to For My Sons; sound will follow in a later change.

## Intent
A playful instrument for children: change one control and immediately see its effect. No score or instructions required to start. Dark canvas, luminous colored trails, clear Japanese controls; support phones, tablets and desktop in both orientations.

## Approaches
Touch-only makes a drawing instrument but offers no immediate animation. Automatic-only makes changing scenery but loses direct participation. Chosen hybrid combines automatic moving emitters and simultaneous touch/mouse emission. Use the repository's buildless HTML/CSS/JavaScript and Canvas 2D, with no new dependency or service.

## Behavior
- Automatic light begins on opening; pressing or dragging adds light at each active pointer.
- Four continuous controls: gravity increases downward acceleration; rhythm controls smooth pulsing emission and brightness; randomness adds irregular movement; orbit bends the velocity into a swirl.
- Pause freezes the picture, clear erases it, automatic emission can be toggled. Controls remain usable in narrow and short viewports.
- Respect reduced motion by starting paused. Suspend work while hidden and clear active pointers on interruption.
- Bound particle count, canvas resolution and simulation delta; resize safely. No audio in this release.
- Add launcher tile and offline shell entries using existing GitHub Pages publication.

Implementation choices: normalized simulation coordinates, capped 600 particles, six-second lifespan, delta capped at 50 ms. Native range inputs with decorative rotary indicators provide touch and keyboard support.

# Music Enhancement Feature Doc

## Goal

Improve the current image-to-music output so it feels musical rather than purely mechanical, while keeping the same core mapping:

- image data still determines pitch material and structure
- playback becomes more expressive through harmony, phrasing, dynamics, and effects
- repeated playback of the same image should sound related but not identical

This feature extends the current `music.js` pipeline instead of replacing it.

## Current baseline

The existing system already does a few important things well:

- maps 5 brightness-sorted clusters to the C pentatonic scale
- scans the image left-to-right in time slices
- chooses dominant and secondary notes per slice
- assigns an instrument per centroid hue
- schedules note playback with Tone.js

The main musical limitations right now are:

- every slice tends to trigger notes, creating a dense wall of sound
- note durations are uniform, so phrasing feels robotic
- velocities are mostly fixed
- timing is perfectly quantized
- harmony is implied by simultaneous clusters but not intentionally composed
- there is no bass foundation or shared spatial processing

## Feature summary

Add five musical layers on top of the current deterministic score generation:

1. Chord progression derived from image structure
2. Rest probability and note density control
3. Humanized performance with velocity and timing variation
4. Legato phrase building and passing-tone smoothing
5. Bass, reverb, delay, and filter movement for fuller arrangement

## Design principles

### Deterministic structure, stochastic performance

The image should still decide the identity of the piece:

- which scale tones are active
- which chord roots appear
- how the harmony changes over time
- which instruments represent each cluster

Randomness should only affect performance details:

- whether a slice becomes a rest
- exact velocity
- tiny timing offsets
- passing-tone insertion
- slow filter motion

This keeps the sonification legible while making each playback feel like a new performance of the same score.

### Harmony without losing the pentatonic identity

The current note mapping uses C pentatonic: `C D E G A`. The harmonic system should stay compatible with that palette instead of introducing many foreign tones.

Recommended chord vocabulary:

- `Cmaj(add6)` -> `C E G A`
- `Am7` -> `A C E G`
- `Dm11(no3)` or `Dsus2/add11` style voicing -> `D G A C`
- `Em7sus4` feel -> `E A B D` if non-pentatonic color is acceptable

For the first implementation, prefer strictly pentatonic-compatible voicings:

- `C5/6`: `C G A`
- `Am7`: `A C E G`
- `Dsus4/7`: `D G A C`
- `Em7(no5)` approximation: `E G A D`

These are harmonically soft and ambient, which suits the project.

## Proposed architecture

Split score generation into four layers:

1. `melodyEvents`: dominant cluster melody with occasional secondary support
2. `chordEvents`: slow pad chords driven by larger image regions
3. `bassEvents`: long root notes aligned to chord changes
4. `fxConfig`: shared effect settings and automation

Suggested new flow inside `music.js`:

```js
const noteInfos = assignNoteAndInstrument(centroids);
const harmonicPlan = generateHarmonicPlan(clusterResult, noteInfos);
const melodyEvents = generateExpressiveMelody(clusterResult, noteInfos, harmonicPlan);
const chordEvents = generateChordEvents(harmonicPlan, noteInfos);
const bassEvents = generateBassEvents(harmonicPlan);
const score = mergeScoreLayers({ melodyEvents, chordEvents, bassEvents });
```

## Feature details

### 1. Harmonic plan and chords

#### Objective

Turn the scan into a real progression instead of isolated note slices.

#### Strategy

Group the piece into larger harmonic windows, for example every 2-4 seconds. For each window:

- count cluster dominance across all slices in the window
- choose a chord root from the most persistent cluster
- choose a chord quality from a pentatonic-safe lookup table
- keep the chord for the full window rather than changing every slice

#### Example root mapping

Use the cluster's mapped pentatonic note as the chord root:

- cluster note `C` -> `Cmaj(add6)` style pad
- cluster note `A` -> `Am7`
- cluster note `D` -> suspended `D` chord
- cluster note `E` -> airy `Em7`-like voicing
- cluster note `G` -> `Gsus2/add6`-style voicing

#### Example chord voicings

```js
const CHORD_VOICINGS = {
  C: ["C3", "E3", "G3", "A3"],
  A: ["A2", "C3", "E3", "G3"],
  D: ["D3", "G3", "A3", "C4"],
  E: ["E3", "G3", "A3", "D4"],
  G: ["G2", "A2", "D3", "E3"]
};
```

#### Scheduling

- trigger one pad chord per harmonic window
- duration equals window length with slight overlap into the next chord
- keep chord velocities low to medium so the melody remains readable

#### Why this helps

The piece gains a clear harmonic floor, and the melody sounds like it belongs to a progression rather than floating independently.

### 2. Rest probability and density control

#### Objective

Create breathing room.

#### Strategy

Do not force every slice to produce a melody note. For each slice:

- compute dominant cluster fraction
- convert that fraction into a play probability
- skip the slice if the probability test fails

Suggested rule:

- dominant fraction `>= 0.75` -> always play
- dominant fraction `0.55 - 0.74` -> 70-85% chance
- dominant fraction `< 0.55` -> 35-60% chance

Secondary notes should be even sparser:

- only allow them when they exceed the current `10%` threshold
- cap the number of secondary notes per slice to `1`

#### Why this helps

Silence becomes part of the composition and the remaining notes feel intentional.

### 3. Velocity variation

#### Objective

Avoid flat dynamics.

#### Strategy

Start from cluster dominance, then add small random variation:

```js
const dynamicBase = isDominant ? 0.65 + fraction * 0.25 : 0.25 + fraction * 0.2;
const velocity = dynamicBase * (0.85 + Math.random() * 0.25);
```

Additional option:

- quieter events in darker or less saturated regions
- stronger attacks for highly saturated, high-contrast clusters

#### Why this helps

The same note repeated over time feels performed rather than copied.

### 4. Humanized timing

#### Objective

Keep the rhythmic grid but remove machine-perfect playback.

#### Strategy

Continue quantizing to slice positions, then add a small random offset per note:

- melody: `±20ms`
- secondary notes: `±12ms`
- pad chords: `±30ms`, usually slightly late for softness
- bass: `±10ms`

Implementation shape:

```js
const humanize = (ms) => (Math.random() * 2 - 1) * ms / 1000;
const scheduledTime = evt.time + humanize(20);
```

#### Why this helps

Microtiming makes the playback feel less synthetic without changing the compositional structure.

### 5. Legato and duration variation

#### Objective

Give the melody phrasing.

#### Strategy

Merge adjacent slices into longer notes when:

- the same cluster remains dominant
- the mapped note name stays the same
- the rest gate does not suppress the continuation

Rules:

- repeated notes should extend duration instead of retriggering
- note durations can vary between `1x` and `4x` slice length
- melody releases can overlap slightly with the next chord change

#### Why this helps

Sustained notes read as phrases instead of repeated impulses.

### 6. Pentatonic passing tones for large leaps

#### Objective

Smooth out abrupt melodic jumps caused by raw image changes.

#### Strategy

If consecutive melody notes are separated by more than a fifth or by more than 7 semitones:

- find pentatonic notes between the two endpoints
- randomly insert one short passing tone before the destination note
- keep the passing tone quiet and brief

Example:

- `C3 -> A5` can become `C3 -> E4 -> A5`

#### Why this helps

The melody sounds more composed and less like discontinuous data jumps.

### 7. Bass line

#### Objective

Anchor the harmony.

#### Strategy

For each chord window:

- play the chord root one or two octaves lower
- use a simple sine or rounded triangle synth
- one sustained note per chord change

Suggested examples:

```js
C chord -> C1 or C2
A chord -> A1
D chord -> D2
```

#### Why this helps

This is one of the cheapest changes with the biggest perceived gain in warmth and fullness.

### 8. Shared reverb and delay

#### Objective

Glue all parts into one acoustic space.

#### Strategy

Add a shared effect bus:

- `Tone.Reverb({ decay: 2.5 to 4, wet: 0.25 to 0.35 })`
- `Tone.FeedbackDelay("8n", 0.15 to 0.22)` for melody only

Routing:

- melody instruments -> delay -> reverb -> destination
- pad synth -> reverb -> destination
- bass -> light reverb or dry/wet around `0.1`

#### Why this helps

Without a shared space, each synth feels isolated. Reverb makes the piece feel coherent and intentional.

### 9. Dynamic filter movement

#### Objective

Add long-form timbral motion.

#### Strategy

Place a filter on the pad bus and automate it slowly:

- start darker at the beginning
- open gradually across the piece
- optionally tie the cutoff to average brightness of the current image window

Simple mapping:

```js
cutoff = map(avgWindowBrightness, 0, 255, 400, 3200);
```

#### Why this helps

The arrangement develops over time instead of staying timbrally flat.

## Data mappings

### Existing mappings to preserve

- centroid brightness -> pentatonic scale rank
- centroid hue/saturation -> instrument family
- left-to-right position -> musical time

### New mappings to add

- dominant cluster persistence across larger windows -> chord root
- slice dominance strength -> melody play probability
- cluster dominance and saturation -> note velocity
- regional brightness -> pad filter cutoff and optional octave lift
- harmonic window boundaries -> bass change points

## Implementation plan

### Phase 1: high-payoff improvements

1. Add shared reverb bus
2. Add melody rest probability
3. Add velocity variation
4. Add bass notes from chord roots
5. Merge repeated melody notes into longer durations

This phase should already move the output from sonification toward music.

### Phase 2: harmony and performance

1. Build `generateHarmonicPlan()`
2. Add pad chord scheduling
3. Add humanized timing offsets
4. Add passing tones for large leaps
5. Add filter automation on the pad bus

### Phase 3: polish and tuning

1. Tune probabilities and velocity ranges by ear
2. Adjust chord voicings to avoid muddiness
3. Balance melody vs pad vs bass volume
4. Expose a small set of UI controls if needed

## Suggested code changes

### `music.js`

Add or revise functions:

- `createEffects()`
- `createChordInstrument()`
- `createBassInstrument()`
- `generateHarmonicPlan(clusterResult, noteInfos)`
- `generateExpressiveMelody(clusterResult, noteInfos, harmonicPlan)`
- `mergeLegatoNotes(events)`
- `insertPassingTone(prevEvent, nextEvent)`
- `generateChordEvents(harmonicPlan)`
- `generateBassEvents(harmonicPlan)`
- `scheduleLayeredPlayback(score, onComplete)`

### Score shape

Move from a flat event list toward a layered structure:

```js
{
  melodyEvents: [...],
  chordEvents: [...],
  bassEvents: [...],
  totalDuration,
  sliceDuration,
  harmonicWindows: [...]
}
```

This makes the piano-roll view and future mixing controls easier to extend.

## UI and visualization updates

Panel 2 should reflect the new arrangement:

- melody notes remain colored by cluster
- chords appear as longer, wider horizontal stacks in the piano roll
- bass appears in the lower register as sustained bars
- optional legend shows `melody / chords / bass`

Optional UI controls:

- `Density`
- `Humanize`
- `Reverb`
- `Harmony speed`

These can be added later if the deadline is tight.

## Success criteria

The feature is successful if:

- the piece contains audible rests and phrasing
- harmony is clearly present through sustained chords
- bass supports each harmonic region
- repeated playback of the same image varies slightly in feel
- the output still sounds traceable to the image rather than fully generative

## Risks and mitigations

### Risk: too many simultaneous notes

Mitigation:

- cap secondaries to one per slice
- keep pad velocities low
- use sparse chord voicings

### Risk: muddy harmony in low registers

Mitigation:

- keep pad chords in mid register
- reserve the lowest octave mostly for bass

### Risk: randomness obscures the image mapping

Mitigation:

- randomize only performance, not structure
- keep chord roots and note identities deterministic

## Recommended default parameters

```js
const PLAY_PROBABILITY_BASE = 0.65;
const SECONDARY_THRESHOLD = 0.10;
const MAX_SECONDARIES_PER_SLICE = 1;
const HUMANIZE_MS = 20;
const REVERB_DECAY = 3.0;
const REVERB_WET = 0.3;
const DELAY_FEEDBACK = 0.18;
const HARMONIC_WINDOW_SECONDS = 3;
const MELODY_MAX_MERGE_SLICES = 4;
```

## Short rationale for the assignment writeup

This feature strengthens the conceptual loop of the project. The image still determines the musical material, but the playback now introduces controlled performance variability, making the output feel less like raw data translation and more like an interpretation. That tension between deterministic visual analysis and stochastic musical expression is central to the piece: the same image produces the same underlying score, but never exactly the same performance.

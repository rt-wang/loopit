# Synesthetic Loop: Image → Music → AI → Image

## Project overview

A p5.js application that transforms an image into music using k-means clustering, plays the result, captures a spectrogram, sends it to a multimodal LLM, and renders a new image from the LLM's description. The goal is to put pixel-based image making in conversation with AI — exploring how visual information mutates when passed through non-visual media and back.

## Project structure

```
synesthetic-loop/
├── index.html            # Single HTML entry point, loads p5 + Tone.js from CDN
├── sketch.js             # Main p5.js sketch — all visualization and audio logic
├── kmeans.js             # K-means clustering algorithm (operates on pixel arrays)
├── music.js              # Note mapping, instrument assignment, playback via Tone.js
├── spectrogram.js        # Real-time spectrogram capture using p5.sound FFT
├── renderer.js           # Panel 3 — parses LLM description into drawn output
├── server.js             # Minimal Express server — proxies LLM API calls
├── package.json          # Only dependencies: express, node-fetch (or built-in fetch)
├── .env                  # API key storage (ANTHROPIC_API_KEY or GOOGLE_API_KEY)
└── assets/
    └── source.jpg        # Default input image (user can also drag-drop)
```

## Tech stack

- **p5.js 1.9+** — loaded via CDN `<script>` tag in index.html, NOT npm
- **Tone.js 14+** — loaded via CDN, handles instrument synthesis
- **p5.sound** — loaded via CDN (the p5.sound addon), handles FFT/waveform analysis
- **Node.js + Express** — tiny local server (server.js) that proxies API calls to avoid CORS and exposing keys in the browser
- **Multimodal LLM** — Claude (vision, via Anthropic API) or Gemini (audio-native, via Google API). The server handles the call. Prefer Claude with a spectrogram image as input.

### CDN links for index.html

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/addons/p5.sound.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js"></script>
```

## Detailed design

### Panel 1: K-means pixel clustering + pentatonic assignment

#### K-means algorithm (kmeans.js)

- Input: flat pixel array from `loadPixels()` (RGBA values), k=5 (matching pentatonic scale)
- Operate in RGB space (ignore alpha)
- Initialize centroids via k-means++ (pick first centroid randomly, each subsequent centroid chosen with probability proportional to squared distance from nearest existing centroid)
- Run iterative assignment + update until convergence (max 20 iterations or centroid shift < 1.0)
- Output: array of 5 centroid RGB values, and a cluster label (0–4) for every pixel

#### Note + instrument assignment

After clustering, sort the 5 centroids by brightness (perceived luminance = 0.299*R + 0.587*G + 0.114*B), darkest first. Map them to the C pentatonic scale across octaves:

| Centroid rank (by brightness) | Note  | Octave range | Instrument selection logic            |
|-------------------------------|-------|-------------|---------------------------------------|
| 0 (darkest)                   | C     | 2–3         | Low register — see hue mapping below  |
| 1                             | D     | 3–4         | Low-mid register                      |
| 2                             | E     | 4           | Mid register                          |
| 3                             | G     | 4–5         | Mid-high register                     |
| 4 (brightest)                 | A     | 5–6         | High register                         |

**Instrument assignment by hue** — compute the hue (0–360) of each centroid's RGB:

| Hue range       | Instrument (Tone.js synth)                        |
|-----------------|---------------------------------------------------|
| 0–60 (red/orange)   | `Tone.FMSynth` — warm, brass-like              |
| 60–150 (yellow/green) | `Tone.PluckSynth` — plucked, marimba-like     |
| 150–250 (cyan/blue)  | `Tone.AMSynth` — cool, bell/woodwind-like      |
| 250–330 (purple/pink) | `Tone.Synth` with triangle wave — pad/string   |
| 330–360 (red again)   | `Tone.FMSynth`                                 |
| Saturation < 15% (gray/neutral) | `Tone.NoiseSynth` — percussion          |

#### Panel 1 visualization

The canvas for panel 1 should be the same dimensions as the source image (or scaled to fit max 600px width). Show two states:

1. **Before**: the original image
2. **After animation**: each pixel represented as a small dot in a 2D projection of RGB space. Animate the dots drifting from their original RGB position to their assigned centroid position. Label each centroid cluster with its note name (C3, D3, E4, G4, A5) and instrument name. Color each cluster's dots with the centroid's color.

The 2D projection: use R as x-axis, B as y-axis (simple and readable). The canvas for this scatter view can be 600x400.

Transition: user clicks a "Next" button or presses right arrow to advance to Panel 2.

### Panel 2: Musical score + waveform

#### Scan strategy (music.js)

- Scan the clustered image **left to right, column by column**
- Group columns into time slices. For a 600px wide image, group every 4 columns into one time slice = 150 time steps.
- Each time slice duration: `totalDuration / numSlices`. Let totalDuration = 15 seconds (adjustable). So each slice ≈ 100ms.
- For each time slice, count how many pixels belong to each cluster. The cluster with the most pixels in that column group is the **dominant note** — play it at full velocity. Secondary clusters (>10% of pixels in that slice) play at reduced velocity (0.3–0.5). Clusters below 10% are silent for that slice.
- This creates a polyphonic score where the "melody" follows the dominant color of each image region.

#### Octave refinement

Within each time slice, refine the octave of each note based on the **average brightness of that cluster's pixels in that specific column group** (not the global centroid brightness). This adds melodic contour — a blue region that's lighter at the top of the image will play higher than a blue region that's darker at the bottom.

Formula: `octave = baseOctave + Math.round((avgBrightness - centroidBrightness) / 64)` clamped to baseOctave ± 1.

#### Playback via Tone.js

- Create 5 instrument instances (one per cluster) at setup time
- Schedule all notes using `Tone.Transport` and `Tone.Part`
- Each note: `instrument.triggerAttackRelease(noteName, sliceDuration, time, velocity)`
- Connect all instruments to `Tone.Destination`

#### Panel 2 visualization

Split the panel vertically:

**Top half — piano roll** (600 x 200px):
- X-axis = time (left to right, 0 to totalDuration)
- Y-axis = note/octave (C2 at bottom, A6 at top)
- Each note event is a colored rectangle (color = cluster centroid color)
- Width = slice duration, height = fixed per note row
- A vertical playhead line sweeps left to right during playback
- Animate in sync with Tone.Transport position

**Bottom half — real-time waveform + spectrogram** (600 x 200px):
- Use `p5.FFT` (from p5.sound) to analyze the audio output
- Top 100px: waveform (time domain) — `fft.waveform()` drawn as a line
- Bottom 100px: spectrogram — `fft.analyze()` drawn as vertical color bands scrolling left to right. Map frequency bin amplitude to color (dark = quiet, bright = loud). Use a warm color ramp (black → deep red → orange → yellow → white).

#### Spectrogram capture

At the end of playback, capture the spectrogram canvas region as a PNG using `get(x, y, w, h)` on the p5 canvas or by keeping a separate `createGraphics()` buffer for the spectrogram. Save as base64 data URL. This is the input to the LLM.

### Server: LLM API proxy (server.js)

Minimal Express server:

```
POST /api/interpret
  Request body: { image: "<base64 PNG of spectrogram>" }
  Server action:
    - Calls Anthropic API (claude-sonnet-4-20250514) with:
      - System prompt (see below)
      - User message containing the spectrogram image
    - Returns: { description: "<LLM text response>" }
  Response: JSON with the LLM's visual description
```

#### LLM system prompt

```
You are part of a synesthetic art loop. You are being shown a spectrogram
— a visual representation of music that was generated from an image.

Your job: describe the visual scene or abstract composition you imagine
this music represents. Be specific and structured. Your response must
follow this exact format:

BACKGROUND: [describe the overall background color/gradient]
SHAPES: [list 3-8 geometric shapes with their color (as hex), position
  (as percentage x,y from top-left), size (as percentage of canvas),
  and type (circle, rectangle, triangle, ellipse)]
PARTICLES: [describe 0-3 groups of small particles — their color,
  region of the canvas they occupy, density (sparse/medium/dense),
  and movement direction if any]
MOOD: [one line describing the overall feeling]

Example:
BACKGROUND: deep navy #1a1a3e fading to black at edges
SHAPES: coral circle #e06040 at 30%,40% size 15%; pale blue rectangle
  #a0c0e0 at 60%,20% size 25%x10%; small white triangle at 50%,70% size 5%
PARTICLES: cluster of warm yellow #f0d060 dots, sparse, upper-right quadrant
MOOD: contemplative, like stars emerging at dusk
```

This structured format makes parsing deterministic in the renderer.

### Panel 3: Regenerated image (renderer.js)

#### Parsing

Parse the LLM response by splitting on the section headers (BACKGROUND, SHAPES, PARTICLES, MOOD). Use regex to extract:
- Background: hex color(s)
- Shapes: for each shape, extract type, hex color, x%, y%, size%
- Particles: color, region description, density keyword

#### Rendering

Use p5.js drawing primitives to reconstruct the image on a canvas (same dimensions as original):

1. **Background**: fill the canvas with the described color. If a gradient is described, use `lerpColor()` across the canvas.
2. **Shapes**: draw each shape at the specified position and size. Use `fill()` with the hex color, `noStroke()`. Map percentage positions to pixel coordinates.
3. **Particles**: for each particle group, scatter small ellipses (2–4px) in the described region at the described density. Sparse = 50 particles, medium = 150, dense = 400.
4. **MOOD as post-processing**: if mood contains words like "warm" apply a slight warm tint overlay; "dark" reduces brightness; "energetic" adds slight random jitter to shape positions.

#### Iteration loop

After rendering panel 3, offer a button: "Feed back into loop". This takes the panel 3 canvas as the new source image and restarts from panel 1. Track iteration count. Save each iteration's output image to display a strip of all iterations at the bottom of the page.

## UI layout

```
┌──────────────────────────────────────────────────────┐
│  SYNESTHETIC LOOP                      [iteration: 1]│
│                                                      │
│  ┌─ Panel 1 ──────────────────────────────────────┐  │
│  │  Source image → animated k-means scatter        │  │
│  │  [5 cluster labels with note + instrument]      │  │
│  └────────────────────────────────────────────────┘  │
│                    [ ▶ Play / Next → ]                │
│  ┌─ Panel 2 ──────────────────────────────────────┐  │
│  │  Piano roll (top)                               │  │
│  │  Waveform + spectrogram (bottom)                │  │
│  └────────────────────────────────────────────────┘  │
│                  [ Send to AI → ]                    │
│  ┌─ Panel 3 ──────────────────────────────────────┐  │
│  │  LLM description (text)                         │  │
│  │  Regenerated image (canvas)                     │  │
│  └────────────────────────────────────────────────┘  │
│                [ ↻ Feed back into loop ]             │
│                                                      │
│  ┌─ Iteration history ───────────────────────────┐  │
│  │  [img1] → [img2] → [img3] → ...               │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## State machine

The sketch operates as a simple state machine:

```
STATES: LOAD → CLUSTER → ANIMATE_CLUSTER → SCORE → PLAY → CAPTURE →
        SEND_TO_LLM → WAITING → RENDER_OUTPUT → DONE

Transitions:
  LOAD: user drops image or default loads → CLUSTER
  CLUSTER: k-means runs (synchronous, ~500ms) → ANIMATE_CLUSTER
  ANIMATE_CLUSTER: dots animate to centroids (2s) → user clicks Next → SCORE
  SCORE: compute all note events from clustered image → PLAY
  PLAY: Tone.js plays, piano roll + spectrogram animate → playback ends → CAPTURE
  CAPTURE: spectrogram saved as base64 PNG → user clicks "Send to AI" → SEND_TO_LLM
  SEND_TO_LLM: POST to /api/interpret → WAITING
  WAITING: show loading indicator → response received → RENDER_OUTPUT
  RENDER_OUTPUT: parse response, draw panel 3 → DONE
  DONE: show "Feed back" button → if clicked, set source image to panel 3 output,
        increment iteration counter → LOAD
```

## Running the project

```bash
# Install server dependencies
npm install

# Add your API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Start the server (serves static files + API proxy)
node server.js

# Open http://localhost:3000 in browser
```

## Key implementation notes

1. **Tone.js requires user gesture to start audio context.** The "Play" button must call `Tone.start()` before scheduling notes. Wrap in an async click handler.

2. **K-means on full-resolution images is slow.** Downsample the image to max 150x150 for clustering, then map the cluster assignments back to the full-resolution image using nearest-centroid lookup.

3. **p5.sound FFT and Tone.js coexistence.** Both use the Web Audio API. Connect Tone.js output to p5.sound's input: `p5.soundOut.setInput(Tone.getDestination())` or create an analyser node that taps Tone's output. Test this early — it's the trickiest integration point.

4. **Spectrogram buffer.** Use a separate `createGraphics(600, 200)` buffer for the spectrogram. On each draw frame during playback, compute `fft.analyze()`, draw a 1px-wide vertical strip of colored bars on the right edge of the buffer, and shift the buffer left by 1px. After playback, call `.canvas.toDataURL()` on this graphics buffer.

5. **The LLM structured response may not parse perfectly every time.** Build the parser defensively — if a section is missing, use defaults (white background, no particles, etc.). Log the raw response to console for debugging.

6. **File serving.** server.js should serve the project root as static files (`express.static('.')`) so index.html, sketch.js, etc. are all accessible at localhost:3000.

7. **Drag and drop.** In sketch.js, implement `function drop(file)` to accept dropped images. Call `loadImage(file.data, img => { sourceImage = img; state = 'CLUSTER'; })`.

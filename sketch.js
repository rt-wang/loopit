// Main p5.js sketch — state machine, visualization, and UI

const CANVAS_W = 600;
const CANVAS_H = 400;
const PIANO_ROLL_H = 200;
const SPECTRO_H = 200;
const PANEL_GAP = 20;

let state = 'LOAD';
let sourceImage = null;
let clusterResult = null;
let noteInfos = null;
let score = null;
let spectrogramData = null;
let interpretationText = '';
let imageCaption = '';
let renderedOutput = null;
let generatedImageDataUrl = '';
let iteration = 1;
let historyImages = [];
let appConfig = {
  authMode: 'user-key',
  interpretationModel: '',
  imageModel: ''
};

// Animation state
let animProgress = 0; // 0 to 1 for cluster animation
let pixelSamples = []; // Sampled pixels for scatter animation

// UI elements
let btnPlay, btnSendAI, btnRegenerate, btnFeedback;
let apiKeyInput, btnSaveApiKey, btnClearApiKey;
let authPanel;
const API_KEY_STORAGE_KEY = 'synesthetic-loop.google-ai-studio-key';
let authPromptForced = false;

function setup() {
  const canvas = createCanvas(CANVAS_W, CANVAS_H);
  canvas.parent('canvas-container');
  canvas.drop(handleFileDrop);
  textFont('Courier New');

  // Also set up drop zone
  const dropZone = select('#drop-zone');
  dropZone.drop(handleFileDrop, () => dropZone.style('border-color', '#888'));
  dropZone.dragOver(() => dropZone.style('border-color', '#aaa'));
  dropZone.dragLeave(() => dropZone.style('border-color', '#555'));

  // Create buttons
  const controls = select('#controls');
  apiKeyInput = select('#api-key-input');
  btnSaveApiKey = select('#save-api-key');
  btnClearApiKey = select('#clear-api-key');
  authPanel = select('#auth-panel');

  if (apiKeyInput) {
    apiKeyInput.value(getStoredApiKey());
  }
  if (btnSaveApiKey) btnSaveApiKey.mousePressed(saveApiKeyFromInput);
  if (btnClearApiKey) btnClearApiKey.mousePressed(clearStoredApiKey);

  btnPlay = createButton('▶ Play');
  btnPlay.parent(controls);
  btnPlay.addClass('btn');
  btnPlay.mousePressed(() => {
    console.log('Play clicked, state:', state, 'sourceImage:', !!sourceImage);
    onPlayClick();
  });

  btnSendAI = createButton('Generate Image →');
  btnSendAI.parent(controls);
  btnSendAI.addClass('btn');
  btnSendAI.mousePressed(onSendAIClick);
  btnSendAI.attribute('disabled', '');

  btnRegenerate = createButton('↻ Regenerate Image');
  btnRegenerate.parent(controls);
  btnRegenerate.addClass('btn');
  btnRegenerate.mousePressed(onRegenerateImageClick);
  btnRegenerate.attribute('disabled', '');

  btnFeedback = createButton('↻ Feed back into loop');
  btnFeedback.parent(controls);
  btnFeedback.addClass('btn');
  btnFeedback.mousePressed(onFeedbackClick);
  btnFeedback.attribute('disabled', '');

  setStatus('Drop an image or click Play to start with default');
  updateInterpretationPanel();
  refreshAuthPanel();
  loadAppConfig();

  // Try loading default image
  loadImage('assets/source.jpg', img => {
    sourceImage = img;
    setStatus('Image loaded. Click Play to begin.');
  }, () => {
    setStatus('No default image found. Drop an image to begin.');
  });
}

function draw() {
  background(17);

  switch (state) {
    case 'LOAD':
      drawLoadState();
      break;
    case 'CLUSTER':
      drawClusteringState();
      break;
    case 'ANIMATE_CLUSTER':
      drawClusterAnimation();
      break;
    case 'SCORE':
      drawScoreState();
      break;
    case 'PLAY':
      drawPlayState();
      break;
    case 'CAPTURE':
      drawCaptureState();
      break;
    case 'SEND_TO_LLM':
    case 'WAITING':
      drawWaitingState();
      break;
    case 'RENDER_OUTPUT':
      drawRenderState();
      break;
    case 'DONE':
      drawDoneState();
      break;
  }
}

// --- State drawing functions ---

function drawLoadState() {
  if (sourceImage) {
    const { w, h } = fitDimensions(sourceImage.width, sourceImage.height, CANVAS_W, CANVAS_H);
    image(sourceImage, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
  } else {
    fill(100);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(14);
    text('Drop an image to begin', CANVAS_W / 2, CANVAS_H / 2);
  }
}

function drawClusteringState() {
  fill(100);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text('Running k-means clustering...', CANVAS_W / 2, CANVAS_H / 2);
}

function drawClusterAnimation() {
  background(17);

  // Draw scatter plot: pixels animating from original RGB position to centroid
  const k = clusterResult.centroids.length;

  // Draw axes
  stroke(60);
  strokeWeight(1);
  line(40, CANVAS_H - 30, CANVAS_W - 20, CANVAS_H - 30); // x-axis (R)
  line(40, 10, 40, CANVAS_H - 30); // y-axis (B)
  fill(80);
  noStroke();
  textSize(10);
  textAlign(CENTER);
  text('R →', CANVAS_W / 2, CANVAS_H - 10);
  textAlign(CENTER);
  push();
  translate(12, CANVAS_H / 2);
  rotate(-HALF_PI);
  text('B →', 0, 0);
  pop();

  // Draw sampled pixels
  noStroke();
  for (const px of pixelSamples) {
    const centroid = clusterResult.centroids[px.label];
    // Interpolate from original RGB position to centroid position
    const curR = lerp(px.r, centroid[0], animProgress);
    const curB = lerp(px.b, centroid[2], animProgress);

    const x = map(curR, 0, 255, 50, CANVAS_W - 20);
    const y = map(curB, 0, 255, CANVAS_H - 40, 20);

    // Color lerps toward centroid color
    const cr = lerp(px.r, centroid[0], animProgress);
    const cg = lerp(px.g, centroid[1], animProgress);
    const cb = lerp(px.b, centroid[2], animProgress);

    fill(cr, cg, cb, 180);
    ellipse(x, y, 3, 3);
  }

  // Draw centroid labels
  for (let i = 0; i < k; i++) {
    const c = clusterResult.centroids[i];
    const cx = map(c[0], 0, 255, 50, CANVAS_W - 20);
    const cy = map(c[2], 0, 255, CANVAS_H - 40, 20);

    // Centroid marker
    stroke(255);
    strokeWeight(2);
    noFill();
    ellipse(cx, cy, 16, 16);

    // Label
    noStroke();
    fill(255);
    textSize(10);
    textAlign(LEFT, CENTER);
    const info = noteInfos[i];
    text(`${info.note}${info.baseOctave} ${info.instrumentName}`, cx + 12, cy);
  }

  // Advance animation
  animProgress = min(animProgress + 0.015, 1.0);

  if (animProgress >= 1.0) {
    setStatus('Clustering complete. Click Play to hear the music.');
    btnPlay.removeAttribute('disabled');
  }
}

function drawScoreState() {
  fill(100);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text('Generating musical score...', CANVAS_W / 2, CANVAS_H / 2);
}

function drawPlayState() {
  background(17);
  const pos = getPlaybackPosition();
  if (pos < 0) return;

  // Piano roll (top half)
  drawPianoRoll(pos);

  // Spectrogram + waveform (bottom half)
  updateSpectrogram(window, pos, score.totalDuration);
  drawSpectrogramToCanvas(window, 0, PIANO_ROLL_H);

  // Playhead on spectrogram
  const playX = map(pos, 0, score.totalDuration, 0, CANVAS_W);
  stroke(255, 255, 255, 150);
  strokeWeight(1);
  line(playX, PIANO_ROLL_H, playX, CANVAS_H);
}

function drawPianoRoll(playbackPos) {
  if (!score?.events?.length) return;

  const noteNames = buildNoteRange(score.events);
  const numNotes = noteNames.length;
  const rowH = PIANO_ROLL_H / numNotes;

  // Background grid
  noStroke();
  for (let i = 0; i < numNotes; i++) {
    fill(i % 2 === 0 ? 25 : 30);
    rect(0, i * rowH, CANVAS_W, rowH);
  }

  // Note labels
  fill(60);
  textSize(8);
  textAlign(RIGHT, CENTER);
  for (let i = 0; i < numNotes; i++) {
    text(noteNames[numNotes - 1 - i], 35, i * rowH + rowH / 2);
  }

  // Draw note events
  noStroke();
  for (const evt of score.events) {
    if (!evt.noteName) continue;
    const noteIdx = noteNames.indexOf(evt.noteName);
    if (noteIdx < 0) continue;

    const x = map(evt.time, 0, score.totalDuration, 40, CANVAS_W);
    const w = map(evt.duration, 0, score.totalDuration, 0, CANVAS_W - 40);
    const y = (numNotes - 1 - noteIdx) * rowH;

    if (evt.layer === 'chord') {
      fill(120, 170, 255, 120);
    } else if (evt.layer === 'bass') {
      fill(255, 190, 110, 180);
    } else {
      const c = noteInfos[evt.cluster]?.color || [220, 220, 220];
      fill(c[0], c[1], c[2], evt.isDominant ? 220 : 100);
    }
    rect(x, y + 1, Math.max(w, 2), rowH - 2, evt.layer === 'melody' ? 2 : 1);
  }

  // Playhead
  const playX = map(playbackPos, 0, score.totalDuration, 40, CANVAS_W);
  stroke(255, 80, 80);
  strokeWeight(2);
  line(playX, 0, playX, PIANO_ROLL_H);

  // Divider line
  stroke(50);
  strokeWeight(1);
  line(0, PIANO_ROLL_H, CANVAS_W, PIANO_ROLL_H);
}

function buildNoteRange(events) {
  const midiValues = events
    .map(evt => noteToMidi(evt.noteName))
    .filter(midi => midi !== null)
    .sort((a, b) => a - b);

  if (!midiValues.length) return [];

  const minMidi = Math.max(noteToMidi('C1'), midiValues[0]);
  const maxMidi = Math.min(noteToMidi('A6'), midiValues[midiValues.length - 1]);
  const noteNames = [];

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    noteNames.push(midiToNoteName(midi));
  }

  return noteNames;
}

function drawCaptureState() {
  // Show the final spectrogram
  drawSpectrogramToCanvas(window, 0, PIANO_ROLL_H);

  // Show last frame of piano roll
  drawPianoRoll(score.totalDuration);

  fill(200);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(12);
  text('Playback complete. Spectrogram captured.', CANVAS_W / 2, 14);
}

function drawWaitingState() {
  background(17);
  fill(150);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);

  // Animated dots
  const dots = '.'.repeat((frameCount % 60) < 15 ? 1 : (frameCount % 60) < 30 ? 2 : 3);
  text('Waiting for AI response' + dots, CANVAS_W / 2, CANVAS_H / 2);
}

function drawRenderState() {
  if (renderedOutput) {
    image(renderedOutput, 0, 0, CANVAS_W, CANVAS_H);
  }
}

function drawDoneState() {
  if (renderedOutput) {
    image(renderedOutput, 0, 0, CANVAS_W, CANVAS_H);
  }

  // Show image caption at bottom
  if (imageCaption) {
    fill(0, 0, 0, 150);
    noStroke();
    rect(0, CANVAS_H - 30, CANVAS_W, 30);
    fill(200);
    textSize(11);
    textAlign(CENTER, CENTER);
    text(imageCaption, CANVAS_W / 2, CANVAS_H - 15);
  }
}

// --- Button handlers ---

async function onPlayClick() {
  console.log('onPlayClick called, state:', state, 'sourceImage:', !!sourceImage);
  // Must call Tone.start() synchronously in click handler (user gesture required)
  if (typeof Tone === 'undefined') {
    setStatus('Error: Tone.js failed to load. Check browser console.');
    return;
  }
  Tone.start();

  if (!sourceImage) {
    setStatus('No image loaded. Drop an image first.');
    return;
  }

  if (state === 'LOAD' || state === 'ANIMATE_CLUSTER') {
    if (state === 'LOAD') {
      // Run clustering
      state = 'CLUSTER';
      btnPlay.attribute('disabled', '');
      setStatus('Clustering pixels...');

      // Give the UI a frame to update
      await new Promise(r => requestAnimationFrame(r));

      console.time('loadPixels');
      sourceImage.loadPixels();
      console.timeEnd('loadPixels');

      console.time('kmeans');
      clusterResult = runKMeans(sourceImage.pixels, sourceImage.width, sourceImage.height, 5);
      console.timeEnd('kmeans');

      noteInfos = assignNoteAndInstrument(clusterResult.centroids);

      // Use the downsampled samples directly for animation (already limited to ~150x150)
      const totalSamples = clusterResult.samples.length;
      const step = Math.max(1, Math.floor(totalSamples / 2000));
      pixelSamples = clusterResult.samples.filter((_, i) => i % step === 0);

      animProgress = 0;
      state = 'ANIMATE_CLUSTER';
      setStatus('Animating clusters... wait for completion then click Play.');
      return;
    }

    // state === 'ANIMATE_CLUSTER' and animation is done — proceed to play
    if (animProgress < 1.0) {
      animProgress = 1.0; // Skip animation
      return;
    }

    state = 'SCORE';
    setStatus('Generating score...');

    // Ensure audio context is fully started before creating instruments
    await Tone.start();
    console.log('Tone.js audio context state:', Tone.context.state);

    console.time('generateScore');
    score = generateScore(clusterResult, noteInfos);
    console.timeEnd('generateScore');

    console.time('createInstruments');
    createInstruments(noteInfos, score);
    console.timeEnd('createInstruments');

    // Resize canvas for playback panels
    resizeCanvas(CANVAS_W, PIANO_ROLL_H + SPECTRO_H);
    initSpectrogram(window, CANVAS_W, SPECTRO_H);

    state = 'PLAY';
    setStatus('Playing...');
    btnPlay.attribute('disabled', '');

    schedulePlayback(score, () => {
      state = 'CAPTURE';
      spectrogramData = captureSpectrogram();
      setStatus('Playback complete. Click "Generate Image" to continue the loop.');
      btnSendAI.removeAttribute('disabled');
      resizeCanvas(CANVAS_W, CANVAS_H);
    });
  }
}

async function onSendAIClick() {
  if (!score || !noteInfos) {
    setStatus('No music summary available yet.');
    return;
  }

  const musicSummary = buildMusicSummary(score, noteInfos);
  await requestGeneratedImage({ musicSummary });
}

async function onRegenerateImageClick() {
  if (!interpretationText) {
    setStatus('No interpretation available yet. Generate an image first.');
    return;
  }

  await requestGeneratedImage({ interpretation: interpretationText, regenerate: true });
}

async function requestGeneratedImage(payload) {
  state = 'SEND_TO_LLM';
  btnSendAI.attribute('disabled', '');
  btnRegenerate.attribute('disabled', '');
  btnFeedback.attribute('disabled', '');
  setStatus('Interpreting music, then generating image...');
  state = 'WAITING';

  try {
    const headers = { 'Content-Type': 'application/json' };
    const userApiKey = getStoredApiKey();
    if (userApiKey) {
      headers['X-Google-AI-Studio-Key'] = userApiKey;
    }

    const resp = await fetch('/api/interpret', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok || data.error) {
      setStatus('AI error: ' + data.error);
      if (resp.status === 401 || resp.status === 403) {
        authPromptForced = true;
        refreshAuthPanel('That API key was rejected. Enter a valid Google AI Studio key to continue.');
      }
      btnSendAI.removeAttribute('disabled');
      return;
    }

    interpretationText = data.interpretation || '';
    imageCaption = data.caption || '';
    generatedImageDataUrl = data.image || '';
    updateInterpretationPanel();

    if (!generatedImageDataUrl) {
      setStatus('AI returned text but no image.');
      btnSendAI.removeAttribute('disabled');
      return;
    }

    renderedOutput = await loadP5Image(generatedImageDataUrl);

    state = 'DONE';
    setStatus(payload.regenerate
      ? 'New image generated from the same interpretation.'
      : 'Interpretation complete and image generated. Click "Feed back" to loop.');
    btnRegenerate.removeAttribute('disabled');
    btnFeedback.removeAttribute('disabled');
  } catch (err) {
    setStatus('Error: ' + err.message);
    if (interpretationText) btnRegenerate.removeAttribute('disabled');
  }
  btnSendAI.removeAttribute('disabled');
}

function onFeedbackClick() {
  if (!renderedOutput) return;

  // Save current output to history
  addToHistory(generatedImageDataUrl || renderedOutput.canvas.toDataURL('image/png'));

  // Use rendered output as new source image
  sourceImage = renderedOutput.get();

  // Reset state
  clusterResult = null;
  noteInfos = null;
  score = null;
  spectrogramData = null;
  interpretationText = '';
  imageCaption = '';
  renderedOutput = null;
  generatedImageDataUrl = '';
  animProgress = 0;
  pixelSamples = [];
  updateInterpretationPanel();

  iteration++;
  select('#iteration-label').html(`iteration: ${iteration}`);

  // Reset canvas size
  resizeCanvas(CANVAS_W, CANVAS_H);

  // Reset buttons
  btnPlay.removeAttribute('disabled');
  btnSendAI.attribute('disabled', '');
  btnRegenerate.attribute('disabled', '');
  btnFeedback.attribute('disabled', '');

  state = 'LOAD';
  setStatus(`Iteration ${iteration}. Click Play to begin.`);
}

// --- Helpers ---

function handleFileDrop(file) {
  console.log('File dropped:', file.type, file.subtype, file.name);
  if (file.type === 'image') {
    setStatus('Loading dropped image...');
    loadImage(file.data, img => {
      console.log('Image loaded:', img.width, 'x', img.height);
      sourceImage = img;
      state = 'LOAD';

      // Reset everything
      clusterResult = null;
      noteInfos = null;
      score = null;
      spectrogramData = null;
      renderedOutput = null;
      interpretationText = '';
      imageCaption = '';
      generatedImageDataUrl = '';
      animProgress = 0;
      resizeCanvas(CANVAS_W, CANVAS_H);
      updateInterpretationPanel();

      btnPlay.removeAttribute('disabled');
      btnSendAI.attribute('disabled', '');
      btnRegenerate.attribute('disabled', '');
      btnFeedback.attribute('disabled', '');

      setStatus('Image loaded. Click Play to begin.');
      select('#drop-zone').style('display', 'none');
    });
  }
}

function fitDimensions(srcW, srcH, maxW, maxH) {
  const scale = Math.min(maxW / srcW, maxH / srcH, 1);
  return { w: Math.floor(srcW * scale), h: Math.floor(srcH * scale) };
}

function buildMusicSummary(score, noteInfos) {
  const melodyEvents = score.melodyEvents || [];
  const chordEvents = score.chordEvents || [];
  const bassEvents = score.bassEvents || [];
  const events = score.events || [];

  if (!events.length) {
    return 'No musical events were generated.';
  }

  const clusterCounts = new Array(noteInfos.length).fill(0);
  const clusterDuration = new Array(noteInfos.length).fill(0);
  const octaves = [];
  const uniqueNotes = new Set();

  for (const evt of events) {
    if (typeof evt.cluster === 'number') {
      clusterCounts[evt.cluster] += 1;
      clusterDuration[evt.cluster] += evt.duration || 0;
    }
    uniqueNotes.add(evt.noteName);
    const octave = parseInt(String(evt.noteName).replace(/^[A-G]#?/, ''), 10);
    if (!Number.isNaN(octave)) octaves.push(octave);
  }

  const clusterSummary = noteInfos
    .map((info, i) => ({
      note: `${info.note}${info.baseOctave}`,
      instrument: info.instrumentName,
      events: clusterCounts[i],
      duration: clusterDuration[i]
    }))
    .sort((a, b) => b.events - a.events)
    .filter(item => item.events > 0)
    .slice(0, 3)
    .map(item => `${item.note} on ${item.instrument} (${item.events} events, ${item.duration.toFixed(1)}s total)`)
    .join('; ');

  const dominantLine = melodyEvents
    .filter(evt => evt.isDominant)
    .slice(0, 10)
    .map(evt => evt.noteName)
    .join(' -> ');

  const avgVelocity = events.reduce((sum, evt) => sum + (evt.velocity || 0), 0) / events.length;
  const avgOctave = octaves.length ? (octaves.reduce((a, b) => a + b, 0) / octaves.length).toFixed(1) : '4.0';
  const rhythmicDensity = (melodyEvents.length / score.totalDuration).toFixed(1);
  const harmonicRoots = (score.harmonicWindows || []).map(window => window.rootNote).join(' -> ');
  const chordPalette = [...new Set(chordEvents.map(evt => evt.rootNote).filter(Boolean))].join(', ');
  const bassLine = bassEvents.slice(0, 6).map(evt => evt.noteName).join(' -> ');

  return [
    `This piece lasts ${score.totalDuration.toFixed(1)} seconds and uses the C pentatonic collection.`,
    `It contains ${events.length} total note events across ${score.numSlices} time slices, including ${melodyEvents.length} melody notes, ${chordEvents.length} pad tones, and ${bassEvents.length} bass notes.`,
    `The most active voices are: ${clusterSummary || 'none'}.`,
    `Harmony moves through these root centers: ${harmonicRoots || 'a mostly static center'}, with chord colors around ${chordPalette || 'C pentatonic suspensions'}.`,
    `The melody density is about ${rhythmicDensity} events per second, leaving audible space between phrases.`,
    `Average register centers around octave ${avgOctave}, with ${uniqueNotes.size} unique pitches.`,
    `Average intensity is ${avgVelocity.toFixed(2)} on a 0 to 1 scale.`,
    `The opening dominant contour is: ${dominantLine || 'sparse and quiet'}.`,
    `The bass foundation begins: ${bassLine || 'subtle and sustained'}.`,
    `Interpret this as music, not as notation: describe the imagined scene, palette, motion, and mood this piece suggests.`
  ].join('\n');
}

function loadP5Image(dataUrl) {
  return new Promise((resolve, reject) => {
    loadImage(dataUrl, resolve, reject);
  });
}

function setStatus(msg) {
  select('#status').html(msg);
}

async function loadAppConfig() {
  try {
    const resp = await fetch('/api/config');
    if (!resp.ok) return;
    appConfig = await resp.json();
  } catch (err) {
    console.warn('Failed to load app config:', err);
  }
  refreshAuthPanel();
}

function getStoredApiKey() {
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) || '';
  } catch (err) {
    console.warn('localStorage unavailable:', err);
    return '';
  }
}

function setStoredApiKey(apiKey) {
  try {
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  } catch (err) {
    console.warn('Unable to store API key locally:', err);
  }
}

function removeStoredApiKey() {
  try {
    window.localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch (err) {
    console.warn('Unable to clear API key:', err);
  }
}

function maskApiKey(apiKey) {
  if (!apiKey) return 'not set';
  if (apiKey.length <= 8) return 'saved';
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function saveApiKeyFromInput() {
  const apiKey = String(apiKeyInput?.value() || '').trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    authPromptForced = true;
    refreshAuthPanel('That does not look like a valid Google AI Studio API key.');
    return;
  }

  setStoredApiKey(apiKey);
  authPromptForced = false;
  refreshAuthPanel('Personal API key saved in this browser.');
}

function clearStoredApiKey() {
  removeStoredApiKey();
  if (apiKeyInput) apiKeyInput.value('');
  authPromptForced = true;
  refreshAuthPanel('Saved API key cleared from this browser.');
}

function refreshAuthPanel(message) {
  const modeCopy = select('#auth-mode-copy');
  const authStatus = select('#auth-status');
  const storedApiKey = getStoredApiKey();
  const shouldShowPanel = authPromptForced || !storedApiKey;

  if (modeCopy) {
    if (appConfig.authMode === 'server-key') {
      modeCopy.html('This deployment has a server-managed Google AI key. You can use the app without entering your own key, or override it with your own quota by pasting a personal Google AI Studio key below.');
    } else {
      modeCopy.html('This publishable build does not include any shared secret. To generate AI output, paste your own Google AI Studio API key below so usage stays tied to your own account.');
    }
  }

  if (authPanel) {
    authPanel.toggleClass('hidden', !shouldShowPanel);
  }

  if (authStatus) {
    const baseStatus = storedApiKey
      ? `Browser key saved: ${escapeHtml(maskApiKey(storedApiKey))}`
      : (appConfig.authMode === 'server-key'
        ? 'No browser key saved. Server-managed access is available.'
        : 'No browser key saved yet.');
    authStatus.html(message ? `${escapeHtml(message)}<br>${baseStatus}` : baseStatus);
  }
}

function updateInterpretationPanel() {
  const panel = select('#interpretation-panel');
  const interpretationEl = select('#interpretation-text');
  const captionEl = select('#caption-text');
  if (!panel || !interpretationEl || !captionEl) return;

  if (!interpretationText && !imageCaption) {
    panel.style('display', 'none');
    interpretationEl.html('');
    captionEl.html('');
    return;
  }

  interpretationEl.html(escapeHtml(interpretationText));
  captionEl.html(imageCaption ? `<strong>Caption:</strong> ${escapeHtml(imageCaption)}` : '');
  panel.style('display', 'block');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function addToHistory(dataUrl) {
  historyImages.push(dataUrl);
  const strip = select('#history-strip');
  const img = createElement('img');
  img.attribute('src', dataUrl);
  img.parent(strip);

  // Add arrow between images
  if (historyImages.length > 1) {
    const arrow = createElement('span', '→');
    arrow.style('color', '#666');
    arrow.style('font-size', '24px');
    arrow.style('align-self', 'center');
    // Insert arrow before the new image
    img.elt.parentNode.insertBefore(arrow.elt, img.elt);
  }
}

// Handle keyboard
function keyPressed() {
  if (keyCode === RIGHT_ARROW) {
    if (state === 'ANIMATE_CLUSTER' && animProgress >= 1.0) {
      onPlayClick();
    }
  }
}

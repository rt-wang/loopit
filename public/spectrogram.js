// Real-time spectrogram capture using Web Audio AnalyserNode (no p5.sound)

let analyser;
let freqData;
let timeData;
let spectrogramBuffer;
let spectrogramX = 0;
let spectrogramReady = false;

function initSpectrogram(p, w, h) {
  // Create an AnalyserNode on Tone's audio context and tap the output
  const ctx = Tone.context.rawContext;
  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.8;
  Tone.getDestination().connect(analyser);

  freqData = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Float32Array(analyser.fftSize);

  spectrogramBuffer = p.createGraphics(w, h);
  spectrogramBuffer.background(0);
  spectrogramX = 0;
  spectrogramReady = false;
}

function updateSpectrogram(p, playbackPos, totalDuration) {
  if (!analyser || !spectrogramBuffer) return;

  analyser.getByteFrequencyData(freqData);
  analyser.getFloatTimeDomainData(timeData);

  const w = spectrogramBuffer.width;
  const h = spectrogramBuffer.height;
  const halfH = Math.floor(h / 2);

  // Calculate x position based on playback progress
  const progress = playbackPos / totalDuration;
  const targetX = Math.floor(progress * w);

  // Draw spectrogram columns from spectrogramX to targetX
  while (spectrogramX <= targetX && spectrogramX < w) {
    for (let i = 0; i < freqData.length; i++) {
      const amp = freqData[i];
      const y = Math.floor(p.map(i, 0, freqData.length, h - 1, halfH));
      const col = spectrogramColor(amp);
      spectrogramBuffer.stroke(col.r, col.g, col.b);
      spectrogramBuffer.point(spectrogramX, y);
    }
    spectrogramX++;
  }

  // Waveform (top half) — redraw each frame
  spectrogramBuffer.noStroke();
  spectrogramBuffer.fill(0);
  spectrogramBuffer.rect(0, 0, w, halfH);
  spectrogramBuffer.noFill();
  spectrogramBuffer.stroke(0, 200, 100);
  spectrogramBuffer.strokeWeight(1);
  spectrogramBuffer.beginShape();
  for (let i = 0; i < timeData.length; i++) {
    const x = p.map(i, 0, timeData.length, 0, w);
    const y = p.map(timeData[i], -1, 1, halfH, 0);
    spectrogramBuffer.vertex(x, y);
  }
  spectrogramBuffer.endShape();
}

function spectrogramColor(amp) {
  // Warm color ramp: black → deep red → orange → yellow → white
  const t = amp / 255;
  if (t < 0.25) {
    const s = t / 0.25;
    return { r: Math.floor(s * 140), g: 0, b: 0 };
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return { r: 140 + Math.floor(s * 115), g: Math.floor(s * 100), b: 0 };
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return { r: 255, g: 100 + Math.floor(s * 155), b: Math.floor(s * 50) };
  } else {
    const s = (t - 0.75) / 0.25;
    return { r: 255, g: 255, b: 50 + Math.floor(s * 205) };
  }
}

function drawSpectrogramToCanvas(p, x, y) {
  if (spectrogramBuffer) {
    p.image(spectrogramBuffer, x, y);
  }
}

function captureSpectrogram() {
  if (!spectrogramBuffer) return null;
  spectrogramReady = true;
  return spectrogramBuffer.canvas.toDataURL('image/png');
}

function resetSpectrogram(p, w, h) {
  spectrogramX = 0;
  spectrogramReady = false;
  if (spectrogramBuffer) {
    spectrogramBuffer.background(0);
  } else {
    initSpectrogram(p, w, h);
  }
}

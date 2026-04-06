// Note mapping, layered score generation, and playback via Tone.js

const PENTATONIC = ['C', 'D', 'E', 'G', 'A'];
const BASE_OCTAVES = [2, 3, 4, 4, 5];
const TOTAL_DURATION = 15; // seconds
const NOTE_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PENTATONIC_PITCH_CLASSES = ['C', 'D', 'E', 'G', 'A'];
const CHORD_VOICINGS = {
  C: ['C3', 'E3', 'G3', 'A3'],
  D: ['D3', 'G3', 'A3', 'C4'],
  E: ['E3', 'G3', 'A3', 'D4'],
  G: ['G2', 'A2', 'D3', 'E3'],
  A: ['A2', 'C3', 'E3', 'G3']
};
const BASS_ROOTS = {
  C: 'C2',
  D: 'D2',
  E: 'E2',
  G: 'G1',
  A: 'A1'
};

let melodyInstruments = [];
let chordInstrument = null;
let bassInstrument = null;
let fxChain = null;
let scoreEvents = [];
let isPlaying = false;
let arrangementProfile = null;

function noteToMidi(noteName) {
  const match = /^([A-G])(#?)(-?\d+)$/.exec(String(noteName || ''));
  if (!match) return null;
  const [, letter, sharp, octaveText] = match;
  const octave = parseInt(octaveText, 10);
  return (octave + 1) * 12 + NOTE_TO_SEMITONE[letter] + (sharp ? 1 : 0);
}

function midiToNoteName(midi) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const pitchClass = notes[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pitchClass}${octave}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function humanize(ms, lateOnly = false) {
  const jitter = (Math.random() * 2 - 1) * ms / 1000;
  return lateOnly ? Math.abs(jitter) : jitter;
}

function chooseByWeight(weightedValues) {
  const total = weightedValues.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return weightedValues[0]?.value;

  let threshold = Math.random() * total;
  for (const item of weightedValues) {
    threshold -= item.weight;
    if (threshold <= 0) return item.value;
  }
  return weightedValues[weightedValues.length - 1]?.value;
}

function rotateArray(values, offset) {
  if (!values.length) return values;
  const normalized = ((offset % values.length) + values.length) % values.length;
  return values.slice(normalized).concat(values.slice(0, normalized));
}

function deriveArrangementProfile(noteInfos, harmonicPlan) {
  const averageBrightness = noteInfos.reduce((sum, info) => sum + info.brightness, 0) / noteInfos.length;
  const averageSaturation = noteInfos.reduce((sum, info) => sum + info.saturation, 0) / noteInfos.length;
  const brightnessSpread = Math.max(...noteInfos.map(info => info.brightness)) - Math.min(...noteInfos.map(info => info.brightness));
  const hueValues = noteInfos.map(info => info.hue).sort((a, b) => a - b);
  const hueSpread = hueValues[hueValues.length - 1] - hueValues[0];
  const dominantMotion = harmonicPlan.windows.reduce((sum, window) => sum + window.averageDominance, 0) / harmonicPlan.windows.length;

  let chordStyle = 'velvet';
  if (averageSaturation > 60 && averageBrightness > 155 && hueSpread > 140) chordStyle = 'glass';
  else if (brightnessSpread > 110 && dominantMotion > 0.58) chordStyle = 'shimmer';
  else if (averageBrightness < 105) chordStyle = 'smoke';
  else if (averageSaturation < 28) chordStyle = 'mist';

  const styleConfig = {
    glass: {
      oscillator: 'fatsine',
      attack: 0.18,
      release: 2.8,
      sustain: 0.5,
      chordVolume: -17,
      bassOscillator: 'triangle',
      bassVolume: -11,
      reverbWet: 0.34,
      delayWet: 0.24,
      filterBase: 1100,
      filterRange: 3200,
      spreadPattern: [0, 12, 7, 19],
      rollDelay: 0.05,
      registerShift: 1
    },
    shimmer: {
      oscillator: 'sawtooth',
      attack: 0.35,
      release: 2.4,
      sustain: 0.58,
      chordVolume: -18,
      bassOscillator: 'triangle',
      bassVolume: -10,
      reverbWet: 0.28,
      delayWet: 0.18,
      filterBase: 850,
      filterRange: 2600,
      spreadPattern: [0, 7, 12, 14],
      rollDelay: 0.03,
      registerShift: 0
    },
    smoke: {
      oscillator: 'triangle',
      attack: 0.9,
      release: 3.4,
      sustain: 0.7,
      chordVolume: -15,
      bassOscillator: 'sine',
      bassVolume: -9,
      reverbWet: 0.26,
      delayWet: 0.12,
      filterBase: 380,
      filterRange: 1500,
      spreadPattern: [0, 5, 7, 12],
      rollDelay: 0,
      registerShift: -1
    },
    mist: {
      oscillator: 'sine',
      attack: 1.1,
      release: 3.8,
      sustain: 0.62,
      chordVolume: -19,
      bassOscillator: 'sine',
      bassVolume: -12,
      reverbWet: 0.38,
      delayWet: 0.1,
      filterBase: 520,
      filterRange: 1700,
      spreadPattern: [0, 7, 10, 14],
      rollDelay: 0.02,
      registerShift: 0
    },
    velvet: {
      oscillator: 'triangle',
      attack: 0.55,
      release: 2.9,
      sustain: 0.64,
      chordVolume: -16,
      bassOscillator: 'sine',
      bassVolume: -10,
      reverbWet: 0.3,
      delayWet: 0.18,
      filterBase: 700,
      filterRange: 2200,
      spreadPattern: [0, 7, 12, 16],
      rollDelay: 0.015,
      registerShift: 0
    }
  };

  return {
    chordStyle,
    averageBrightness,
    averageSaturation,
    brightnessSpread,
    hueSpread,
    dominantMotion,
    ...styleConfig[chordStyle]
  };
}

function reharmonizeVoicing(baseVoicing, rootNote, profile, windowIndex) {
  const rootMidi = noteToMidi(`${rootNote}3`);
  const rotation = (windowIndex + Math.floor(profile.averageSaturation / 20)) % baseVoicing.length;
  const rotated = rotateArray(baseVoicing, rotation);

  return rotated.map((noteName, idx) => {
    const midi = noteToMidi(noteName);
    if (midi === null || rootMidi === null) return noteName;
    const relative = midi - rootMidi;
    const spread = profile.spreadPattern[idx % profile.spreadPattern.length];
    const nextMidi = rootMidi + spread + profile.registerShift * 12 + (relative < 0 ? 12 : 0);
    return midiToNoteName(clamp(nextMidi, noteToMidi('C2'), noteToMidi('A5')));
  });
}

function assignNoteAndInstrument(centroids) {
  // Centroids are already sorted by brightness (darkest first)
  return centroids.map((c, i) => {
    const hue = rgbToHue(c[0], c[1], c[2]);
    const sat = rgbToSaturation(c[0], c[1], c[2]);
    const brightness = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return {
      note: PENTATONIC[i],
      baseOctave: BASE_OCTAVES[i],
      instrument: getInstrumentType(hue, sat),
      instrumentName: getInstrumentName(hue, sat),
      color: c,
      brightness,
      hue,
      saturation: sat
    };
  });
}

function getInstrumentType(hue, saturation) {
  if (saturation < 15) return 'membrane';
  if (hue < 60 || hue >= 330) return 'fm';
  if (hue < 150) return 'pluck';
  if (hue < 250) return 'am';
  return 'triangle';
}

function getInstrumentName(hue, saturation) {
  if (saturation < 15) return 'Membrane';
  if (hue < 60 || hue >= 330) return 'FM Brass';
  if (hue < 150) return 'Pluck';
  if (hue < 250) return 'AM Bell';
  return 'Pad';
}

function createEffects(profile = arrangementProfile) {
  if (fxChain) disposeEffects();

  const reverb = new Tone.Reverb({ decay: 2.8 + profile.reverbWet * 2.2, wet: profile.reverbWet });
  const melodyDelay = new Tone.FeedbackDelay('8n', 0.18);
  melodyDelay.wet.value = profile.delayWet;
  const padFilter = new Tone.Filter({ type: 'lowpass', frequency: profile.filterBase, Q: 0.5 });
  const bassGain = new Tone.Gain(0.9);

  melodyDelay.connect(reverb);
  reverb.toDestination();
  padFilter.connect(reverb);
  bassGain.connect(reverb);

  fxChain = { reverb, melodyDelay, padFilter, bassGain };
}

function createChordInstrument(profile = arrangementProfile) {
  return new Tone.PolySynth(Tone.Synth, {
    volume: profile.chordVolume,
    oscillator: { type: profile.oscillator },
    envelope: { attack: profile.attack, decay: 0.4, sustain: profile.sustain, release: profile.release }
  }).connect(fxChain.padFilter);
}

function createBassInstrument(profile = arrangementProfile) {
  return new Tone.MonoSynth({
    volume: profile.bassVolume,
    oscillator: { type: profile.bassOscillator },
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.8, release: 1.4 },
    filterEnvelope: { attack: 0.06, decay: 0.3, sustain: 0.2, release: 1.2, baseFrequency: 70, octaves: 2.5 }
  }).connect(fxChain.bassGain);
}

function createInstruments(noteInfos, score) {
  disposeInstruments();
  arrangementProfile = deriveArrangementProfile(noteInfos, {
    windows: score?.harmonicWindows || [],
    sliceDuration: score?.sliceDuration || TOTAL_DURATION / 8
  });
  createEffects(arrangementProfile);

  melodyInstruments = noteInfos.map(info => {
    let synth;
    switch (info.instrument) {
      case 'fm':
        synth = new Tone.FMSynth({ volume: -10, harmonicity: 1.5 }).connect(fxChain.melodyDelay);
        break;
      case 'pluck':
        synth = new Tone.PluckSynth({ volume: -8 }).connect(fxChain.melodyDelay);
        break;
      case 'am':
        synth = new Tone.AMSynth({ volume: -10, harmonicity: 1.2 }).connect(fxChain.melodyDelay);
        break;
      case 'membrane':
        synth = new Tone.MembraneSynth({ volume: -10, pitchDecay: 0.04, octaves: 3 }).connect(fxChain.melodyDelay);
        break;
      case 'triangle':
        synth = new Tone.Synth({
          volume: -10,
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.03, decay: 0.1, sustain: 0.45, release: 1.4 }
        }).connect(fxChain.melodyDelay);
        break;
      default:
        synth = new Tone.Synth({ volume: -10 }).connect(fxChain.melodyDelay);
    }
    return synth;
  });

  chordInstrument = createChordInstrument(arrangementProfile);
  bassInstrument = createBassInstrument(arrangementProfile);
}

function disposeEffects() {
  if (!fxChain) return;
  Object.values(fxChain).forEach(node => {
    try { node.dispose(); } catch (e) {}
  });
  fxChain = null;
}

function disposeInstruments() {
  melodyInstruments.forEach(inst => {
    try { inst.dispose(); } catch (e) {}
  });
  melodyInstruments = [];

  if (chordInstrument) {
    try { chordInstrument.dispose(); } catch (e) {}
    chordInstrument = null;
  }

  if (bassInstrument) {
    try { bassInstrument.dispose(); } catch (e) {}
    bassInstrument = null;
  }

  disposeEffects();
}

function analyzeSlices(clusterResult, noteInfos) {
  const { labels, sampleW: width, sampleH: height } = clusterResult;
  const k = noteInfos.length;
  const columnGroup = Math.max(1, Math.ceil(width / 150));
  const numSlices = Math.ceil(width / columnGroup);
  const sliceDuration = TOTAL_DURATION / numSlices;
  const slices = [];

  for (let s = 0; s < numSlices; s++) {
    const startCol = s * columnGroup;
    const endCol = Math.min(startCol + columnGroup, width);
    const clusterCounts = new Array(k).fill(0);
    let totalBrightness = 0;

    for (let y = 0; y < height; y++) {
      for (let x = startCol; x < endCol; x++) {
        const idx = y * width + x;
        const label = labels[idx];
        clusterCounts[label]++;
        totalBrightness += noteInfos[label].brightness;
      }
    }

    const totalPixels = Math.max(1, (endCol - startCol) * height);
    const ranked = clusterCounts
      .map((count, cluster) => ({
        cluster,
        count,
        fraction: count / totalPixels,
        brightness: noteInfos[cluster].brightness
      }))
      .sort((a, b) => b.count - a.count);

    const dominant = ranked[0];
    const secondary = ranked[1] || null;

    slices.push({
      sliceIndex: s,
      time: s * sliceDuration,
      duration: sliceDuration,
      clusterCounts,
      totalPixels,
      dominantCluster: dominant.cluster,
      dominantFraction: dominant.fraction,
      secondaryCluster: secondary?.cluster ?? dominant.cluster,
      secondaryFraction: secondary?.fraction ?? 0,
      averageBrightness: totalBrightness / totalPixels,
      ranked
    });
  }

  return { slices, numSlices, sliceDuration };
}

function getMelodyPlayProbability(fraction) {
  if (fraction >= 0.75) return 1;
  if (fraction >= 0.65) return 0.85;
  if (fraction >= 0.55) return 0.72;
  if (fraction >= 0.40) return 0.55;
  return 0.38;
}

function computeMelodyOctave(noteInfo, sliceBrightness, harmonicRoot) {
  const relativeShift = Math.round((sliceBrightness - noteInfo.brightness) / 70);
  const harmonicLift = harmonicRoot === noteInfo.note ? 1 : 0;
  return clamp(noteInfo.baseOctave + relativeShift + harmonicLift, 2, 6);
}

function computeMelodyVelocity(noteInfo, fraction, isDominant, sliceBrightness) {
  const dynamicBase = isDominant ? 0.65 + fraction * 0.25 : 0.25 + fraction * 0.2;
  const saturationLift = noteInfo.saturation / 255 * 0.08;
  const brightnessLift = sliceBrightness / 255 * 0.06;
  return clamp((dynamicBase + saturationLift + brightnessLift) * (0.85 + Math.random() * 0.25), 0.18, 0.98);
}

function generateHarmonicPlan(clusterResult, noteInfos) {
  const analysis = analyzeSlices(clusterResult, noteInfos);
  const { slices, sliceDuration, numSlices } = analysis;
  const windowSlices = clamp(Math.round(2.5 / sliceDuration), 2, 8);
  const harmonicPlan = [];

  for (let start = 0; start < slices.length; start += windowSlices) {
    const end = Math.min(start + windowSlices, slices.length);
    const window = slices.slice(start, end);
    const persistence = new Array(noteInfos.length).fill(0);
    let brightnessSum = 0;
    let dominanceSum = 0;

    window.forEach(slice => {
      slice.ranked.forEach((item, rank) => {
        persistence[item.cluster] += item.fraction * (rank === 0 ? 1.4 : rank === 1 ? 0.8 : 0.3);
      });
      brightnessSum += slice.averageBrightness;
      dominanceSum += slice.dominantFraction;
    });

    const rootCluster = persistence
      .map((weight, cluster) => ({ cluster, weight }))
      .sort((a, b) => b.weight - a.weight)[0].cluster;
    const rootNote = noteInfos[rootCluster].note;
    const time = window[0].time;
    const duration = window.reduce((sum, slice) => sum + slice.duration, 0);

    harmonicPlan.push({
      index: harmonicPlan.length,
      startSlice: start,
      endSlice: end - 1,
      time,
      duration,
      rootCluster,
      rootNote,
      voicing: CHORD_VOICINGS[rootNote] || CHORD_VOICINGS.C,
      averageBrightness: brightnessSum / window.length,
      averageDominance: dominanceSum / window.length
    });
  }

  return {
    slices,
    numSlices,
    sliceDuration,
    windows: harmonicPlan
  };
}

function findWindowForSlice(harmonicPlan, sliceIndex) {
  return harmonicPlan.windows.find(window => sliceIndex >= window.startSlice && sliceIndex <= window.endSlice) || harmonicPlan.windows[0];
}

function mergeLegatoNotes(events, sliceDuration) {
  if (!events.length) return [];
  const merged = [];

  events
    .slice()
    .sort((a, b) => a.time - b.time)
    .forEach(evt => {
      const prev = merged[merged.length - 1];
      const contiguous = prev && Math.abs((prev.time + prev.duration) - evt.time) < sliceDuration * 0.35;
      if (
        prev &&
        contiguous &&
        prev.cluster === evt.cluster &&
        prev.noteName === evt.noteName &&
        prev.layer === evt.layer &&
        evt.isDominant === prev.isDominant
      ) {
        prev.duration = clamp(prev.duration + evt.duration, sliceDuration, sliceDuration * 4);
        prev.velocity = clamp((prev.velocity + evt.velocity) / 2, 0.18, 0.98);
        prev.sliceEnd = evt.sliceIndex;
      } else {
        merged.push({ ...evt, sliceStart: evt.sliceIndex, sliceEnd: evt.sliceIndex });
      }
    });

  return merged;
}

function getPassingTone(noteA, noteB) {
  const midiA = noteToMidi(noteA);
  const midiB = noteToMidi(noteB);
  if (midiA === null || midiB === null) return null;

  const low = Math.min(midiA, midiB);
  const high = Math.max(midiA, midiB);
  const between = [];

  for (let midi = low + 1; midi < high; midi++) {
    const name = midiToNoteName(midi);
    const pitchClass = name.replace(/-?\d+$/, '');
    if (PENTATONIC_PITCH_CLASSES.includes(pitchClass)) {
      between.push({ midi, name });
    }
  }

  if (!between.length) return null;
  return chooseByWeight(
    between.map(item => ({
      value: item.name,
      weight: 1 / (1 + Math.abs(item.midi - midiB))
    }))
  );
}

function insertPassingTones(events, sliceDuration) {
  if (events.length < 2) return events;
  const withPassing = [];

  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const next = events[i + 1];
    withPassing.push(current);

    if (!next || !current.isDominant || !next.isDominant) continue;

    const currentMidi = noteToMidi(current.noteName);
    const nextMidi = noteToMidi(next.noteName);
    if (currentMidi === null || nextMidi === null) continue;

    const leap = Math.abs(nextMidi - currentMidi);
    if (leap <= 7 || Math.random() > 0.55) continue;

    const passingNote = getPassingTone(current.noteName, next.noteName);
    if (!passingNote) continue;

    const insertDuration = Math.min(sliceDuration * 0.5, 0.22);
    const insertTime = Math.max(current.time + Math.max(current.duration - insertDuration * 1.15, sliceDuration * 0.2), current.time + 0.04);

    if (insertTime >= next.time - insertDuration * 0.5) continue;

    withPassing.push({
      layer: 'melody',
      role: 'passing',
      time: insertTime,
      duration: insertDuration,
      noteName: passingNote,
      velocity: clamp(Math.min(current.velocity, next.velocity) * 0.72, 0.12, 0.58),
      cluster: next.cluster,
      instrumentCluster: next.cluster,
      isDominant: false,
      isPassingTone: true,
      sliceIndex: next.sliceStart ?? next.sliceIndex
    });
  }

  return withPassing.sort((a, b) => a.time - b.time);
}

function generateExpressiveMelody(clusterResult, noteInfos, harmonicPlan) {
  const melodySeeds = [];
  const supportEvents = [];

  harmonicPlan.slices.forEach(slice => {
    const window = findWindowForSlice(harmonicPlan, slice.sliceIndex);
    const dominantCluster = slice.dominantCluster;
    const dominantInfo = noteInfos[dominantCluster];
    const playProbability = getMelodyPlayProbability(slice.dominantFraction);

    if (Math.random() <= playProbability) {
      const dominantOctave = computeMelodyOctave(dominantInfo, slice.averageBrightness, window.rootNote);
      melodySeeds.push({
        layer: 'melody',
        role: 'primary',
        time: slice.time,
        duration: slice.duration,
        noteName: `${dominantInfo.note}${dominantOctave}`,
        velocity: computeMelodyVelocity(dominantInfo, slice.dominantFraction, true, slice.averageBrightness),
        cluster: dominantCluster,
        instrumentCluster: dominantCluster,
        isDominant: true,
        sliceIndex: slice.sliceIndex
      });
    }

    if (slice.secondaryFraction >= 0.1 && Math.random() < clamp(slice.secondaryFraction * 0.9, 0.12, 0.45)) {
      const secondaryCluster = slice.secondaryCluster;
      const secondaryInfo = noteInfos[secondaryCluster];
      const secondaryOctave = clamp(computeMelodyOctave(secondaryInfo, slice.averageBrightness, window.rootNote) - 1, 2, 5);

      supportEvents.push({
        layer: 'melody',
        role: 'secondary',
        time: slice.time + slice.duration * 0.1,
        duration: slice.duration * 0.75,
        noteName: `${secondaryInfo.note}${secondaryOctave}`,
        velocity: computeMelodyVelocity(secondaryInfo, slice.secondaryFraction, false, slice.averageBrightness) * 0.82,
        cluster: secondaryCluster,
        instrumentCluster: secondaryCluster,
        isDominant: false,
        sliceIndex: slice.sliceIndex
      });
    }
  });

  const legatoMelody = mergeLegatoNotes(melodySeeds, harmonicPlan.sliceDuration)
    .map(evt => ({
      ...evt,
      time: Math.max(0, evt.time + humanize(20))
    }));
  const melodyWithPassing = insertPassingTones(legatoMelody, harmonicPlan.sliceDuration);
  const softenedSupport = supportEvents.map(evt => ({
    ...evt,
    time: Math.max(0, evt.time + humanize(12)),
    duration: clamp(evt.duration, harmonicPlan.sliceDuration * 0.5, harmonicPlan.sliceDuration * 1.5)
  }));

  return melodyWithPassing.concat(softenedSupport).sort((a, b) => a.time - b.time);
}

function generateChordEvents(harmonicPlan) {
  const profile = arrangementProfile || deriveArrangementProfile(
    harmonicPlan.windows.map(window => ({
      brightness: window.averageBrightness,
      saturation: 40,
      hue: window.index * 40
    })),
    harmonicPlan
  );

  return harmonicPlan.windows.flatMap(window => {
    const voicing = reharmonizeVoicing(window.voicing, window.rootNote, profile, window.index);
    return voicing.map((noteName, noteIndex) => ({
      layer: 'chord',
      role: 'pad',
      time: Math.max(0, window.time + noteIndex * profile.rollDelay + humanize(28, true)),
      duration: window.duration + Math.min(0.35, harmonicPlan.sliceDuration * 0.5),
      noteName,
      velocity: clamp(0.24 + window.averageDominance * 0.16 + (noteIndex === 0 ? 0.08 : 0) + Math.random() * 0.07, 0.18, 0.58),
      rootNote: window.rootNote,
      windowIndex: window.index,
      chordStyle: profile.chordStyle
    }));
  });
}

function generateBassEvents(harmonicPlan) {
  return harmonicPlan.windows.map(window => ({
    layer: 'bass',
    role: 'root',
    time: Math.max(0, window.time + humanize(10)),
    duration: window.duration + Math.min(0.15, harmonicPlan.sliceDuration * 0.25),
    noteName: BASS_ROOTS[window.rootNote] || 'C2',
    velocity: clamp(0.42 + window.averageDominance * 0.18 + Math.random() * 0.08, 0.32, 0.7),
    rootNote: window.rootNote,
    windowIndex: window.index
  }));
}

function mergeScoreLayers({ melodyEvents, chordEvents, bassEvents, harmonicPlan }) {
  scoreEvents = melodyEvents
    .concat(chordEvents, bassEvents)
    .sort((a, b) => a.time - b.time);

  return {
    events: scoreEvents,
    melodyEvents,
    chordEvents,
    bassEvents,
    totalDuration: TOTAL_DURATION,
    sliceDuration: harmonicPlan.sliceDuration,
    numSlices: harmonicPlan.numSlices,
    harmonicWindows: harmonicPlan.windows
  };
}

function generateScore(clusterResult, noteInfos) {
  const harmonicPlan = generateHarmonicPlan(clusterResult, noteInfos);
  const melodyEvents = generateExpressiveMelody(clusterResult, noteInfos, harmonicPlan);
  const chordEvents = generateChordEvents(harmonicPlan);
  const bassEvents = generateBassEvents(harmonicPlan);

  return mergeScoreLayers({
    melodyEvents,
    chordEvents,
    bassEvents,
    harmonicPlan
  });
}

function automatePadFilter(score) {
  if (!fxChain?.padFilter || !score?.harmonicWindows?.length) return;
  const now = Tone.now();
  fxChain.padFilter.frequency.cancelScheduledValues(now);

  score.harmonicWindows.forEach(window => {
    const cutoff = arrangementProfile
      ? arrangementProfile.filterBase + (window.averageBrightness / 255) * arrangementProfile.filterRange
      : 400 + (window.averageBrightness / 255) * 2800;
    fxChain.padFilter.frequency.linearRampToValueAtTime(cutoff, now + window.time + 0.05);
  });
}

function scheduleLayeredPlayback(score, onComplete) {
  Tone.Transport.cancel();
  Tone.Transport.stop();
  Tone.Transport.position = 0;

  automatePadFilter(score);

  score.melodyEvents.forEach(evt => {
    Tone.Transport.schedule(time => {
      const inst = melodyInstruments[evt.instrumentCluster ?? evt.cluster];
      if (!inst) return;
      try {
        inst.triggerAttackRelease(evt.noteName, evt.duration, time, evt.velocity);
      } catch (e) {}
    }, evt.time);
  });

  score.chordEvents.forEach(evt => {
    Tone.Transport.schedule(time => {
      if (!chordInstrument) return;
      try {
        chordInstrument.triggerAttackRelease(evt.noteName, evt.duration, time, evt.velocity);
      } catch (e) {}
    }, evt.time);
  });

  score.bassEvents.forEach(evt => {
    Tone.Transport.schedule(time => {
      if (!bassInstrument) return;
      try {
        bassInstrument.triggerAttackRelease(evt.noteName, evt.duration, time, evt.velocity);
      } catch (e) {}
    }, evt.time);
  });

  Tone.Transport.schedule(() => {
    Tone.Transport.stop();
    isPlaying = false;
    if (onComplete) onComplete();
  }, score.totalDuration + 0.75);

  isPlaying = true;
  Tone.Transport.start();
}

function schedulePlayback(score, onComplete) {
  scheduleLayeredPlayback(score, onComplete);
}

function stopPlayback() {
  Tone.Transport.cancel();
  Tone.Transport.stop();
  isPlaying = false;
}

function getPlaybackPosition() {
  if (!isPlaying) return -1;
  return Tone.Transport.seconds;
}

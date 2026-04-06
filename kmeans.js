// K-means clustering on pixel data in RGB space
// Uses k-means++ initialization

function runKMeans(pixels, width, height, k = 5, maxIter = 20) {
  // Downsample to max 150x150 for performance
  const maxDim = 150;
  let sampleW = width;
  let sampleH = height;
  let scale = 1;

  if (width > maxDim || height > maxDim) {
    scale = Math.min(maxDim / width, maxDim / height);
    sampleW = Math.floor(width * scale);
    sampleH = Math.floor(height * scale);
  }

  // Extract RGB samples from the pixel array
  const samples = [];
  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const idx = (srcY * width + srcX) * 4;
      samples.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]]);
    }
  }

  // K-means++ initialization
  const centroids = [];
  // Pick first centroid randomly
  centroids.push([...samples[Math.floor(Math.random() * samples.length)]]);

  for (let c = 1; c < k; c++) {
    const distances = samples.map(s => {
      let minDist = Infinity;
      for (const cent of centroids) {
        const d = sqDist(s, cent);
        if (d < minDist) minDist = d;
      }
      return minDist;
    });

    const totalDist = distances.reduce((a, b) => a + b, 0);
    if (totalDist === 0) {
      centroids.push([...samples[Math.floor(Math.random() * samples.length)]]);
      continue;
    }

    let r = Math.random() * totalDist;
    for (let i = 0; i < distances.length; i++) {
      r -= distances[i];
      if (r <= 0) {
        centroids.push([...samples[i]]);
        break;
      }
    }
    if (centroids.length <= c) {
      centroids.push([...samples[Math.floor(Math.random() * samples.length)]]);
    }
  }

  // Iterative assignment + update
  let labels = new Array(samples.length);
  for (let iter = 0; iter < maxIter; iter++) {
    // Assignment step
    for (let i = 0; i < samples.length; i++) {
      let minDist = Infinity;
      let minLabel = 0;
      for (let c = 0; c < k; c++) {
        const d = sqDist(samples[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          minLabel = c;
        }
      }
      labels[i] = minLabel;
    }

    // Update step
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);

    for (let i = 0; i < samples.length; i++) {
      const l = labels[i];
      sums[l][0] += samples[i][0];
      sums[l][1] += samples[i][1];
      sums[l][2] += samples[i][2];
      counts[l]++;
    }

    let maxShift = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Re-seed empty clusters to a sample that is far from the current centroids.
        // AI-generated feedback images can have large flat regions, which otherwise
        // causes collapsed centroids and all pixels falling into a single label.
        const replacement = pickFarthestSample(samples, centroids, c);
        maxShift = Math.max(maxShift, sqDist(centroids[c], replacement));
        centroids[c] = replacement;
        continue;
      }
      const newCentroid = [
        sums[c][0] / counts[c],
        sums[c][1] / counts[c],
        sums[c][2] / counts[c]
      ];
      maxShift = Math.max(maxShift, sqDist(centroids[c], newCentroid));
      centroids[c] = newCentroid;
    }

    if (maxShift < 1.0) break;
  }

  // Sort centroids by brightness (darkest first)
  const brightness = centroids.map(c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
  const sortOrder = brightness.map((b, i) => ({ b, i })).sort((a, b) => a.b - b.b).map(x => x.i);

  const sortedCentroids = sortOrder.map(i => centroids[i]);
  // Remap labels according to new sort order (downsampled labels only)
  const labelMap = new Array(k);
  sortOrder.forEach((oldIdx, newIdx) => { labelMap[oldIdx] = newIdx; });
  const sortedLabels = labels.map(l => labelMap[l]);

  // Also return the downsampled pixel RGB values for the animation scatter plot
  const sortedSamples = samples.map((s, i) => ({ r: s[0], g: s[1], b: s[2], label: sortedLabels[i] }));

  return {
    centroids: sortedCentroids.map(c => c.map(Math.round)),
    labels: sortedLabels,       // downsampled grid labels (sampleW * sampleH)
    samples: sortedSamples,     // downsampled pixels with labels, ready for animation
    sampleW,
    sampleH,
    width,
    height
  };
}

function pickFarthestSample(samples, centroids, skipIndex = -1) {
  let bestSample = samples[0];
  let bestDistance = -1;

  for (const sample of samples) {
    let minDist = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      if (i === skipIndex) continue;
      minDist = Math.min(minDist, sqDist(sample, centroids[i]));
    }
    if (minDist > bestDistance) {
      bestDistance = minDist;
      bestSample = sample;
    }
  }

  return [...bestSample];
}

function nearestCentroid(r, g, b, centroids) {
  let minDist = Infinity;
  let minLabel = 0;
  for (let c = 0; c < centroids.length; c++) {
    const d = sqDist([r, g, b], centroids[c]);
    if (d < minDist) { minDist = d; minLabel = c; }
  }
  return minLabel;
}

function sqDist(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

function rgbToSaturation(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return ((max - min) / max) * 100;
}

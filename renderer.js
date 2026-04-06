// Panel 3 — parses LLM description into drawn output

function parseLLMResponse(text) {
  const result = {
    background: { color: '#1a1a2e', gradient: null },
    shapes: [],
    particles: [],
    mood: ''
  };

  console.log('Raw LLM text to parse:', JSON.stringify(text));

  // Strip markdown formatting (bold, etc)
  text = text.replace(/\*\*/g, '').replace(/\*/g, '');

  // Extract sections — flexible matching (handles varying whitespace, colons, etc)
  const bgMatch = text.match(/BACKGROUND:?\s*(.+?)(?=SHAPES:?|$)/si);
  const shapesMatch = text.match(/SHAPES:?\s*(.+?)(?=PARTICLES:?|$)/si);
  const particlesMatch = text.match(/PARTICLES:?\s*(.+?)(?=MOOD:?|$)/si);
  const moodMatch = text.match(/MOOD:?\s*(.+?)$/si);

  // Parse background
  if (bgMatch) {
    const bgText = bgMatch[1].trim();
    const hexColors = bgText.match(/#[0-9a-fA-F]{6}/g);
    if (hexColors && hexColors.length > 0) {
      result.background.color = hexColors[0];
      if (hexColors.length > 1) {
        result.background.gradient = { from: hexColors[0], to: hexColors[1] };
      }
    }
    // Check for gradient keywords
    if (bgText.toLowerCase().includes('fading') || bgText.toLowerCase().includes('gradient')) {
      if (!result.background.gradient && hexColors && hexColors.length === 1) {
        result.background.gradient = { from: hexColors[0], to: '#000000' };
      }
    }
  }

  // Parse shapes
  if (shapesMatch) {
    const shapesText = shapesMatch[1].trim();
    // Match patterns like: color type #hex at X%,Y% size S%
    const shapePattern = /(?:(\w[\w\s]*?)\s+)?(circle|rectangle|rect|triangle|ellipse|square)\s*#([0-9a-fA-F]{6})\s*(?:at\s*)?([\d.]+)%\s*,\s*([\d.]+)%\s*size\s*([\d.]+)%(?:\s*x\s*([\d.]+)%)?/gi;
    let match;
    while ((match = shapePattern.exec(shapesText)) !== null) {
      result.shapes.push({
        type: match[2].toLowerCase(),
        color: '#' + match[3],
        x: parseFloat(match[4]),
        y: parseFloat(match[5]),
        w: parseFloat(match[6]),
        h: match[7] ? parseFloat(match[7]) : parseFloat(match[6])
      });
    }

    // Fallback: try simpler pattern — hex + any two percentages + size
    if (result.shapes.length === 0) {
      const simplePattern = /#([0-9a-fA-F]{6}).*?([\d.]+)%\s*,\s*([\d.]+)%.*?(?:size\s*)?([\d.]+)%/gi;
      while ((match = simplePattern.exec(shapesText)) !== null) {
        result.shapes.push({
          type: 'circle',
          color: '#' + match[1],
          x: parseFloat(match[2]),
          y: parseFloat(match[3]),
          w: parseFloat(match[4]),
          h: parseFloat(match[4])
        });
      }
    }

    // Last resort: just find hex colors and scatter them
    if (result.shapes.length === 0) {
      const hexes = shapesText.match(/#[0-9a-fA-F]{6}/g) || [];
      hexes.forEach((hex, i) => {
        result.shapes.push({
          type: ['circle', 'rectangle', 'triangle'][i % 3],
          color: hex,
          x: 20 + (i * 18) % 70,
          y: 20 + (i * 23) % 60,
          w: 10 + Math.random() * 10,
          h: 10 + Math.random() * 10
        });
      });
    }
  }

  // Parse particles
  if (particlesMatch) {
    const partText = particlesMatch[1].trim();
    const partSections = partText.split(/;|\n/).filter(s => s.trim());
    for (const section of partSections) {
      const hexMatch = section.match(/#([0-9a-fA-F]{6})/);
      const densityMatch = section.match(/\b(sparse|medium|dense)\b/i);
      const regionMatch = section.match(/\b(upper|lower|left|right|center|top|bottom)[-\s]?(left|right|center|half|quadrant|third)?\b/gi);

      if (hexMatch || densityMatch) {
        result.particles.push({
          color: hexMatch ? '#' + hexMatch[1] : '#ffffff',
          density: densityMatch ? densityMatch[1].toLowerCase() : 'sparse',
          region: regionMatch ? regionMatch.join(' ').toLowerCase() : 'center'
        });
      }
    }
  }

  // Parse mood
  if (moodMatch) {
    result.mood = moodMatch[1].trim();
  }

  return result;
}

function renderLLMOutput(p, parsed, w, h) {
  const gfx = p.createGraphics(w, h);

  // Background
  if (parsed.background.gradient) {
    const c1 = gfx.color(parsed.background.gradient.from);
    const c2 = gfx.color(parsed.background.gradient.to);
    for (let y = 0; y < h; y++) {
      const inter = gfx.lerpColor(c1, c2, y / h);
      gfx.stroke(inter);
      gfx.line(0, y, w, y);
    }
  } else {
    gfx.background(parsed.background.color);
  }

  // Shapes
  gfx.noStroke();
  for (const shape of parsed.shapes) {
    gfx.fill(shape.color);
    const sx = (shape.x / 100) * w;
    const sy = (shape.y / 100) * h;
    const sw = (shape.w / 100) * w;
    const sh = (shape.h / 100) * h;

    switch (shape.type) {
      case 'circle':
        gfx.ellipse(sx, sy, sw, sw);
        break;
      case 'ellipse':
        gfx.ellipse(sx, sy, sw, sh);
        break;
      case 'rectangle':
      case 'rect':
      case 'square':
        gfx.rectMode(gfx.CENTER);
        gfx.rect(sx, sy, sw, sh);
        break;
      case 'triangle':
        gfx.triangle(sx, sy - sh / 2, sx - sw / 2, sy + sh / 2, sx + sw / 2, sy + sh / 2);
        break;
      default:
        gfx.ellipse(sx, sy, sw, sw);
    }
  }

  // Particles
  for (const group of parsed.particles) {
    gfx.fill(group.color);
    gfx.noStroke();
    const count = group.density === 'dense' ? 400 : group.density === 'medium' ? 150 : 50;
    const bounds = getRegionBounds(group.region, w, h);

    for (let i = 0; i < count; i++) {
      const px = bounds.x + Math.random() * bounds.w;
      const py = bounds.y + Math.random() * bounds.h;
      const size = 2 + Math.random() * 2;
      gfx.ellipse(px, py, size, size);
    }
  }

  // Mood post-processing
  const mood = parsed.mood.toLowerCase();
  if (mood.includes('warm') || mood.includes('sunset') || mood.includes('fire')) {
    gfx.fill(255, 100, 0, 20);
    gfx.noStroke();
    gfx.rect(0, 0, w, h);
  } else if (mood.includes('dark') || mood.includes('somber') || mood.includes('mysterious')) {
    gfx.fill(0, 0, 0, 40);
    gfx.noStroke();
    gfx.rect(0, 0, w, h);
  } else if (mood.includes('energetic') || mood.includes('vibrant') || mood.includes('chaotic')) {
    // Add random jitter — re-draw shapes slightly offset
    for (const shape of parsed.shapes) {
      gfx.fill(gfx.color(shape.color + '40'));
      const jx = (shape.x / 100) * w + (Math.random() - 0.5) * 10;
      const jy = (shape.y / 100) * h + (Math.random() - 0.5) * 10;
      const sw = (shape.w / 100) * w;
      gfx.ellipse(jx, jy, sw * 0.8, sw * 0.8);
    }
  }

  return gfx;
}

function getRegionBounds(region, w, h) {
  let x = 0, y = 0, rw = w, rh = h;

  if (region.includes('upper') || region.includes('top')) { rh = h / 2; }
  else if (region.includes('lower') || region.includes('bottom')) { y = h / 2; rh = h / 2; }

  if (region.includes('left') && !region.includes('right')) { rw = w / 2; }
  else if (region.includes('right') && !region.includes('left')) { x = w / 2; rw = w / 2; }

  if (region.includes('center') && !region.includes('left') && !region.includes('right')) {
    x = w * 0.25; rw = w * 0.5;
    if (!region.includes('upper') && !region.includes('lower') && !region.includes('top') && !region.includes('bottom')) {
      y = h * 0.25; rh = h * 0.5;
    }
  }

  return { x, y, w: rw, h: rh };
}

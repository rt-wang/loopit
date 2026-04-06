const express = require('express');
const app = express();
const PORT = 3000;

// Load .env manually (no dotenv dependency)
const fs = require('fs');
const path = require('path');
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) {
      process.env[key.trim()] = val.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
} catch (e) {
  console.warn('.env file not found — set ANTHROPIC_API_KEY or GOOGLE_API_KEY as environment variable');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static('.'));

const INTERPRETATION_PROMPT = `You are listening with imagination. You are given a textual summary
of music that was generated from an image.

Your job is not to describe notation or audio visuals. Instead, infer the vibe,
world, scene, atmosphere, materials, motion, lighting, and emotional tone that
this music suggests.

Write a short interpretation that feels vivid and imagistic. It should help an
image model imagine something rich and specific.

Requirements:
- Do not mention charts, notation, DAWs, graphs, bars, spectrograms, or waveforms
- Focus on mood, place, weather, textures, colors, objects, architecture, motion, or creatures
- Make it imaginative rather than analytical
- Keep it concise but evocative
- Return exactly 4 lines in this format:

SCENE: ...
PALETTE: ...
MOTION: ...
MOOD: ...`;

function buildImagePrompt(interpretation) {
  const variationHint = buildVariationHint();
  return `You are part of a synesthetic art loop. Generate a brand new image from the
following music interpretation. The text interpretation is the only source of
meaning and vibe.

Music interpretation:
${interpretation}

Fresh variation directive:
${variationHint}

Requirements:
- Imagine a world, scene, place, object, creature, or surreal moment from the interpretation
- Do not depict graphs, equalizers, spectrogram bars, waveforms, oscilloscopes, notation, or audio interfaces
- Preserve strong color variety with at least 5 distinct color families
- Include layered foreground, midground, and background, or clearly separated visual regions
- Avoid monochrome, flat gradients, muddy gray washes, or overly uniform fields
- Use layered shapes, textures, and contrast so later k-means clustering finds multiple stable regions
- Keep the composition bold, graphic, and visually legible
- Make a fresh visual choice for subject, framing, and spatial layout rather than repeating a generic centered composition
- Fill the full frame

Also return a short one-sentence caption describing the generated image.`;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'gemini-3.1-flash-image-preview';

function extractTextAndImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  let text = '';
  let image = '';

  for (const part of parts) {
    if (!text && part.text) {
      text = part.text;
    }
    if (!image && part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      image = `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  return { text, image };
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.text) {
      return part.text;
    }
  }
  return '';
}

function pickOne(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function buildVariationHint() {
  const subject = pickOne([
    'Favor an architectural or environmental interpretation.',
    'Favor a creature, figure, or living presence.',
    'Favor an object-based surreal still life.',
    'Favor a landscape or world-scale vista.',
    'Favor an abstract but spatially deep composition.'
  ]);

  const framing = pickOne([
    'Use an off-center composition with asymmetrical balance.',
    'Use a close-up composition with cropped forms and large shapes.',
    'Use a distant, wide composition with layered depth.',
    'Use a strong diagonal composition with motion across the frame.',
    'Use a clustered composition with one dense region and one quiet region.'
  ]);

  const palette = pickOne([
    'Push toward high color contrast with warm against cool.',
    'Push toward luminous saturated colors with one dark anchor tone.',
    'Push toward earthy mineral colors interrupted by sharp neon accents.',
    'Push toward misty light colors with a few intense highlights.',
    'Push toward sunset-like gradients broken by contrasting local colors.'
  ]);

  const texture = pickOne([
    'Emphasize layered texture and material variety.',
    'Emphasize graphic shapes with crisp edges.',
    'Emphasize atmospheric haze and light bloom.',
    'Emphasize patterned surfaces and repeating motifs.',
    'Emphasize tactile, hand-made, almost sculptural forms.'
  ]);

  return `${subject} ${framing} ${palette} ${texture}`;
}

async function generateImageFromInterpretation(interpretation) {
  const imageResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${NANO_BANANA_MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        },
        contents: [{
          parts: [
            { text: buildImagePrompt(interpretation) },
          ]
        }]
      })
    }
  );

  const imageData = await imageResponse.json();
  if (!imageResponse.ok || imageData.error) {
    console.error('Nano Banana error:', JSON.stringify(imageData.error));
    const error = new Error(imageData.error?.message || `Nano Banana request failed for model ${NANO_BANANA_MODEL}`);
    error.status = imageResponse.status || 500;
    throw error;
  }

  const generated = extractTextAndImage(imageData);
  if (!generated.image) {
    const error = new Error('Nano Banana returned no image.');
    error.status = 500;
    throw error;
  }

  return generated;
}

app.post('/api/interpret', async (req, res) => {
  const { musicSummary, interpretation } = req.body;
  if (!musicSummary && !interpretation) {
    return res.status(400).json({ error: 'No music summary or interpretation provided' });
  }

  try {
    if (process.env.GOOGLE_API_KEY) {
      let finalInterpretation = (interpretation || '').trim();

      if (!finalInterpretation) {
        const interpretationResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: INTERPRETATION_PROMPT }] },
              contents: [{
                parts: [
                  { text: musicSummary }
                ]
              }]
            })
          }
        );

        const interpretationData = await interpretationResponse.json();
        if (!interpretationResponse.ok || interpretationData.error) {
          console.error('Gemini interpretation error:', JSON.stringify(interpretationData.error));
          return res.status(interpretationResponse.status || 500).json({
            error: interpretationData.error?.message || `Gemini interpretation request failed for model ${GEMINI_MODEL}`
          });
        }

        finalInterpretation = extractText(interpretationData).trim();
        if (!finalInterpretation) {
          return res.status(500).json({ error: 'Interpretation model returned no text.' });
        }
      }

      const generated = await generateImageFromInterpretation(finalInterpretation);

      console.log('Interpretation model:', GEMINI_MODEL);
      console.log('Image model:', NANO_BANANA_MODEL);
      return res.json({
        interpretation: finalInterpretation,
        caption: generated.text,
        image: generated.image,
        interpretationModel: GEMINI_MODEL,
        imageModel: NANO_BANANA_MODEL
      });

    } else {
      return res.status(500).json({ error: 'No API key configured. Set ANTHROPIC_API_KEY or GOOGLE_API_KEY in .env' });
    }
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Synesthetic Loop server running at http://localhost:${PORT}`);
});

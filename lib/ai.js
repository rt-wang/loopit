const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'gemini-3.1-flash-image-preview';

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

function getModels() {
  return {
    interpretationModel: GEMINI_MODEL,
    imageModel: NANO_BANANA_MODEL
  };
}

function getHeaderValue(headers = {}, key) {
  return headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()] || '';
}

function getHost(headers = {}) {
  return String(
    getHeaderValue(headers, 'x-forwarded-host') ||
    getHeaderValue(headers, 'host') ||
    ''
  ).trim();
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function getHostnameFromHostHeader(host) {
  return String(host || '').trim().split(',')[0].trim().split(':')[0].trim().toLowerCase();
}

function isLocalRequest(headers = {}) {
  const hostName = getHostnameFromHostHeader(getHost(headers));
  return isLocalHost(hostName);
}

function isServerKeyAllowed(headers = {}) {
  return Boolean(process.env.GOOGLE_API_KEY) && isLocalRequest(headers);
}

function getConfig(headers = {}) {
  return {
    authMode: isServerKeyAllowed(headers) ? 'server-key' : 'user-key',
    interpretationModel: GEMINI_MODEL,
    imageModel: NANO_BANANA_MODEL,
    serverKeyAvailable: isServerKeyAllowed(headers)
  };
}

function getRequestApiKey(headers = {}) {
  const authorization = getHeaderValue(headers, 'authorization');
  const headerKey = getHeaderValue(headers, 'x-google-ai-studio-key');
  const rawValue = headerKey || (authorization && authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
  const apiKey = String(rawValue || '').trim();

  if (!apiKey) return '';
  if (!/^[A-Za-z0-9_-]{20,}$/.test(apiKey)) {
    return '';
  }

  return apiKey;
}

function getEffectiveApiKey(headers = {}) {
  const userApiKey = getRequestApiKey(headers);
  if (userApiKey) return userApiKey;
  if (isServerKeyAllowed(headers)) return process.env.GOOGLE_API_KEY;
  return '';
}

async function googleGenerateContent(model, body, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message || `Google AI request failed for model ${model}`);
    error.status = response.status || 500;
    throw error;
  }

  return data;
}

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

async function generateImageFromInterpretation(interpretation, apiKey) {
  const imageData = await googleGenerateContent(
    NANO_BANANA_MODEL,
    {
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE']
      },
      contents: [{
        parts: [
          { text: buildImagePrompt(interpretation) }
        ]
      }]
    },
    apiKey
  );

  const generated = extractTextAndImage(imageData);
  if (!generated.image) {
    const error = new Error('Nano Banana returned no image.');
    error.status = 500;
    throw error;
  }

  return generated;
}

async function interpretAndGenerate({ headers = {}, musicSummary, interpretation }) {
  if (!musicSummary && !interpretation) {
    const error = new Error('No music summary or interpretation provided');
    error.status = 400;
    throw error;
  }

  const apiKey = getEffectiveApiKey(headers);
  if (!apiKey) {
    const error = new Error(process.env.GOOGLE_API_KEY
      ? 'Server-managed AI access is restricted to localhost. For deployed/public use, provide your own Google AI Studio API key in the app.'
      : 'No Google AI Studio API key is available. Add GOOGLE_API_KEY for localhost use or provide your own key in the app.');
    error.status = 401;
    throw error;
  }

  let finalInterpretation = (interpretation || '').trim();

  if (!finalInterpretation) {
    const interpretationData = await googleGenerateContent(
      GEMINI_MODEL,
      {
        systemInstruction: { parts: [{ text: INTERPRETATION_PROMPT }] },
        contents: [{
          parts: [{ text: musicSummary }]
        }]
      },
      apiKey
    );

    finalInterpretation = extractText(interpretationData).trim();
    if (!finalInterpretation) {
      const error = new Error('Interpretation model returned no text.');
      error.status = 500;
      throw error;
    }
  }

  const generated = await generateImageFromInterpretation(finalInterpretation, apiKey);
  return {
    interpretation: finalInterpretation,
    caption: generated.text,
    image: generated.image,
    interpretationModel: GEMINI_MODEL,
    imageModel: NANO_BANANA_MODEL
  };
}

module.exports = {
  getConfig,
  getModels,
  interpretAndGenerate,
  isServerKeyAllowed
};

## Synesthetic Loop

Input image -> K-means on pixels -> pentatonic mapping -> audio score -> Gemini interpretation -> generated image

### Publishable credential setup

This repo is now safe to publish without shipping any shared API secret.

- Public/publishable mode: each visitor brings their own Google AI Studio API key in the app UI. The key is stored only in that browser's local storage and sent only when the user requests generation.
- Private/self-hosted mode: set `GOOGLE_API_KEY` on the server and the app will use that deployment-managed key automatically.

### Local run

1. Install dependencies with `npm install`.
2. Optional: create a `.env` file from `.env.example` if you want a server-managed key.
3. Start the app with `npm start`.
4. Open [http://localhost:3000](http://localhost:3000).

### Vercel deploy

Vercel serves the frontend as static files and uses the serverless handlers in `api/config.mjs` and `api/interpret.mjs` for AI requests.

- If you want a shared deployment key, add `GOOGLE_API_KEY` in the Vercel project environment variables.
- If you do not add one, users can still bring their own Google AI Studio key in the app UI.

### Google AI Studio

Create a personal API key in [Google AI Studio](https://aistudio.google.com/app/apikey).

### Environment variables

- `GOOGLE_API_KEY`: optional server-side Gemini key for private deployments
- `GEMINI_MODEL`: optional text model override, defaults to `gemini-2.5-flash`
- `NANO_BANANA_MODEL`: optional image model override, defaults to `gemini-3.1-flash-image-preview`

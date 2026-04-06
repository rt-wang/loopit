## Synesthetic Loop

Input image -> K-means on pixels -> pentatonic mapping -> audio score -> Gemini interpretation -> generated image

### Publishable credential setup

This repo is now safe to publish without shipping any shared API secret.

- Public/publishable mode: each visitor brings their own Google AI Studio API key in the app UI. The key is kept only in memory for the current tab and sent only when the user requests generation.
- Local/private mode: set `GOOGLE_API_KEY` on the server and the app will use that deployment-managed key for localhost requests.
- Safety guard: server-managed `GOOGLE_API_KEY` is restricted to localhost, so deployed/public hosts do not silently act as an open proxy for your quota.

### Local run

1. Install dependencies with `npm install`.
2. Optional: create a `.env` file from `.env.example` if you want a server-managed key.
3. Build the public frontend with `npm run build`.
4. Start the app with `npm start`.
5. Open [http://localhost:3000](http://localhost:3000).

### Vercel deploy

Vercel serves the frontend from the generated `public/` directory and uses the serverless handlers in `api/config.mjs` and `api/interpret.mjs` for AI requests.

1. Run `npm run build` before deploying so `public/` is up to date.
2. Deploy the repo to Vercel.
3. Users can bring their own Google AI Studio key in the app UI.

Notes:

- Do not rely on `GOOGLE_API_KEY` for public Vercel usage; the app intentionally restricts server-managed keys to localhost.
- If you add `GOOGLE_API_KEY` in Vercel anyway, the deployed app will still require per-user keys in the UI.

### Google AI Studio

Create a personal API key in [Google AI Studio](https://aistudio.google.com/app/apikey).

### Environment variables

- `GOOGLE_API_KEY`: optional server-side Google AI key for localhost/private use
- `GEMINI_MODEL`: optional text model override, defaults to `gemini-2.5-flash`
- `NANO_BANANA_MODEL`: optional image model override, defaults to `gemini-3.1-flash-image-preview`

### Build output

- Source files live at the repo root.
- Public deployment assets are copied into `public/` by `npm run build`.
- The Express server serves only `public/`, not the whole repository.

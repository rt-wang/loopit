# Synesthetic Loop

This project started as a fast experiment: take an image, cluster its colors, map those clusters into a pentatonic score, listen to the result, and then turn that music back into a new image. The first pass was built almost from scratch in one shot to proxy AI calls. I had a lengthy discussion with Claude to produce a design doc that we modified a couple times before implementation.

Very quickly, the interesting part stopped being the concept and became the edge cases. The first major slowdown was in the color pipeline. K-means was still doing too much work at full resolution, and score generation inherited that cost. The fix was to keep the whole musical analysis on a downsampled grid instead of pretending we needed every original pixel. That made the app feel much more like an instrument and less like a frozen tab.

The second big issue was audio. A lot of the “it hangs for 30 seconds” feeling was not actually music generation at all, but the browser refusing to unlock audio because `Tone.start()` had slipped outside the user gesture chain. Moving that call to the top of the click handler was one of those tiny changes that completely changed the experience.

Then the project shifted from “working locally” to “safe to publish.” The original server flow assumed a private API key. We changed that into a bring-your-own-key model for Google AI Studio, so a public deployment does not ship a shared secret. The app now hides the key-entry UI once a valid key is accepted, and only re-prompts if the API rejects it. That small UI detail ended up mattering because it changed the feel of the whole app from “developer tool” to “something a stranger could actually use.”

There was also a less glamorous but very real part of the process: operational cleanup. A swap file accidentally made it into a commit, GitHub push protection caught a secret, and the branch had to be rewritten cleanly. After that came deployment work: splitting API logic into Vercel-friendly functions, making routing explicit, and pushing configuration into `vercel.json` instead of trusting dashboard defaults. A lot of the project became not just “can this generate an image?” but “can this survive being moved from a local sketch into a public URL?”

The result is still intentionally scrappy. It is an art loop, not a polished product: image to music, music to interpretation, interpretation to image, then back again. But that loop is exactly what makes it compelling. Each fix changed not just reliability, but the character of the piece.

This project is also loosely inspired by Google’s recent TurboQuant paper: not because it implements that work directly, but because it shares the same energy of compressing rich signals into smaller, more structured forms without losing the thing that makes them interesting.

url for those who are interested in trying: https://synesthetic-loop.vercel.app/

## Surprises

Write your own notes here about what was unexpectedly hard, funny, fragile, or revealing during the process.

- 
- 
- 

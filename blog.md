# Synesthetic Loop

Synesthetic Loop started as a fast experiment: take an image, cluster its colors, map those clusters into a pentatonic score, listen to the result, and then turn that music back into a new image. The idea was loosely inspired by Google’s recent TurboQuant paper, which explores compression in KV caches through structured quantization.

The first version was built almost in one shot. I implemented a lightweight proxy layer for AI calls and worked through a design doc that I iterated on with Claude before moving into implementation.

Very quickly, the interesting part stopped being the concept and became the edge cases. The first major slowdown showed up in the color pipeline. Running K-means at full image resolution was doing far more work than the musical mapping actually needed, and score generation inherited that cost. The fix was simple but important: perform the musical analysis on a downsampled grid instead of pretending every original pixel mattered. After that change, the app immediately started to feel more like an instrument and less like a frozen tab.

Conceptually, the system treats pixels as signals and music as a transformation function over those signals. That creates a feedback loop where an autonomous agent can repeatedly reinterpret outputs and generate new variations indefinitely. In practice, though, early outputs were surprisingly similar to each other. With only five clusters driving the mapping, the system tended to preserve a consistent “vibe,” especially when the generated notes repeated harshly or too rigidly.

That observation pushed me to rethink the prompt and generation pipeline. Initially, I tried producing images from a combination of text descriptions and spectrogram representations of the music. The results were too constrained. Switching to text-only interpretation created more room for variation and produced much more interesting outputs.

I also expanded the musical layer. Instead of mapping clusters only to a simple melodic structure, I introduced chord and bass layers that still respected the original cluster relationships but added structure from basic music theory. The difference was immediate: the music sounded fuller while still staying faithful to the original image signal.

What started as a simple image-to-music experiment gradually became a looped reinterpretation system, where compression, abstraction, and regeneration all influence each other. The most surprising takeaway for me was how strongly repetition in the musical layer shapes visual regeneration downstream. Small changes in structure there ripple through the entire loop.

If you’d like to try it yourself:

https://synesthetic-loop.vercel.app/

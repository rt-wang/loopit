This is the description of the project:
The pipeline
Input image → K-means on pixels → Pentatonic mapping → Audio score → Multimodal LLM → Output image
You're right that this involves a multimodal model. Specifically, you'd use a model that accepts audio (or a visual representation of the score) and outputs a text description, which you then render. Claude doesn't process audio directly, but you have a few options: use the Gemini API which accepts audio natively, convert your audio to a spectrogram image and send that to any vision model, or send the structured text notation. The spectrogram route is actually elegant — it's itself a visual representation of sound, so you're going image → sound → image-of-sound → AI → new image. That's a rich chain of transformations to document.

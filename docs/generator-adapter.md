# Generation adapter contract

Set `MOTHLIGHT_GENERATOR` to the absolute path of an executable. Bun invokes it **without a shell**, writes one JSON request to stdin, and expects one JSON response on stdout. Send diagnostics to stderr. The timeout is 30 minutes. This adapter is trusted local operator code; end users cannot change its executable path through the API.

## Request

```json
{
  "jobId": "uuid",
  "kind": "image",
  "provider": "your-provider",
  "model": "your-model",
  "prompt": "The submitted generation prompt",
  "outputDirectory": "/absolute/job/work/directory",
  "shot": {
    "title": "A quiet revelation",
    "action": "The character notices an impossible reflection.",
    "camera": "Slow push in, medium close-up",
    "dialogue": "That isn't what happened.",
    "duration": 5,
    "negative_prompt": "",
    "continuity": "Keep the same coat and face."
  },
  "project": {"style": "A consistent illustrated sci-fi world", "fps": 24, "width": 1920, "height": 1080},
  "assets": [{"name": "Character", "kind": "character", "description": "", "prompt": "", "continuity": "", "referencePath": "/absolute/reference.png"}],
  "firstFrame": "/absolute/storyboard.png",
  "lastFrame": null
}
```

Records also contain IDs and additional production fields. `referencePath`, `firstFrame` and `lastFrame` are null when absent. The request's `prompt` is the submitted prompt; the adapter must decide how to combine it with project style, linked prompts, continuity, dialogue and camera direction. Do not discard those fields silently.

## Response

```json
{"outputPath":"/absolute/job/work/directory/result.mp4","cost":0.48}
```

`outputPath` must refer to a nonempty file no larger than 500 MB. Return **PNG** for an image job and **MP4** for a video job. `cost` must be a finite nonnegative number in USD, representing the actual reported generation cost. The studio copies the output to its media directory and retains the submitted request in the job record. Adapter work files are then removed.

Exit nonzero for a failure. Its stderr is displayed as the job's error. There is no automatic retry. If a provider request might already have been billed, use its job ID to reconcile before resubmitting. Model-specific capability checks, rate limits and asynchronous polling should live inside the adapter; return an explicit error when a model cannot accept a requested reference or duration.

## Minimal integration smoke adapter

The following tests the wiring using an existing file. It **does not generate anything** or call a model.

```ts
#!/usr/bin/env bun
const input = await new Response(Bun.stdin).json();
const source = process.env.MOTHLIGHT_ADAPTER_TEST_FILE;
if (!source) throw new Error('Set MOTHLIGHT_ADAPTER_TEST_FILE to a PNG or MP4 matching the requested job kind.');
console.error(`Importing a fixture for ${input.jobId}`);
console.log(JSON.stringify({outputPath: source, cost: 0}));
```

Save outside the repository as `adapter.ts`, make it executable (`chmod +x adapter.ts`), and configure its absolute path. For real generation, replace the fixture operation with your provider's SDK/API, keep credentials in the server environment, and wait for the provider to finish before returning.

The studio has built-in BytePlus Seedance video generation (see the README). Kling, Veo, ElevenLabs and language-model integrations can use this adapter boundary; first/last-frame support and other capabilities must be validated against the particular provider/model rather than implied by a generic UI.

# TEXVIC Video Worker

This worker turns a disposable worker runtime into a video-generation worker for TEXVIC.

## Providers

### Hosted LTX-2.3 (recommended)
The default provider is the public Hugging Face Space:

`Lightricks/LTX-2-3`

It exposes a Gradio API endpoint named `/generate_video`. The worker submits the TEXVIC prompt, waits for the hosted ZeroGPU generation to finish, downloads the MP4, and uploads it to TEXVIC.

Install:

```bash
pip install -r requirements.txt
```

Environment:

```bash
TEXVIC_URL=https://api.texvic.tech
VIDEO_WORKER_TOKEN=...
VIDEO_PROVIDER=ltx23-hf
LTX_SPACE=Lightricks/LTX-2-3
LTX_API_NAME=/generate_video
LTX_DURATION=3.0
LTX_ENHANCE_PROMPT=false
LTX_HIGH_RES=true
LTX_SEED=10
```

The official LTX-2.3 Space is a ZeroGPU Space. Hugging Face documents that public Spaces can be called through the Gradio API, while ZeroGPU usage is subject to daily quotas. The worker therefore keeps the TEXVIC job queue independent from the hosted provider so another provider can be swapped in later.

### ComfyUI
The previous ComfyUI worker remains supported:

```bash
VIDEO_PROVIDER=comfyui-colab
COMFYUI_URL=http://127.0.0.1:8188
WORKFLOW_FILE=workflow_api.json
```

Export a ComfyUI workflow in API format as `workflow_api.json`. Every `{{PROMPT}}` string is replaced with the TEXVIC job prompt.

## Security

Set `VIDEO_WORKER_TOKEN` to the same random secret configured in TEXVIC. Never commit the token or other secrets.

## Run

```bash
python texvic_worker.py
```

If the worker disconnects, another worker can claim the queued job later.

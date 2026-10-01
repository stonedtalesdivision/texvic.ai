# TEXVIC Cloud ComfyUI Worker

This worker turns a Google Colab + ComfyUI runtime into a disposable video-generation worker for TEXVIC.

## Environment

Set TEXVIC_URL, VIDEO_WORKER_TOKEN, COMFYUI_URL, and WORKFLOW_FILE.

The token must be at least 32 characters and match TEXVIC's VIDEO_WORKER_TOKEN.

## Workflow

Export a ComfyUI workflow in API format as workflow_api.json. Every "{{PROMPT}}" string is replaced with the TEXVIC job prompt.

The workflow should generate the base video, run the AI upscaler, and finish with an MP4/video output node.

The workflow is model-agnostic, so Wan/LTX workflows can be swapped without changing TEXVIC.

## Run

python texvic_worker.py

If Colab disconnects, another worker can resume later.

Never commit VIDEO_WORKER_TOKEN or other secrets.

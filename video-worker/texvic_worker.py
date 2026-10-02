#!/usr/bin/env python3
import json, os, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path

TEXVIC_URL = os.environ.get("TEXVIC_URL", "https://api.texvic.tech").rstrip("/")
WORKER_TOKEN = os.environ.get("VIDEO_WORKER_TOKEN", "")
VIDEO_PROVIDER = os.environ.get("VIDEO_PROVIDER", "ltx23-hf").strip().lower()
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
WORKFLOW_FILE = os.environ.get("WORKFLOW_FILE", "workflow_api.json")
LTX_SPACE = os.environ.get("LTX_SPACE", "Lightricks/LTX-2-3")
LTX_API_NAME = os.environ.get("LTX_API_NAME", "/generate_video")
LTX_DURATION = float(os.environ.get("LTX_DURATION", "3.0"))
LTX_ENHANCE_PROMPT = os.environ.get("LTX_ENHANCE_PROMPT", "false").lower() == "true"
LTX_HIGH_RES = os.environ.get("LTX_HIGH_RES", "true").lower() == "true"
LTX_SEED = int(os.environ.get("LTX_SEED", "10"))
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "5"))


def request_json(url, method="GET", payload=None, headers=None):
    body = None
    request_headers = dict(headers or {})
    if payload is not None:
        body = json.dumps(payload).encode()
        request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
        return response.status, json.loads(raw.decode()) if raw else {}


def worker_headers():
    return {"X-TEXVIC-WORKER-TOKEN": WORKER_TOKEN}


def texvic_status(job_id, status, error=None):
    payload = {"status": status}
    if error:
        payload["error"] = error
    request_json(
        f"{TEXVIC_URL}/api/video-worker/jobs/{urllib.parse.quote(job_id)}/status",
        "POST",
        payload,
        worker_headers(),
    )


def load_workflow(prompt):
    with open(WORKFLOW_FILE, encoding="utf-8") as handle:
        workflow = json.load(handle)

    def replace(value):
        if isinstance(value, str):
            return value.replace("{{PROMPT}}", prompt)
        if isinstance(value, list):
            return [replace(x) for x in value]
        if isinstance(value, dict):
            return {k: replace(v) for k, v in value.items()}
        return value

    return replace(workflow)


def submit_comfy_workflow(prompt):
    workflow = load_workflow(prompt)
    _, result = request_json(
        f"{COMFYUI_URL}/prompt",
        "POST",
        {"prompt": workflow, "client_id": str(uuid.uuid4())},
    )
    if not result.get("prompt_id"):
        raise RuntimeError(f"ComfyUI rejected workflow: {result}")
    return result["prompt_id"]


def find_video_output(history):
    for node_output in history.get("outputs", {}).values():
        for key in ("videos", "gifs", "images"):
            for item in node_output.get(key, []) or []:
                if item.get("filename"):
                    return {
                        "filename": item["filename"],
                        "subfolder": item.get("subfolder", ""),
                        "type": item.get("type", "output"),
                    }
    raise RuntimeError("ComfyUI completed but no media output was found.")


def wait_for_comfy(prompt_id):
    while True:
        try:
            _, history = request_json(
                f"{COMFYUI_URL}/history/{urllib.parse.quote(prompt_id)}"
            )
            item = history.get(prompt_id)
            if item and item.get("status", {}).get("completed"):
                if item.get("status", {}).get("status_str") == "error":
                    raise RuntimeError(str(item.get("status")))
                return find_video_output(item)
        except urllib.error.HTTPError:
            pass
        time.sleep(POLL_SECONDS)


def download_output(media):
    query = urllib.parse.urlencode(media)
    with urllib.request.urlopen(f"{COMFYUI_URL}/view?{query}", timeout=120) as response:
        return response.read()


def upload_output(job_id, data):
    url = f"{TEXVIC_URL}/api/video-worker/jobs/{urllib.parse.quote(job_id)}/output"
    req = urllib.request.Request(
        url,
        data=data,
        headers={**worker_headers(), "Content-Type": "video/mp4"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as response:
        return json.loads(response.read().decode())


def extract_result_path(result):
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        for key in ("path", "url", "video"):
            value = result.get(key)
            if isinstance(value, str):
                return value
    if isinstance(result, (list, tuple)):
        for value in result:
            path = extract_result_path(value)
            if path:
                return path
    return None


def generate_with_ltx(prompt):
    try:
        from gradio_client import Client
    except ImportError as exc:
        raise RuntimeError(
            "gradio_client is required for VIDEO_PROVIDER=ltx23-hf. "
            "Run: pip install -r requirements.txt"
        ) from exc

    print(f"[TEXVIC Worker] Connecting to Hugging Face Space {LTX_SPACE}")
    client = Client(LTX_SPACE)
    print(f"[TEXVIC Worker] Submitting LTX-2.3 job via {LTX_API_NAME}")

    result = client.predict(
        None,
        prompt,
        LTX_DURATION,
        LTX_ENHANCE_PROMPT,
        LTX_SEED,
        True,
        1536 if LTX_HIGH_RES else 768,
        1024 if LTX_HIGH_RES else 512,
        api_name=LTX_API_NAME,
    )

    output_path = extract_result_path(result)
    if not output_path:
        raise RuntimeError(f"LTX-2.3 returned an unexpected result: {result!r}")

    return output_path


def read_generated_file(output_path):
    path = Path(output_path)
    if path.exists():
        return path.read_bytes()

    if output_path.startswith(("http://", "https://")):
        with urllib.request.urlopen(output_path, timeout=300) as response:
            return response.read()

    raise RuntimeError(f"LTX-2.3 returned a file path that does not exist: {output_path}")


def run_ltx(job):
    texvic_status(job["id"], "GENERATING")
    output_path = generate_with_ltx(job["prompt"])

    texvic_status(job["id"], "DOWNLOADING")
    mp4 = read_generated_file(output_path)

    if len(mp4) < 1024:
        raise RuntimeError("LTX-2.3 output is too small to be a valid video.")

    texvic_status(job["id"], "PROCESSING")
    print(f"[TEXVIC Worker] Uploading LTX output {len(mp4) / 1048576:.1f} MB")
    upload_output(job["id"], mp4)


def run_comfy(job):
    texvic_status(job["id"], "GENERATING")
    prompt_id = submit_comfy_workflow(job["prompt"])

    texvic_status(job["id"], "DOWNLOADING")
    media = wait_for_comfy(prompt_id)

    texvic_status(job["id"], "PROCESSING")
    mp4 = download_output(media)

    if len(mp4) < 1024:
        raise RuntimeError("Downloaded output is too small.")

    print(f"[TEXVIC Worker] Uploading ComfyUI output {len(mp4) / 1048576:.1f} MB")
    upload_output(job["id"], mp4)


def run_once():
    status, result = request_json(
        f"{TEXVIC_URL}/api/video-worker/claim",
        headers=worker_headers(),
    )
    if status == 204 or not result.get("job"):
        return False

    job = result["job"]
    job_id = job["id"]
    # Use the worker-selected provider so jobs created before a provider switch can be resumed safely.
    provider = VIDEO_PROVIDER or str(job.get("provider") or "").lower()

    print(
        f"[TEXVIC Worker] Claimed {job_id} for Reel {job['reel_id']} "
        f"(provider={provider})"
    )

    try:
        if provider in ("ltx23-hf", "ltx-2.3-hf", "huggingface-ltx23"):
            run_ltx(job)
        elif provider in ("comfyui-colab", "comfyui"):
            run_comfy(job)
        else:
            raise RuntimeError(f"Unsupported video provider: {provider}")

        print(f"[TEXVIC Worker] READY {job_id}")
        return True
    except Exception as exc:
        error_text = str(exc)
        hosted_gpu_unavailable = (
            provider in ("ltx23-hf", "ltx-2.3-hf", "huggingface-ltx23")
            and (
                "No GPU was available" in error_text
                or "ZeroGPU" in error_text
                or "GPU was not available" in error_text
            )
        )

        if hosted_gpu_unavailable:
            print(f"[TEXVIC Worker] Hosted LTX GPU unavailable; re-queueing {job_id}")
            try:
                texvic_status(
                    job_id,
                    "QUEUED",
                    "Hosted LTX GPU temporarily unavailable; job re-queued."
                )
            except Exception as report_error:
                print(f"[TEXVIC Worker] Could not re-queue job: {report_error}")
        else:
            print(f"[TEXVIC Worker] FAILED {job_id}: {exc}")
            try:
                texvic_status(job_id, "FAILED", error_text)
            except Exception as report_error:
                print(f"[TEXVIC Worker] Could not report failure: {report_error}")
        return True


if __name__ == "__main__":
    if len(WORKER_TOKEN) < 32:
        raise SystemExit("VIDEO_WORKER_TOKEN must be at least 32 characters.")

    print(
        f"[TEXVIC Worker] Connected to {TEXVIC_URL} "
        f"(provider={VIDEO_PROVIDER}, ltx_space={LTX_SPACE})"
    )

    while True:
        if not run_once():
            time.sleep(POLL_SECONDS)

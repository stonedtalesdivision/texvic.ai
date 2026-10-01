#!/usr/bin/env python3
import json, os, time, urllib.error, urllib.parse, urllib.request, uuid

TEXVIC_URL = os.environ.get("TEXVIC_URL", "https://api.texvic.tech").rstrip("/")
WORKER_TOKEN = os.environ.get("VIDEO_WORKER_TOKEN", "")
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
WORKFLOW_FILE = os.environ.get("WORKFLOW_FILE", "workflow_api.json")
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
    if error: payload["error"] = error
    request_json(f"{TEXVIC_URL}/api/video-worker/jobs/{urllib.parse.quote(job_id)}/status",
                 "POST", payload, worker_headers())

def load_workflow(prompt):
    with open(WORKFLOW_FILE, encoding="utf-8") as handle:
        workflow = json.load(handle)
    def replace(value):
        if isinstance(value, str): return value.replace("{{PROMPT}}", prompt)
        if isinstance(value, list): return [replace(x) for x in value]
        if isinstance(value, dict): return {k: replace(v) for k, v in value.items()}
        return value
    return replace(workflow)

def submit_comfy_workflow(prompt):
    workflow = load_workflow(prompt)
    _, result = request_json(f"{COMFYUI_URL}/prompt", "POST",
                             {"prompt": workflow, "client_id": str(uuid.uuid4())})
    if not result.get("prompt_id"): raise RuntimeError(f"ComfyUI rejected workflow: {result}")
    return result["prompt_id"]

def find_video_output(history):
    for node_output in history.get("outputs", {}).values():
        for key in ("videos", "gifs", "images"):
            for item in node_output.get(key, []) or []:
                if item.get("filename"):
                    return {"filename": item["filename"], "subfolder": item.get("subfolder", ""),
                            "type": item.get("type", "output")}
    raise RuntimeError("ComfyUI completed but no media output was found.")

def wait_for_comfy(prompt_id):
    while True:
        try:
            _, history = request_json(f"{COMFYUI_URL}/history/{urllib.parse.quote(prompt_id)}")
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
    req = urllib.request.Request(url, data=data,
        headers={**worker_headers(), "Content-Type": "video/mp4"}, method="POST")
    with urllib.request.urlopen(req, timeout=300) as response:
        return json.loads(response.read().decode())

def run_once():
    status, result = request_json(f"{TEXVIC_URL}/api/video-worker/claim", headers=worker_headers())
    if status == 204 or not result.get("job"): return False
    job = result["job"]; job_id = job["id"]
    print(f"[TEXVIC Worker] Claimed {job_id} for Reel {job['reel_id']}")
    try:
        texvic_status(job_id, "GENERATING")
        prompt_id = submit_comfy_workflow(job["prompt"])
        texvic_status(job_id, "DOWNLOADING")
        media = wait_for_comfy(prompt_id)
        texvic_status(job_id, "PROCESSING")
        mp4 = download_output(media)
        if len(mp4) < 1024: raise RuntimeError("Downloaded output is too small.")
        print(f"[TEXVIC Worker] Uploading {len(mp4)/1048576:.1f} MB")
        upload_output(job_id, mp4)
        print(f"[TEXVIC Worker] READY {job_id}")
        return True
    except Exception as exc:
        print(f"[TEXVIC Worker] FAILED {job_id}: {exc}")
        try: texvic_status(job_id, "FAILED", str(exc))
        except Exception as report_error: print(f"[TEXVIC Worker] Could not report failure: {report_error}")
        return True

if __name__ == "__main__":
    if len(WORKER_TOKEN) < 32: raise SystemExit("VIDEO_WORKER_TOKEN must be at least 32 characters.")
    print(f"[TEXVIC Worker] Connected to {TEXVIC_URL}")
    while True:
        if not run_once(): time.sleep(POLL_SECONDS)

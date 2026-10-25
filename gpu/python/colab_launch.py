#@title 6. Start the pipeline GPU worker (uses compute units)
import os
import shlex
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import json
from pathlib import Path
from google.colab import userdata, runtime

# Same look as the GPU worker's log lines: time, icon, message.
STARTED = time.time()
def say(icon, text, colour="36"):
    print(f"\x1b[2m{time.strftime('%H:%M:%S')}\x1b[0m \x1b[{colour}m{icon}\x1b[0m {text}", flush=True)
def step(text): say("›", text)
def done(text): say("✓", f"{text} \x1b[2m({time.time() - STARTED:.0f}s)\x1b[0m", "32")
def show_tail(name, path, lines=20):
    try:
        content = Path(path).read_text(errors="replace").rstrip().splitlines()[-lines:]
    except OSError:
        return
    say("✗", f"{name} log, last {len(content)} lines ({path}):", "31")
    for line in content:
        print(f"\x1b[2m           │ {line[:200]}\x1b[0m")

COLAB_LLM_MODEL = "Qwen/Qwen3.6-27B" #@param ["Qwen/Qwen3.6-27B", "Qwen/Qwen3.5-9B"]
CONTINUITY_STRATEGY = "reference-video" #@param ["reference-video", "latent"]
# Latent mode is available for GPU evaluation; no quality winner is selected yet.
IDLE_MINUTES = 20 #@param {type:"integer"}
RENDER_QUALITY = "1080p" #@param ["1080p", "720p"]
# 720p renders faster for testing the pipeline; final films use 1080p.
TIMEZONE = "Asia/Dhaka" #@param {type:"string"}
# Log times use this zone; Colab itself runs on UTC.
os.environ["TZ"] = TIMEZONE
time.tzset()
VOICE_MIN_SIMILARITY = "" #@param {type:"string"}
# Leave the threshold empty until calibrated against approved voice samples.
# Uncalibrated voices need owner review, without automatic retakes.
for name in ["STUDIO_URL", "GPU_KEY", "HF_TOKEN"]:
    try:
        os.environ[name] = userdata.get(name)
    except Exception:
        if name != "HF_TOKEN":
            raise RuntimeError(f"Add {name} in Colab Secrets and allow notebook access")
COMFY_LOG = "/tmp/pipeline-comfy.log"
MODEL_LOG = "/tmp/pipeline-model.log"
os.environ["COMFY_LOG_FILE"] = COMFY_LOG
os.environ["MODEL_LOG_FILE"] = MODEL_LOG
os.environ["PIPELINE_WORK_DIR"] = "/content/drama-runtime"
os.environ["COMFY_OUTPUT_DIR"] = "/content/drama-comfy-output"
os.environ["COMFY_INPUT_DIR"] = "/content/drama-comfy-input"
for directory in [os.environ["COMFY_OUTPUT_DIR"], os.environ["COMFY_INPUT_DIR"]]:
    Path(directory).mkdir(parents=True, exist_ok=True)
os.environ["COLAB_LLM_MODEL"] = COLAB_LLM_MODEL
os.environ["IDLE_MINUTES"] = str(IDLE_MINUTES)
os.environ["CONTINUITY_STRATEGY"] = CONTINUITY_STRATEGY
os.environ["RENDER_SHORT_SIDE"] = RENDER_QUALITY.rstrip("p")
# Validate the remote GPU key/bypass before installing the second model environment.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None
step("Checking the studio connection")
studio_url = os.environ["STUDIO_URL"].rstrip("/")
parsed_url = urllib.parse.urlsplit(studio_url)
if parsed_url.scheme != "https" or not parsed_url.netloc or parsed_url.path or parsed_url.query or parsed_url.fragment or parsed_url.username:
    raise RuntimeError("STUDIO_URL must be the HTTPS studio origin without a path")
try:
    request = urllib.request.Request(studio_url + "/api/gpu/health", data=b"{}", headers={"Content-Type": "application/json", "X-GPU-Key": os.environ["GPU_KEY"], "User-Agent": "Drama-Pipeline-Colab"})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
        health = json.load(response)
    if health.get("protocol", 0) < 2:
        raise RuntimeError("Deploy the current pipeline backend before running this notebook")
except Exception:
    raise RuntimeError("Studio GPU preflight failed. Check STUDIO_URL, GPU_KEY and the /api/gpu/* Access bypass. Credentials are not printed.") from None
done(f"Studio reachable: {parsed_url.netloc}")
if VOICE_MIN_SIMILARITY.strip():
    float(VOICE_MIN_SIMILARITY)
    os.environ["VOICE_MIN_SIMILARITY"] = VOICE_MIN_SIMILARITY
if sys.version_info < (3, 11):
    raise RuntimeError("The local model environment requires Python 3.11 or newer")
step("Installing the model environment (Qwen, FLUX.2 Klein, Whisper); a few minutes on first run")
venv = "/content/drama-model-env"
# Colab's Python has no python3.X-venv package (ensurepip is missing), so stdlib venv fails; virtualenv bundles pip.
subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "virtualenv"], check=True)
subprocess.run([sys.executable, "-m", "virtualenv", "--quiet", "--system-site-packages", venv], check=True)
python = f"{venv}/bin/python"
# Quiet pip keeps the cell readable; the full output is shown only when the install fails.
install = subprocess.run([python, "-m", "pip", "install", "--quiet", "--upgrade", "-r", f"{STUDIO_DIR}/gpu/python/requirements.txt"], capture_output=True, text=True)
if install.returncode != 0:
    print(install.stdout[-4000:], install.stderr[-4000:])
    raise RuntimeError("Model environment install failed; see the pip output above")
with open("/content/drama-model-versions.txt", "w") as versions:
    subprocess.run([python, "-m", "pip", "freeze"], check=True, stdout=versions)
done("Model environment ready")
# Keep the original notebook's H3 flags, with argument-list execution.
flags = shlex.split(COMFY_EXTRA_ARGS if "COMFY_EXTRA_ARGS" in globals() else "--reserve-vram 2")
comfy = model_server = worker = None

def wait_for(name, url, process, log_path):
    for _ in range(180):
        if process.poll() is not None:
            show_tail(name, log_path)
            raise RuntimeError(f"{name} stopped while starting; see its log above")
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(2)
    show_tail(name, log_path)
    raise RuntimeError(f"{name} did not start within 6 minutes; see its log above")

if CONTINUITY_STRATEGY == "latent":
    node_dir = Path(COMFY_DIR) / "custom_nodes" / "ComfyUI-H3-Motion-Context"
    revision = "518c083d11d80fa5920222ad89889924ee4401c9"
    if not node_dir.exists():
        subprocess.run(["git", "clone", "--no-checkout", "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git", str(node_dir)], check=True)
    subprocess.run(["git", "-C", str(node_dir), "fetch", "--depth", "1", "origin", revision], check=True)
    subprocess.run(["git", "-C", str(node_dir), "checkout", "--detach", revision], check=True)

try:
    step("Starting ComfyUI and the local model server")
    comfy = subprocess.Popen([sys.executable, "main.py", "--listen", "127.0.0.1", "--port", "8188", "--disable-auto-launch", "--output-directory", os.environ["COMFY_OUTPUT_DIR"], "--input-directory", os.environ["COMFY_INPUT_DIR"], "--max-upload-size", "1024", *flags], cwd=COMFY_DIR, stdout=open(COMFY_LOG, "w"), stderr=subprocess.STDOUT)
    model_server = subprocess.Popen([python, f"{STUDIO_DIR}/gpu/python/model_server.py"], cwd=STUDIO_DIR, stdout=open(MODEL_LOG, "w"), stderr=subprocess.STDOUT, env=os.environ.copy())
    wait_for("ComfyUI", "http://127.0.0.1:8188/system_stats", comfy, COMFY_LOG)
    done("ComfyUI ready")
    wait_for("Model server", "http://127.0.0.1:8000/health", model_server, MODEL_LOG)
    done("Model server ready")
    if CONTINUITY_STRATEGY == "latent":
        for node in ["MiniMaxH3MotionContext", "MiniMaxH3MotionContextTrim", "MiniMaxH3MotionContextSaveLatent", "MiniMaxH3MotionContextLoadLatent"]:
            with urllib.request.urlopen("http://127.0.0.1:8188/object_info/" + node, timeout=30) as response:
                if node not in json.load(response):
                    show_tail("ComfyUI", COMFY_LOG)
                    raise RuntimeError("Motion Context nodes failed to load; see the ComfyUI log above")
    say("●", f"GPU worker running. Open {studio_url} to work on your project. Compute units are being used.", "33")
    worker = subprocess.Popen(["npm", "--workspace", "gpu", "start"], cwd=STUDIO_DIR, env=os.environ.copy())
    if worker.wait() != 0:
        raise RuntimeError("GPU worker stopped with an error; see the red lines above")
    say("■", "Worker finished. Deleting the runtime to stop compute-unit usage.", "33")
    runtime.unassign()
finally:
    for process in [worker, model_server, comfy]:
        if process is not None and process.poll() is None:
            process.terminate()

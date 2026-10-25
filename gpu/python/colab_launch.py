#@title 7. Start the pipeline GPU worker (uses compute units)
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

COLAB_LLM_MODEL = "Qwen/Qwen3.6-27B" #@param ["Qwen/Qwen3.6-27B", "Qwen/Qwen3.5-9B"]
CONTINUITY_STRATEGY = "reference-video" #@param ["reference-video", "latent"]
# Latent mode is available for GPU evaluation; no quality winner is selected yet.
IDLE_MINUTES = 20 #@param {type:"integer"}
VOICE_MIN_SIMILARITY = "" #@param {type:"string"}
# Leave the threshold empty until calibrated against approved voice samples.
# Uncalibrated voices need owner review, without automatic retakes.
for name in ["STUDIO_URL", "GPU_KEY", "HF_TOKEN"]:
    try:
        os.environ[name] = userdata.get(name)
    except Exception:
        if name != "HF_TOKEN":
            raise RuntimeError(f"Add {name} in Colab Secrets and allow notebook access")
os.environ["PIPELINE_WORK_DIR"] = "/content/drama-runtime"
os.environ["COMFY_OUTPUT_DIR"] = "/content/drama-comfy-output"
os.environ["COMFY_INPUT_DIR"] = "/content/drama-comfy-input"
for directory in [os.environ["COMFY_OUTPUT_DIR"], os.environ["COMFY_INPUT_DIR"]]:
    Path(directory).mkdir(parents=True, exist_ok=True)
os.environ["COLAB_LLM_MODEL"] = COLAB_LLM_MODEL
os.environ["IDLE_MINUTES"] = str(IDLE_MINUTES)
os.environ["CONTINUITY_STRATEGY"] = CONTINUITY_STRATEGY
# Validate the remote GPU key/bypass before installing the second model environment.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None
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
if VOICE_MIN_SIMILARITY.strip():
    float(VOICE_MIN_SIMILARITY)
    os.environ["VOICE_MIN_SIMILARITY"] = VOICE_MIN_SIMILARITY
if sys.version_info < (3, 11):
    raise RuntimeError("The local model environment requires Python 3.11 or newer")
venv = "/content/drama-model-env"
subprocess.run([sys.executable, "-m", "venv", "--system-site-packages", venv], check=True)
python = f"{venv}/bin/python"
subprocess.run([python, "-m", "pip", "install", "--upgrade", "-r", f"{STUDIO_DIR}/gpu/python/requirements.txt"], check=True)
with open("/content/drama-model-versions.txt", "w") as versions:
    subprocess.run([python, "-m", "pip", "freeze"], check=True, stdout=versions)
# Keep the original notebook's H3 flags, with argument-list execution.
flags = shlex.split(COMFY_EXTRA_ARGS if "COMFY_EXTRA_ARGS" in globals() else "--reserve-vram 2")
comfy = model_server = worker = None

def wait_for(url, process):
    for _ in range(180):
        if process.poll() is not None:
            raise RuntimeError("Local service stopped; inspect /tmp/pipeline-comfy.log or /tmp/pipeline-model.log")
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(2)
    raise RuntimeError("Local service startup timed out")

if CONTINUITY_STRATEGY == "latent":
    node_dir = Path(COMFY_DIR) / "custom_nodes" / "ComfyUI-H3-Motion-Context"
    revision = "518c083d11d80fa5920222ad89889924ee4401c9"
    if not node_dir.exists():
        subprocess.run(["git", "clone", "--no-checkout", "https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git", str(node_dir)], check=True)
    subprocess.run(["git", "-C", str(node_dir), "fetch", "--depth", "1", "origin", revision], check=True)
    subprocess.run(["git", "-C", str(node_dir), "checkout", "--detach", revision], check=True)

try:
    comfy = subprocess.Popen([sys.executable, "main.py", "--listen", "127.0.0.1", "--port", "8188", "--disable-auto-launch", "--output-directory", os.environ["COMFY_OUTPUT_DIR"], "--input-directory", os.environ["COMFY_INPUT_DIR"], "--max-upload-size", "1024", *flags], cwd=COMFY_DIR, stdout=open("/tmp/pipeline-comfy.log", "w"), stderr=subprocess.STDOUT)
    model_server = subprocess.Popen([python, f"{STUDIO_DIR}/gpu/python/model_server.py"], cwd=STUDIO_DIR, stdout=open("/tmp/pipeline-model.log", "w"), stderr=subprocess.STDOUT, env=os.environ.copy())
    wait_for("http://127.0.0.1:8188/system_stats", comfy)
    wait_for("http://127.0.0.1:8000/health", model_server)
    if CONTINUITY_STRATEGY == "latent":
        for node in ["MiniMaxH3MotionContext", "MiniMaxH3MotionContextTrim", "MiniMaxH3MotionContextSaveLatent", "MiniMaxH3MotionContextLoadLatent"]:
            with urllib.request.urlopen("http://127.0.0.1:8188/object_info/" + node, timeout=30) as response:
                if node not in json.load(response):
                    raise RuntimeError("Motion Context nodes failed to load; inspect the ComfyUI startup log")
    print("GPU connected. Open the private studio to review your script. Compute units are being consumed.")
    worker = subprocess.Popen(["npm", "--workspace", "gpu", "start"], cwd=STUDIO_DIR, env=os.environ.copy())
    if worker.wait() != 0:
        raise RuntimeError("GPU worker stopped with an error; fix configuration before rerunning")
    print("Idle timeout reached. Deleting runtime to stop compute-unit usage.")
    runtime.unassign()
finally:
    for process in [worker, model_server, comfy]:
        if process is not None and process.poll() is None:
            process.terminate()

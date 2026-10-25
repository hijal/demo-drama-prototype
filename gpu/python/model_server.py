"""Colab-local, lazy-loaded models. No hosted inference; no public listener."""
import base64
import gc
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MODELS = ("Qwen/Qwen3.6-27B", "Qwen/Qwen3.5-9B")
MAX_BODY = 32 * 1024 * 1024
ROOT = Path(os.environ.get("PIPELINE_WORK_DIR", "/content/drama-runtime")).resolve()


def decode_image(value):
    if not isinstance(value, str) or not value.startswith("data:image/") or ";base64," not in value:
        raise ValueError("Only inline image data is accepted; remote image URLs are disabled")
    raw = base64.b64decode(value.split(";base64,", 1)[1], validate=True)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("Image exceeds 8 MB")
    from PIL import Image
    image = Image.open(io.BytesIO(raw))
    if image.width * image.height > 40_000_000:
        raise ValueError("Image dimensions too large")
    image = image.convert("RGB")
    image.thumbnail((1536, 1536))
    return image


def encode_image(image):
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode()


def messages_for_processor(messages):
    if not isinstance(messages, list) or len(messages) > 32:
        raise ValueError("Invalid messages")
    result = []
    for message in messages:
        if message.get("role") not in ("system", "user", "assistant"):
            raise ValueError("Unsupported message role")
        content = message.get("content")
        if isinstance(content, str):
            result.append({"role": message["role"], "content": content})
            continue
        if not isinstance(content, list) or len(content) > 24:
            raise ValueError("Invalid message content")
        converted = []
        for item in content:
            if item.get("type") == "text":
                converted.append({"type": "text", "text": str(item.get("text", ""))})
            elif item.get("type") == "image_url":
                converted.append({"type": "image", "image": decode_image(item["image_url"]["url"])})
            else:
                raise ValueError("Unsupported multimodal content")
        result.append({"role": message["role"], "content": converted})
    return result


def local_file(name):
    path = (ROOT / str(name)).resolve()
    if ROOT not in path.parents or not path.is_file():
        raise ValueError("File must exist inside PIPELINE_WORK_DIR")
    return path


class Runtime:
    def __init__(self):
        self.lock = threading.RLock()
        self.loaded = None
        self.model = None
        self.processor = None

    def release(self):
        with self.lock:
            self.model = self.processor = None
            self.loaded = None
            gc.collect()
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
        return {"released": True}

    def chat(self, request):
        import torch
        from transformers import AutoProcessor, Qwen3_5ForConditionalGeneration, BitsAndBytesConfig
        name = request.get("model", MODELS[0])
        if name not in MODELS:
            raise ValueError("Unsupported local model")
        messages = messages_for_processor(request.get("messages"))
        with self.lock:
            if self.loaded != name:
                self.release()
                if not torch.cuda.is_available():
                    raise RuntimeError("A CUDA Colab runtime is required")
                dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
                quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=dtype)
                # No trust_remote_code; native Transformers architecture only.
                self.processor = AutoProcessor.from_pretrained(name)
                self.model = Qwen3_5ForConditionalGeneration.from_pretrained(name, quantization_config=quant, device_map="auto", dtype=dtype)
                self.loaded = name
            inputs = self.processor.apply_chat_template(messages, tokenize=True, add_generation_prompt=True, return_dict=True, return_tensors="pt", enable_thinking=False).to(self.model.device)
            if inputs["input_ids"].shape[-1] > 32000:
                raise ValueError("Input is too long; process one episode at a time")
            budget = max(1, min(16000, int(request.get("max_tokens", 12000))))
            with torch.inference_mode():
                output = self.model.generate(**inputs, max_new_tokens=budget, do_sample=False)
            tokens = output[0][inputs["input_ids"].shape[-1]:]
            text = self.processor.decode(tokens, skip_special_tokens=True)
            reason = "length" if len(tokens) >= budget else "stop"
            return {"choices": [{"message": {"role": "assistant", "content": text}, "finish_reason": reason}], "model": name}

    def image(self, request):
        import torch
        from diffusers import Flux2KleinPipeline
        with self.lock:
            if self.loaded != "klein":
                self.release()
                self.model = Flux2KleinPipeline.from_pretrained("black-forest-labs/FLUX.2-klein-9B", torch_dtype=torch.bfloat16)
                self.model.enable_model_cpu_offload()
                self.loaded = "klein"
            options = {"prompt": str(request["prompt"])[:12000], "width": 1024, "height": 1024, "num_inference_steps": 4, "guidance_scale": 1.0, "generator": torch.Generator(device="cuda").manual_seed(int(request.get("seed", 0)))}
            if request.get("reference"):
                options["image"] = decode_image(request["reference"])
            image = self.model(**options).images[0]
            return {"image": encode_image(image)}

    def transcribe(self, request):
        from faster_whisper import WhisperModel
        with self.lock:
            self.release()
            self.model = WhisperModel("large-v3", device="cuda", compute_type="float16")
            self.loaded = "whisper"
            segments, info = self.model.transcribe(str(local_file(request["file"])), word_timestamps=True, beam_size=5, vad_filter=True)
            words = [{"word": word.word.strip(), "start": word.start, "end": word.end} for segment in segments for word in (segment.words or [])]
            return {"words": words, "language": info.language}

    def voice(self, request):
        import torch
        import torchaudio
        from speechbrain.inference.speaker import EncoderClassifier
        with self.lock:
            if self.loaded != "voice":
                self.release()
                self.model = EncoderClassifier.from_hparams(source="speechbrain/spkrec-ecapa-voxceleb", savedir=str(ROOT / "voice-model"), run_opts={"device": "cuda"})
                self.loaded = "voice"
            def embed(filename):
                waveform, rate = torchaudio.load(str(local_file(filename)))
                waveform = waveform.mean(dim=0, keepdim=True)
                waveform = torchaudio.functional.resample(waveform, rate, 16000)
                if waveform.shape[-1] < 16000:
                    raise ValueError("Voice segment must contain at least one second")
                with torch.inference_mode():
                    return self.model.encode_batch(waveform.to("cuda")).flatten()
            a, b = embed(request["reference"]), embed(request["sample"])
            return {"similarity": torch.nn.functional.cosine_similarity(a, b, dim=0).item()}


RUNTIME = Runtime()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Request URLs and bodies can contain private data.

    def send(self, status, value):
        raw = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == "/v1/models":
            self.send(200, {"data": [{"id": name} for name in MODELS]})
        elif self.path == "/health":
            self.send(200, {"ok": True, "loaded": RUNTIME.loaded})
        else:
            self.send(404, {"error": "Route not found"})

    def do_POST(self):
        try:
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json" or self.headers.get("Origin"):
                self.send(403, {"error": "Only local programmatic JSON requests are accepted"})
                return
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                self.send(413, {"error": "Body missing or too large"})
                return
            request = json.loads(self.rfile.read(length))
            routes = {"/v1/chat/completions": RUNTIME.chat, "/image": RUNTIME.image, "/transcribe": RUNTIME.transcribe, "/voice": RUNTIME.voice, "/release": lambda _: RUNTIME.release()}
            if self.path not in routes:
                self.send(404, {"error": "Route not found"})
                return
            self.send(200, routes[self.path](request))
        except (ValueError, KeyError, TypeError):
            self.send(400, {"error": "Invalid model request; inspect input format"})
        except Exception as error:
            # Class name is useful for OOM/version failures; no prompt/token/error body.
            self.send(503, {"error": "Local model execution failed", "kind": type(error).__name__})
            RUNTIME.release()


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    print("Colab model server listening on loopback port 8000", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()

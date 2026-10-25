# Colab-only LLM decision

Owner decision, 2026-10-25: all model inference must run locally in Colab. No paid Hugging Face Router or other inference API. Hugging Face may still host downloaded weights. Colab compute units remain a cost; no runtime has been launched for this evaluation.

## Candidates

| Candidate | Planned role | What remains unverified |
| --- | --- | --- |
| Qwen3.6-27B | First quality candidate for script fixing, prompt writing and image QA; try 4-bit weights | Actual GPU compatibility, peak memory, repair quality and speed |
| Qwen3.5-9B | Smaller alternative for the same tasks | Whether quality is sufficient on the owner's scripts and frames |

Both official model cards list image/text input and Apache-2.0 licensing. Neither is a measured winner for this project. A 27B model has roughly 13.5 GB of raw 4-bit parameter data by arithmetic; this is **not** its total memory requirement. Quantization metadata, unquantized layers, vision processing, KV cache and inference engine allocations add overhead. Do not infer a successful fit from this estimate.

Sources checked on 2026-10-25:

- [Qwen3.6-27B official model card](https://huggingface.co/Qwen/Qwen3.6-27B): text/image support and local Transformers/vLLM examples.
- [Qwen3.5-9B official model card](https://huggingface.co/Qwen/Qwen3.5-9B): smaller text/image candidate.
- [Transformers Qwen3.5 documentation](https://huggingface.co/docs/transformers/en/model_doc/qwen3_5): shared architecture support, including Qwen3.6-27B.
- [Transformers bitsandbytes documentation](https://huggingface.co/docs/transformers/en/quantization/bitsandbytes): 4-bit loading and hardware requirements. Verify support on the actual Colab GPU before selecting a backend.
- [Colab FAQ](https://research.google.com/colaboratory/faq.html): resource availability varies; a paid plan does not guarantee a particular GPU.

## Integration

Use a separate Python environment for the LLM, preserving the working ComfyUI installation. First evaluate a standalone local model server before integrating it into the video notebook. Do not install a speculative inference stack into the working H3 environment.

Expose OpenAI-compatible `/v1/models` and `/v1/chat/completions` on loopback port 8000. The current TypeScript client and CLI support text messages for script fixing. Frame/image requests, the separate Python server, model release and the leased Cloudflare job protocol are now implemented; actual GPU execution remains unverified. The bundled server lists supported on-demand candidates and switches models serially; it does not query the HF catalogue.

Use a single GPU job lock. Finish script/prompt tasks, unload the LLM, then load H3/Klein. For QA, release rendering models, load the VLM and process a batch of frames. On failure, clean up the failed model before switching. Do not assume simultaneous H3/Klein/LLM residency. The existing video notebook currently retains models in VRAM; explicit unload integration is implemented but must be measured before these workflows share a runtime.

Cloudflare stores and queues script/QA jobs; Colab executes them and returns results. Script repair waits while Colab is offline. Reviewing existing results does not need the GPU. Download credentials must not be forwarded as local inference credentials.

## Evaluation before choosing a winner

1. Record the actual GPU, VRAM, Python/CUDA and inference-library versions. Confirm a small synthetic text request, then an image request. Record model revision, quantization and generation settings.
2. Run the existing fixer on private Jungle Episode 01, with the shared cast, locally in the same runtime. Write private results outside the checkout. Keep the original untouched.
3. Measure cold load, warm repair time, peak memory, validation errors, retries and output truncation. Review dialogue preservation and invented character descriptions with the owner.
4. Unload the model and repeat the same input/settings with the other candidate. Compare outputs from separate review folders; no simultaneous model loading is required.
5. Test frame QA on owner-approved good/bad examples. Measure false passes and false rejections. Image support alone does not establish QA reliability.
6. Test switching between H3 and the LLM repeatedly. Include the loading/unloading overhead in per-episode time and compute-unit estimates. The previous assumption of zero GPU cost for QA no longer applies.

Phase 1 remains in progress until actual model evaluation succeeds and the owner approves the repaired script. At the end of the GPU session, use **Disconnect and delete runtime** to stop compute-unit consumption.

See [pipeline setup](PIPELINE_SETUP.md) and `Drama_Pipeline_Colab.ipynb` for the implemented launcher and acceptance gaps.

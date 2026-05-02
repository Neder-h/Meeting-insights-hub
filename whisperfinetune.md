# Whisper Fine-Tuning Platform — End-to-End Report (Notebooks 1–3)

## Executive Summary

This report documents the complete work carried out in this project to fine-tune **OpenAI Whisper Large-v3** for **Tunisian Arabic automatic speech recognition (ASR)**, including data preparation, Kaggle multi‑GPU training stabilization, and Lightning.ai H200 single‑GPU training optimization.

The implementation is organized into three notebooks:
- **Notebook 1**: dataset preparation (audio standardization, feature extraction, label/token preparation) and export of a reusable processed dataset.
- **Notebook 2**: Kaggle **2×T4** training track focused on *stability under tight VRAM constraints* (FSDP/torchrun) and iterative debugging of CUDA/runtime failures.
- **Notebook 3**: Lightning.ai **H200** training track focused on *speed, reproducibility, and operational robustness* (bf16, fused AdamW, SDPA/Flash-Attn fallback, dataloader and evaluation hardening, export pipeline).

This document is designed to be directly integrated into a broader PFE platform report (architecture, UI/API, deployment, etc.).

---

## 1. Project Goals and Requirements

### 1.1 Objectives
**Primary objectives**
- Build an end‑to‑end, reusable fine-tuning pipeline: raw dataset → processed dataset → training → evaluation → export.
- Ensure training stability (no illegal memory access, no persistent OOMs, no dataloader hangs).
- Optimize training time (target completion within a 4‑hour budget on the chosen platform).
- Preserve **code-switching behavior** (Arabic/French/English) by avoiding forced language tokens **in the final workflow (Notebook 3)**.

**Secondary objectives**
- Make the workflow robust to notebook kernel restarts (auto-recovery guards).
- Provide professional evaluation outputs (WER/CER + Arabic-aware normalization).

### 1.2 Scope boundaries
- This work focuses on the **ML fine‑tuning pipeline** and related engineering decisions.
- Platform aspects outside the notebooks (web services, UI, deployment) are not described here unless they directly interact with the ML artifacts.

---

## 2. Technical Background

### 2.1 Model
- **Model**: `openai/whisper-large-v3`
- **Task**: ASR transcription (not translation)
- **Key constraint**: Whisper decoder enforces a **hard maximum target length** of **448 tokens** (`max_target_positions = 448`). Any training batch with longer label sequences triggers:
  - `ValueError: Labels' sequence length ... cannot exceed ... 448`

### 2.2 Data characteristics (Tunisian Arabic)
- Dialectal Arabic introduces orthographic variance.
- Code-switching to French/English is common.
- Evaluation must handle Arabic diacritics and letter variants.

### 2.3 Execution environments
Two training environments were used:

| Environment | Hardware | Goal | Notes |
|---|---:|---|---|
| Kaggle | 2× NVIDIA T4 (~16 GB each) | make training possible under memory constraints | multi‑GPU overhead; stricter VRAM; higher risk of CUDA/runtime edge cases |
| Lightning.ai | 1× NVIDIA H200 (~141 GB) | fast, stable training | bf16 native; single GPU; minimal distributed complexity |

---

## 3. Project Artifacts and Deliverables

### 3.1 Workspace structure
- `NOTEBOOK_1_DATA_PREPARATION.ipynb`: builds the processed dataset and saves it to disk.
- `NOTEBOOK_2_TRAINING.ipynb`: Kaggle training (multi‑GPU), stability-first configuration.
- `NOTEBOOK_3_TRAINING_LIGHTNING.ipynb`: Lightning.ai training (H200), speed/stability configuration, evaluation and export.
- `ANALYSIS_REPORT.md`: internal analysis notes and earlier static checks (not a final report artifact).

### 3.2 Produced artifacts
**Primary artifacts**
- Processed Hugging Face dataset folder (via `datasets.save_to_disk`) exported as a Kaggle dataset artifact.
- Fine‑tuned model folder saved via `trainer.save_model()` + processor via `processor.save_pretrained()`.

**Optional artifacts**
- Compressed archive of the fine‑tuned model for download and transfer.
- TensorBoard logs for training monitoring.

---

## 4. Notebook 1 — Data Preparation Pipeline

### 4.1 Purpose
Notebook 1 transforms the original dataset (audio + transcripts) into a **Whisper-ready processed dataset** that can be reused across training environments without repeating heavy preprocessing.

### 4.2 Inputs
- Source dataset: speech audio and corresponding transcript text.
- Audio files may come with varying sampling rates and formats.

### 4.3 Preprocessing steps (high level)
1. **Load dataset** and inspect columns (audio + transcript).
2. **Auto-detect transcript column** (Cell 5):
  - Candidate names: `transcript`, `text`, `sentence`, `transcription`, `label`, `utterance`
  - Fails fast with a clear error if none are found.
3. **Resample audio to 16 kHz** (Cell 6):
  - Uses `dataset.cast_column("audio", Audio(sampling_rate=16000))`
  - Verifies the resulting sample rate on a real sample.
4. **Feature extraction** using `WhisperFeatureExtractor` through the `WhisperProcessor`:
   - Convert audio waveform to log-Mel features.
5. **Label creation** using `WhisperTokenizer`:
   - Tokenize transcripts into integer token IDs (`labels`).
6. **Persist processed dataset** (Cell 10):
  - Base path: `/kaggle/working` if present, otherwise `.`
  - Output folder: `{base}/whisper_processed_dataset`
7. **Save raw evaluation samples** (Cell 7):
  - Selects `n_samples = min(20, len(dataset['test']))`
  - Saves to `{base}/raw_test_samples` (same base path logic as above)
8. Export processed dataset as a Kaggle dataset artifact (used by Notebook 2 and Notebook 3).

### 4.4 Output dataset schema
The processed dataset includes at least:
- `input_features`: Whisper log‑Mel features (typically ~`[80, 3000]`).
- `labels`: token IDs for the decoder targets.

### 4.5 Additional evaluation set
Notebook 1 also produced a small **raw test sample** set (audio + transcript) saved to disk as `raw_test_samples/`.
- Path logic: `/kaggle/working/raw_test_samples` on Kaggle, otherwise `./raw_test_samples`
- Size: up to 20 examples (`min(20, len(test))`)
- Audio is already 16 kHz (after the cast in Cell 6)

### 4.6 Processor configuration (Notebook 1)
Notebook 1 initializes the processor with a fixed Arabic transcription setup:
- `WhisperProcessor.from_pretrained("openai/whisper-large-v3", language="arabic", task="transcribe")`
- Prefix tokens are explicitly set via `processor.tokenizer.set_prefix_tokens(language="arabic", task="transcribe")`

This is **different** from Notebook 3 (final workflow), where language forcing is intentionally disabled to better handle code-switching.

### 4.7 Reproducibility notes
- The processed dataset is stored as a directory containing `dataset_dict.json` and Arrow shards.
- This format allows **consistent reload** using `datasets.load_from_disk()`.

---

## 5. Notebook 2 — Kaggle Training (2×T4) and Stability Engineering

### 5.1 Purpose
Notebook 2 targets Kaggle’s **2×T4** environment and uses a multi‑GPU training approach (FSDP/torchrun) to accommodate the large Whisper model under limited VRAM.

### 5.2 Key design decisions
- **Distributed training**: required due to VRAM limits.
- **Stability-first**: optimizer choice, precision choice, and training features were tuned to avoid CUDA crashes.
- **Reduced runtime overhead**: evaluation and checkpointing were removed/disabled to prevent slowdowns and memory pressure.

### 5.3 Debugging and fixes applied

#### 5.3.1 CUDA illegal memory access (bitsandbytes optimizer)
**Observed behavior**
- Crash during optimizer step with `CUDA illegal memory access` when using a bitsandbytes 8‑bit optimizer.

**Root cause**
- Incompatibility between some bitsandbytes optimizer kernels and the distributed training configuration (FSDP + environment-specific CUDA/runtime).

**Resolution**
- Removed bitsandbytes and used a Trainer-managed optimizer that is FSDP-safe in this environment.
- Final optimizer used by the generated script: `optim="adafactor"`.

#### 5.3.2 Numerical instability (`grad_norm = inf`) under fp16
**Observed behavior**
- Infinite gradient norms early in training under fp16.

**Root cause**
- Mixed precision fp16 can be unstable for large models and certain data distributions.

**Resolution**
- Load model weights in **fp32** (with stable gradients).

#### 5.3.3 OOM at optimizer step (Adam optimizer states)
**Observed behavior**
- OOM triggered during `optimizer.step()`.

**Root cause**
- Adam maintains large fp32 optimizer states (m/v) which can exceed available VRAM.

**Resolution**
- Switched from AdamW to **Adafactor** to reduce optimizer state memory.

### 5.4 Final Kaggle configuration (exact notebook/script values)
Notebook 2 writes a dedicated multi-GPU training script and launches it with `torchrun`.

**Schedule / effective batch**
- Per-device batch: `1`
- GPUs: `2`
- Gradient accumulation: `4`
- Effective batch: $1 \times 2 \times 4 = 8$
- `total_steps = 3000`
- `warmup_steps = 500`
- Loss logging every `25` steps

**Script generation (Cell 10)**
- Script path: `/kaggle/working/train_fsdp.py`
- Loads processed dataset by scanning `/kaggle/input` for `dataset_dict.json` then calling `load_from_disk(...)`.

**Precision behavior on T4**
- Model weights are loaded in fp32: `torch_dtype=torch.float32`.
- Mixed precision is enabled via Trainer flags:
  - On T4, the script selects `fp16=True`, `bf16=False` (based on compute capability).

**FSDP settings (Trainer)**
- `fsdp="full_shard auto_wrap"`
- `fsdp_config`:
  - `activation_checkpointing=True`
  - `transformer_layer_cls_to_wrap=["WhisperEncoderLayer", "WhisperDecoderLayer"]`
  - `limit_all_gathers=True`
  - `use_orig_params=True`

**Other TrainingArguments highlights**
- `output_dir="/kaggle/working/whisper-tunisian"` (final model saved separately at the end)
- `learning_rate=1e-5`
- `per_device_train_batch_size=1`
- `gradient_accumulation_steps=4`
- `max_grad_norm=1.0`
- `eval_strategy="no"`
- `save_strategy="no"`
- `logging_dir="/kaggle/working/logs"`, `report_to=["tensorboard"]`
- `dataloader_num_workers=0`, `dataloader_pin_memory=True`
- `remove_unused_columns=False`, `label_names=["labels"]`, `seed=42`

**Whisper label-length constraint handled in Kaggle too**
- The generated script defines `MAX_LABEL_LEN = 448` and truncates labels in the data collator:
  - `label_features = [{"input_ids": f["labels"][:MAX_LABEL_LEN]} ...]`

**Launch command (Cell 11)**
Notebook 2 runs:
- `torchrun --nproc_per_node=2 /kaggle/working/train_fsdp.py`
with stability env vars set (notably `NCCL_P2P_DISABLE=1` and `NCCL_IB_DISABLE=1`).

**Final save path (script, rank 0 only)**
- `/kaggle/working/whisper-tunisian-final`

### 5.5 Final Kaggle track outcome
After these changes, the Kaggle training configuration reached a stable baseline appropriate for constrained multi‑GPU environments.

---

## 6. Notebook 3 — Lightning.ai Training (H200) and Production-Ready Workflow

### 6.1 Purpose
Notebook 3 is the final and recommended training workflow:
- Runs on a single **H200** GPU.
- Prioritizes speed, simplicity, and robustness.
- Includes full evaluation and export steps.

### 6.2 Environment setup and dependencies
Notebook 3 installs and verifies the required packages (Cells 2–3):
- Core: `torch`, `transformers`, `datasets`, `accelerate`
- Evaluation: `evaluate`, `jiwer`
- Audio decoding for raw evaluation: `librosa`, `soundfile`
- Logging: `tensorboard`

It also attempts to install Flash Attention 2 via:
- `pip install flash-attn --no-build-isolation`
and explicitly falls back to SDPA if installation fails.

### 6.3 Attention backend (Flash Attention 2 vs SDPA)
**Attempted optimization**
- Flash Attention 2 was attempted for speed.

**Observed limitation**
- In the Lightning container, `flash-attn` could fail to build due to missing CUDA toolkit headers.

**Final behavior**
- The notebook automatically falls back to PyTorch **SDPA** (`attn_implementation="sdpa"`), which remains performant on H200.

### 6.4 Dataset download and authentication hardening
**Problem**
- Kaggle dataset download can return `403 Forbidden` when credentials are not properly configured.

**Resolution**
- Credentials are written to `~/.kaggle/kaggle.json` and environment variables are set as fallback.
- A CLI fallback path is included.

**Security note**
- In the final PFE report, do not include real API keys. Replace with placeholders and describe the use of secrets management.

### 6.5 Robustness to kernel restarts
Several cells depend on objects created in earlier cells (e.g., `processor`, `dataset`, `data_collator`). Kernel restarts can cause failures.

**Resolution**
- Added auto-recovery guards that re-create missing objects on demand.

### 6.6 Data collator and the 448-token label constraint
**Problem**
- Some training samples produce labels longer than 448 tokens, causing a hard crash.

**Resolution**
- Implemented label truncation **inside the data collator**:
  - Before padding, any `labels` longer than 448 tokens are truncated.
- Implemented the same logic in the training cell’s auto-recovery collator to avoid regressions after restarts.

**Trade-off**
- A small subset of long transcripts lose trailing content. This was accepted to guarantee training completion.

### 6.7 DataLoader hangs in managed environments
**Problem**
- With `dataloader_num_workers > 0`, training could hang with zero GPU utilization.

**Resolution**
- Set `dataloader_num_workers = 0` and removed prefetch settings.

### 6.8 Training configuration (H200)
Key settings used:
- Precision: **bf16** (native on Hopper)
- TF32 matmuls enabled
- Optimizer: **`adamw_torch_fused`**
- Gradient checkpointing enabled
- Evaluation during training: disabled (post-training evaluation only)
- Checkpointing during training: disabled (final save only)

**Exact config constants (training cell)**
- `MAX_STEPS = 3000`
- `BATCH_SIZE = 16`
- `LEARNING_RATE = 1e-5`
- `WARMUP_STEPS = 100`
- `USE_TORCH_COMPILE = False`

**Model/runtime details**
- Attention backend: `flash_attention_2` if available, otherwise `sdpa`
- Model load: `torch_dtype=torch.float32` with bf16 enabled at training time
- Code-switching friendly generation config:
  - `model.generation_config.forced_decoder_ids = None`
  - `model.generation_config.language = None` (auto-detect)
  - `model.generation_config.task = "transcribe"`
- Gradient checkpointing enabled via `model.gradient_checkpointing_enable()` and `gradient_checkpointing=True` in training args.

**Trainer arguments (high signal)**
- Schedule: `max_steps=MAX_STEPS` (with `num_train_epochs=999` as an ignored placeholder)
- Batch: `per_device_train_batch_size=BATCH_SIZE`, `gradient_accumulation_steps=1`
- Precision: `bf16=True`, `fp16=False`
- Optimizer: `optim="adamw_torch_fused"`
- No mid-training eval/checkpoints: `eval_strategy="no"`, `save_strategy="no"`
- Logging: `logging_steps=25`, `logging_dir="./logs"`, `report_to=["tensorboard"]`
- DataLoader: `dataloader_num_workers=0`, `dataloader_pin_memory=True`
- Output folders: `./whisper-tunisian` (work) and `./whisper-tunisian-final` (final save)

### 6.9 Training length requirement: 3000 steps
Notebook 3 supports both epoch-based and step-based schedules. The project requirement was updated to **3000 steps**, so the notebook uses step-based scheduling.

Final schedule:
- `max_steps = 3000`
- The notebook computes “effective epochs” dynamically as:

$$\text{effective epochs} = \frac{\text{MAX\_STEPS}}{\lceil n_{train} / \text{BATCH\_SIZE} \rceil}$$

### 6.10 Evaluation methodology
Notebook 3 evaluates on raw test samples (Cell 11) with two important operational guards:
- Installs audio decoding dependencies on-demand if missing:
  - `pip install -q librosa soundfile`
- Auto-recovers `raw_test_samples` by searching common roots (`.`, `~/.cache/kagglehub`, `./kaggle_download`) for a `raw_test_samples` folder.

Evaluation details:
- Metrics: **WER** and **CER**
- Text normalization:
  - Unicode NFKC
  - remove diacritics
  - normalize Arabic letter variants
  - remove punctuation
  - whitespace normalization
  - lowercase for Latin scripts

Inference behavior:
- Uses `model.generate(..., max_length=225, task="transcribe")` with **language not forced**.

Both raw and normalized scores are reported.

### 6.11 Export pipeline and compression behavior
**Problem**
- Compressing multi‑GB model artifacts can appear “stuck” without progress.

**Resolution**
- Export cell (Cell 12) produces `./whisper-tunisian-final.tar.gz` from `./whisper-tunisian-final/`.
- It prints uncompressed model size first, then uses a fast compression path:
  - Prefer `pigz -1` (parallel gzip) if available.
  - Otherwise uses `tar` with gzip compression level 1 (fastest), with a fallback if `--options` is unsupported.
- It prints archive size, compression ratio, method, and elapsed time, and provides upload/download instructions.

---

## 7. End-to-End Reproducibility (Operational Procedure)

### 7.1 Recommended run order
**On Lightning.ai (final workflow)**
1. Run environment inspection and dependency installation.
2. Download processed dataset from Kaggle and load with `load_from_disk`.
3. Load Whisper processor.
4. Instantiate data collator (includes 448-token truncation).
5. Train for `max_steps = 3000`.
6. Run evaluation (WER/CER).
7. Export model.

### 7.2 Determinism and seeds
- A fixed seed is set in training arguments.
- Minor nondeterminism may persist due to GPU kernel behavior.

---

## 8. Lessons Learned (Engineering + Platform Perspective)

### 8.1 Correctness and stability
- Avoid optimizer kernels that are unstable in distributed contexts (bitsandbytes + FSDP issues).
- Prefer fp32 load in constrained environments when fp16 causes instability.
- Use memory-efficient optimizers (Adafactor) when Adam states exceed VRAM.

### 8.2 Environment-aware implementation
- Assume CUDA extension builds may fail; implement safe fallbacks (Flash-Attn → SDPA).
- In managed notebook platforms, multi-worker DataLoader can deadlock; keep `num_workers=0` if needed.

### 8.3 Model-specific constraints
- Whisper’s 448-token decoder limit must be handled at the data-collator level.

### 8.4 Operational practices
- Never hardcode secrets in final documentation.
- Add clear progress logs for long operations (download, training, compression).

---

## 9. Limitations and Future Work

**Current limitations**
- Label truncation can remove trailing words for very long utterances.
- The raw evaluation subset is small (useful for smoke tests but not final benchmarking).

**Recommended improvements**
- Replace truncation with segmentation/chunking strategies for long transcripts.
- Add a larger held-out test set and report confidence intervals.
- Add structured experiment tracking (TensorBoard already enabled; optionally W&B/MLflow).
- Add periodic checkpointing for long runs with retention policies.

---

## Appendix A — Chronological Debugging Timeline

1. Kaggle: CUDA illegal memory access with bitsandbytes optimizer → removed bitsandbytes.
2. Kaggle: `grad_norm=inf` under fp16 → switched model load to fp32.
3. Kaggle: OOM at optimizer step with Adam states → switched to Adafactor.
4. Lightning: created H200 single‑GPU notebook optimized for bf16 + fused AdamW.
5. Lightning: Kaggle download 403 → wrote kaggle.json + CLI fallback.
6. Lightning: dataset scan slow/hanging → used columnar access instead of row-by-row.
7. Lightning: kernel restart NameErrors → added auto-recovery guards.
8. Lightning: dataloader hang with workers → set `dataloader_num_workers=0`.
9. Lightning: flash-attn build failure → SDPA fallback.
10. Lightning: crash due to labels > 448 → truncation in collator and recovery collator.
11. Lightning: evaluation failed (missing librosa/soundfile) → dependency install + guard.
12. Lightning: export compression appeared stuck → faster compression path + timing logs.
13. Lightning: requirement updated to 3000 steps → switched training to `max_steps=3000`.

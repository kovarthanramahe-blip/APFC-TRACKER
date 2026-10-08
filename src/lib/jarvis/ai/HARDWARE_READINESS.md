# JARVIS — Local AI Runtime Hardware Readiness (Phase 8, Part 10)

This is a report, not code, and nothing in it is executed by the application. Hardware detection
is deliberately **not** run from APFC-TRACKER (Part 10's own instruction) — a browser/app context
has no reliable, cross-platform way to read real system specs, and guessing would violate this
project's own "never invent a fact" discipline just as much as guessing a model capability would.

## What we need from the actual development PC before selecting a model

None of the values below are known yet. No model is recommended here, and none will be until
these are supplied by the person running that machine.

| Item | Why it matters | Value |
|---|---|---|
| **RAM (total, and free at idle)** | A local LLM must fit mostly in RAM (or VRAM) to run at usable speed; this is usually the single biggest constraint on which model sizes are even loadable. | _not provided_ |
| **CPU** (model, core count) | Determines CPU-only inference speed if no usable GPU is available, and affects how large a model stays "usable" rather than painfully slow. | _not provided_ |
| **GPU** (make/model, or "none"/"integrated only") | Determines whether GPU-accelerated inference (much faster) is possible at all, and which backend (CUDA/ROCm/Metal/none) applies. | _not provided_ |
| **VRAM** (if a discrete/dedicated GPU is present) | Caps how large a model can be fully offloaded to the GPU before falling back to slower CPU/RAM paths. | _not provided_ |
| **Storage available** (free disk space) | Open-weight model files range from roughly 1–40+ GB each; this caps how many models (and which sizes) can be pulled at all. | _not provided_ |
| **Operating system** (and version) | Ollama's own installation method, default install paths, and GPU-driver support all differ by OS. | _not provided_ |

## What this phase deliberately did NOT do

- Did not run any hardware-detection code, library, or OS command.
- Did not assume a "typical developer machine" and size a recommendation around that assumption.
- Did not recommend a specific model (e.g. a parameter count or quantization level) — doing so
  without the table above would be exactly the kind of guess this phase's own brief rules out.
- Did not download, install, or require Ollama or any model to determine any of this.

## Next step (not taken in this phase)

Once the table above is filled in by whoever runs the actual development machine, a future phase
can turn it into a conservative, explicitly-reasoned model-size recommendation (e.g. "fits
comfortably," "fits but slow," "does not fit") — still never a silent default, always visible and
overridable.

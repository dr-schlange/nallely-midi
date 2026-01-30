# Nallely LLM Skill File

*LLM-generated — both this README and the skill file.*

## What is this

`nallely-llm-skill.md` is a self-contained system prompt / reference document that gives an LLM everything it needs to interact with a running Nallely session over WebSocket. It covers:

- Core concepts (neurons, signals, connections, reactive model)
- The Trevor protocol (port 6788) — full command reference for session control
- The WebSocket Bus protocol (port 6789) — external neuron registration and binary frame format
- All available neuron classes with their parameters
- Wiring, scaler configuration, parameter naming conventions (`cv_name` vs `name`)
- Debugging methodology for live patches
- Neuron authoring (Python API and docstring-based code generation)
- JavaScript and Python connector libraries

## Target audience

Local or hosted LLMs that need to control Nallely programmatically — typically through tool use or code generation. The document is designed to be injected as a system prompt or retrieved via RAG.

Suitable for:
- **Code-generating LLMs** that produce Python scripts to build and manipulate patches
- **Agentic LLMs** with tool access (WebSocket, shell) that interact with a live session
- **Chat assistants** that need to answer questions about Nallely's architecture or help users write neurons

The skill file is model-agnostic. It has been tested with Claude but should work with any LLM that can follow structured technical references.

## How to use it

### As a system prompt
Prepend or append the contents of `nallely-llm-skill.md` to your system prompt. The document is structured so the LLM can look up commands, parameter formats, and neuron classes as needed.

### As a RAG document
Index `nallely-llm-skill.md` in your retrieval system. The section headers are designed to be meaningful for chunk-based retrieval.

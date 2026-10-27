# decepticon-sdk

The Decepticon plugin author entrypoint. Re-exports the `decepticon-core`
contracts, ships pytest fixtures, and provides a scaffolding CLI for
creating new plugin packages.

A complete plugin can be written importing only from `decepticon_sdk`:
no underscore-prefixed framework internals required.

See the umbrella [`README.md`](../../README.md) and the design spec at
[current extension contract](../../docs/design/extension-contract.md).

## Install

```bash
pip install decepticon-sdk
```

For test fixtures and scaffolding:

```bash
pip install "decepticon-sdk[testing]"      # FakeBackend / FakeLLM
pip install "decepticon-sdk[fixtures]"     # live framework-backed fixtures
```

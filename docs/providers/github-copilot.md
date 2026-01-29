---
summary: "Sign in to GitHub Copilot from Moltbot using the official SDK"
read_when:
  - You want to use GitHub Copilot as a model provider
  - You need the `moltbot models auth login-github-copilot` flow
---
# Github Copilot

## What is GitHub Copilot?

GitHub Copilot is GitHub's AI coding assistant. It provides access to Copilot
models for your GitHub account and plan. Moltbot uses the official
`@github/copilot-sdk` to integrate with Copilot.

## Prerequisites

The official SDK requires the **Copilot CLI** to be installed and authenticated:

```bash
# Install Copilot CLI (if not already installed)
npm install -g @github/copilot-cli

# Authenticate with GitHub
copilot auth login
```

## CLI setup

After authenticating with the Copilot CLI, verify your auth in Moltbot:

```bash
moltbot models auth login-github-copilot
```

This checks your Copilot CLI authentication status and creates an auth profile.

### Optional flags

```bash
moltbot models auth login-github-copilot --profile-id github-copilot:work
moltbot models auth login-github-copilot --yes
```

## Set a default model

```bash
moltbot models set github-copilot/gpt-4o
```

### Config snippet

```json5
{
  agents: { defaults: { model: { primary: "github-copilot/gpt-4o" } } }
}
```

## Notes

- Requires the Copilot CLI (`copilot`) to be installed and in your PATH.
- Run `copilot auth login` first to authenticate with GitHub.
- Model availability depends on your Copilot subscription plan.
- The official SDK manages token exchange internally.

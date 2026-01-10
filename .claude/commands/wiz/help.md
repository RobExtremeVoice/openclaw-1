---
description: List available wizard commands
---

# Wizard Commands

Show available wizard commands to the user.

## Instructions

Display this help information:

---

## Wizard Commands (`/wiz:*`)

Summon domain-expert wizards for interactive sessions. Each wizard primes the agent with deep knowledge before you ask questions.

| Command | Domain | Description |
|---------|--------|-------------|
| `/wiz:core [--verbose]` | Architecture | Clawdbot product internals: gateway, agents, providers, data flow |
| `/wiz:workflow [--verbose]` | Dev Process | Development workflow, hotfixes, releases, project management |
| `/wiz:help` | - | This help |

## Usage

```bash
# Prime for architecture questions (quiet mode)
/wiz:core

# Prime with visible exploration report
/wiz:core --verbose

# Prime for workflow/project questions
/wiz:workflow
```

## How It Works

1. Agent explores relevant files and documentation
2. Builds internal understanding of the domain
3. Default: Confirms "Primed for [domain] questions."
4. `--verbose`: Shows exploration summary
5. Ready for interactive Q&A session

## Examples

```
> /wiz:core
Primed for Clawdbot architecture questions.

> How does message routing work?
[Agent answers with specific file references from exploration]

> /wiz:workflow --verbose
Dev Workflow Primed
===================
[Full summary shown]
...
```

---

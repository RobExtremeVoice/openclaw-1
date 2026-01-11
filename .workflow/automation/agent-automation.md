# Multi-Agent Automation

## Configuration

| Component | Location |
|-----------|----------|
| Settings | `.claude/settings.json` |
| Safety hook | `.claude/hooks/pre-bash.sh` |
| Commands | `.claude/commands/dev/`, `.claude/commands/build/` |
| Skills | `writing-tests`, `e2e-testing`, `reviewing-code` |

Multi-agent safety: see root `AGENTS.md`.

## Adding Commands

Create `.claude/commands/dev/<name>.md` with YAML frontmatter (`description`, `allowed-tools`) and instructions using `$ARGUMENTS`.

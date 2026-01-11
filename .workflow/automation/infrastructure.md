# Infrastructure

## Worktrees

`./scripts/setup-worktrees.sh [dir]` → creates `agent-{dev,test,review}` worktrees.

## tmux

Socket: `${TMPDIR}/clawdbot-tmux-sockets/clawdbot.sock`

## Daily Builds

| Script | Target |
|--------|--------|
| `./scripts/daily-all.sh` | ARM + x86 parallel |
| `./scripts/daily-build.sh` | ARM (local) |
| `./scripts/daily-build-k8s.sh` | x86 (k8s) |

Results: `~/.clawdbot/daily-builds/summary-$(date +%Y-%m-%d).log`

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLAWDBOT_CONFIG_PATH` | Config file location |
| `CLAWDBOT_GATEWAY_URL` | Gateway WebSocket URL |
| `CLAWDBOT_GATEWAY_PORT` | Gateway port |
| `CLAWDBOT_TMUX_SOCKET_DIR` | tmux socket directory |
| `CLAWDBOT_SKIP_PROVIDERS` | Skip provider init (testing) |
| `CLAWDBOT_ENABLE_BRIDGE_IN_TESTS` | Enable bridge (testing) |

---

## Log Locations

| Log | Location |
|-----|----------|
| Gateway | stdout/stderr |
| Sessions | `~/.clawdbot/sessions/*.jsonl` |
| Agent | `~/.claude/session.log` |
| macOS unified | `./scripts/clawlog.sh --follow` |

---

## Troubleshooting

```bash
pgrep -f clawdbot && pkill -f clawdbot
lsof -i :8080
git worktree list && git worktree prune
tailscale status
tmux -S $SOCKET kill-server
```


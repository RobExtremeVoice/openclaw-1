---
name: argocd
description: "Manage Kubernetes deployments via ArgoCD. Sync applications, check health, view history, and rollback deployments across dev and prod environments."
metadata: {"openclaw":{"emoji":"🦑","requires":{"bins":["ssh","argocd"]}}}
---

# ArgoCD Skill

Manage Kubernetes application deployments using ArgoCD CLI. Supports dev and prod environments at Telnyx.

## ⚠️ Access Requirement

**All ArgoCD commands must be run via SSH to the main machine first:**

```bash
ssh daan@192.168.200.1
```

The `argocd` CLI is installed there with access to both environments.

## Environments

| Environment | URL | Cluster |
|-------------|-----|---------|
| dev | `argo-cd.query.dev.telnyx.io:8080` | gce-management-ch1-dev |
| prod | `argo-cd.query.prod.telnyx.io:8080` | gce-management-dc2-prod |

## Context Management

Switch between environments:

```bash
# Switch to dev
argocd context dev

# Switch to prod
argocd context prod

# Login (if session expired) - opens browser for SSO
argocd login argo-cd.query.dev.telnyx.io:8080 --sso
argocd login argo-cd.query.prod.telnyx.io:8080 --sso
```

## Common Commands

### List Applications

```bash
# List all apps in current context
argocd app list

# Filter by project or name
argocd app list | grep <pattern>
```

### Check Application Status

```bash
# Get detailed app info (status, health, sync state)
argocd app get <app-name>

# Check health only
argocd app health <app-name>
```

### Deploy (Sync)

```bash
# Sync an application (deploy latest)
argocd app sync <app-name>

# Sync with prune (remove resources not in git)
argocd app sync <app-name> --prune

# Sync specific resources only
argocd app sync <app-name> --resource <group>:<kind>:<name>
```

### Preview Changes

```bash
# Show diff between live and desired state
argocd app diff <app-name>
```

### History & Rollback

```bash
# View deployment history
argocd app history <app-name>

# Rollback to a previous revision
argocd app rollback <app-name> <history-id>
```

## Common Workflows

### Deploy to Dev

```bash
ssh daan@192.168.200.1
argocd context dev
argocd app sync <app-name>
argocd app get <app-name>  # verify health
```

### Deploy to Prod

```bash
ssh daan@192.168.200.1
argocd context prod
argocd app diff <app-name>  # preview changes first!
argocd app sync <app-name>
argocd app get <app-name>  # verify health
```

### Check App Health Across Environments

```bash
ssh daan@192.168.200.1

# Dev
argocd context dev
argocd app get <app-name> | head -20

# Prod
argocd context prod
argocd app get <app-name> | head -20
```

### Emergency Rollback

```bash
ssh daan@192.168.200.1
argocd context prod
argocd app history <app-name>  # find good revision
argocd app rollback <app-name> <revision-id>
```

## Managed Repositories

ArgoCD syncs from these Git repositories:

- `https://github.com/team-telnyx/deploy-infra-bare-metal-main`
- `https://github.com/team-telnyx/infra-svc-k8s-addons/`

## Troubleshooting

### App Stuck in "Progressing"

```bash
# Check events and pod status
argocd app get <app-name> --show-operation
```

### Sync Failed

```bash
# Get detailed sync result
argocd app get <app-name>

# Check for resource conflicts
argocd app diff <app-name>
```

### Session Expired

```bash
# Re-authenticate via SSO
argocd login argo-cd.query.dev.telnyx.io:8080 --sso
```

## Tips

- **Always check `diff` before syncing to prod** - know what you're deploying
- **Use `--prune` carefully** - it removes resources not in git
- **Check history before rollback** - find the right revision ID
- **Health ≠ Synced** - an app can be synced but unhealthy (pods crashing)

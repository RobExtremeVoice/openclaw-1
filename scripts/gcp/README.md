# GCP Deployment Scripts

Minimal container deployment for Clawdbot on Google Cloud Platform.

## Quick Start

```bash
# 1. Create a NEW GCP project and enable APIs
./setup-project.sh clawdbot-$(date +%Y%m%d) us-east1

# 2. Store secrets (interactive)
./store-secrets.sh

# 3. Build and push production image
./build-push.sh local   # Build locally, push to GCR
./build-push.sh cloud   # Build on Cloud Build (no local Docker)

# 4. Deploy
./deploy-vm.sh          # Compute Engine (free tier: e2-micro)
./deploy-vm.sh e2-small # Compute Engine with more RAM
./deploy-cloudrun.sh    # Cloud Run (pay per request)

# 5. Connect
./connect.sh            # IAP tunnel to Gateway
./ssh.sh                # SSH into VM
./logs.sh --follow      # View container logs
```

## Cost Comparison

| Option | Monthly Cost | Notes |
|--------|--------------|-------|
| e2-micro VM | $0 (free tier) | 1 vCPU shared, 1GB RAM, always on |
| e2-small VM | ~$13/mo | 2 vCPU shared, 2GB RAM |
| Cloud Run | ~$0-5/mo | Pay per request, auto-scales to 0 |

## Files

- `setup-project.sh` - Enable APIs, create service account, firewall rules
- `store-secrets.sh` - Store API keys in Secret Manager
- `build-push.sh` - Build production image and push to GCR
- `deploy-vm.sh` - Deploy to Compute Engine with container
- `deploy-cloudrun.sh` - Deploy to Cloud Run
- `connect.sh` - IAP tunnel to Gateway port
- `ssh.sh` - SSH into VM via IAP
- `logs.sh` - View container logs

## Production Image

Uses `Dockerfile.production` (multi-stage build):
- Builder stage: Full Node.js + Bun for compilation
- Production stage: `node:22-bookworm-slim` (~150-200MB final)
- Runs as non-root user
- Health check endpoint

## Security

- No public IP (access via IAP tunnel)
- Secrets stored in Secret Manager
- Dedicated service account with minimal permissions
- Shielded VM with Secure Boot

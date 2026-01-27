# Clawdbot Quick Reference Card

## 🔑 Essential Information

**Server**: `15.152.217.186`  
**User**: `ubuntu`  
**SSH Key**: `popda.pem`  
**Password**: `N1WmEgpDpenZhbjXvfM3mVzmWv8FT3Yq`  
**Clawdbot Dir**: `/home/clawdbot/clawdbot/`

---

## 🚀 Quick Commands

### SSH Access
```bash
# Basic SSH
ssh -i popda.pem ubuntu@15.152.217.186

# SSH with port forwarding (for Clawdbot access)
ssh -i popda.pem -L 3000:127.0.0.1:3000 ubuntu@15.152.217.186
```

### Fix Docker Image (REQUIRED FIRST)
```bash
ssh -i popda.pem ubuntu@15.152.217.186
sudo /home/clawdbot/clawdbot/fix-docker-image.sh
```

### Tailscale Setup
```bash
ssh -i popda.pem ubuntu@15.152.217.186
sudo tailscale up
cd /home/clawdbot/clawdbot
sudo ./setup-tailscale-serve.sh
```

### Health Check
```bash
ssh -i popda.pem ubuntu@15.152.217.186
cd /home/clawdbot/clawdbot
./clawdbot-doctor.sh
```

---

## 🔧 Service Management

```bash
# Start Clawdbot
sudo systemctl start clawdbot

# Stop Clawdbot
sudo systemctl stop clawdbot

# Restart Clawdbot
sudo systemctl restart clawdbot

# Check status
sudo systemctl status clawdbot

# View logs
docker logs clawdbot -f
```

---

## 🔍 Monitoring

```bash
# Check all services
sudo systemctl status clawdbot
sudo ufw status
sudo fail2ban-client status sshd
sudo tailscale status

# View logs
docker logs clawdbot -f
tail -f /home/clawdbot/clawdbot/logs/*.log
sudo tail -f /var/log/fail2ban.log

# Check containers
docker ps -a
docker stats
```

---

## 🌐 Access Clawdbot

### Method 1: SSH Tunnel
```bash
# On your local machine:
ssh -i popda.pem -L 3000:127.0.0.1:3000 ubuntu@15.152.217.186

# Then open in browser:
http://localhost:3000

# Login with password:
N1WmEgpDpenZhbjXvfM3mVzmWv8FT3Yq
```

### Method 2: Tailscale Serve
```bash
# Setup (one time):
ssh -i popda.pem ubuntu@15.152.217.186
sudo tailscale up
cd /home/clawdbot/clawdbot
sudo ./setup-tailscale-serve.sh

# Access at:
https://<hostname>.<tailnet>.ts.net
```

---

## 🛠️ Troubleshooting

### Clawdbot Not Starting
```bash
docker logs clawdbot
sudo systemctl status clawdbot
cd /home/clawdbot/clawdbot && docker-compose config
```

### Update Docker Image
```bash
sudo nano /home/clawdbot/clawdbot/docker-compose.yml
# Change image line
cd /home/clawdbot/clawdbot
sudo -u clawdbot docker-compose pull
sudo systemctl restart clawdbot
```

### Reset Everything
```bash
sudo systemctl stop clawdbot
cd /home/clawdbot/clawdbot
docker-compose down -v
docker-compose pull
sudo systemctl start clawdbot
```

---

## 📁 Important Files

```
/home/clawdbot/clawdbot/
├── docker-compose.yml      # Docker config
├── .env                    # Password (NEVER COMMIT!)
├── README.md               # Full documentation
├── UNINSTALL.md           # Removal instructions
├── clawdbot-doctor.sh     # Health check
├── setup-tailscale-serve.sh # Tailscale setup
├── fix-docker-image.sh    # Fix Docker image
├── data/                  # Data directory
└── logs/                  # Log files
```

---

## 🔒 Security Status

✅ Gateway: 127.0.0.1 only (NOT public)  
✅ UFW: Active (SSH + Tailscale only)  
✅ Fail2ban: Active (SSH protection)  
✅ Auto-updates: Enabled  
✅ Non-root user: clawdbot  
✅ Log rotation: Configured  

---

## 📞 Quick Help

| Issue | Command |
|-------|---------|
| Can't SSH | Check key permissions: `chmod 600 popda.pem` |
| Can't access Clawdbot | Check if running: `docker ps` |
| Forgot password | Check: `sudo cat /home/clawdbot/clawdbot/.env` |
| Service won't start | Check logs: `docker logs clawdbot` |
| Firewall blocking | Check: `sudo ufw status verbose` |
| Tailscale not working | Re-auth: `sudo tailscale up` |

---

## 🗑️ Quick Uninstall

```bash
ssh -i popda.pem ubuntu@15.152.217.186
sudo systemctl stop clawdbot
sudo systemctl disable clawdbot
cd /home/clawdbot/clawdbot
docker-compose down -v
sudo userdel -r clawdbot
sudo rm /etc/systemd/system/clawdbot.service
sudo systemctl daemon-reload
```

---

## ⚠️ Remember

- **NEVER** expose port 3000 publicly
- **ALWAYS** use SSH tunnel or Tailscale
- **SAVE** your password securely
- **RUN** health checks regularly
- **BACKUP** your .env file

---

**Need more help?** See `DEPLOYMENT_SUMMARY.md` for complete documentation.

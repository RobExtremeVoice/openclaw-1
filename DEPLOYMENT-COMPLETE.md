# 🎉 Moltbot 分布式集群 - 完整部署文档

**版本**: v2.0
**最后更新**: 2026-01-29
**状态**: ✅ 生产就绪

---

## 📊 系统概览

Moltbot 分布式 AI 集群已完成配置，包含以下核心组件：

| 组件 | 状态 | 地址/端口 | 说明 |
|------|------|-----------|------|
| Gateway 服务 | ✅ 运行中 | 18789 | WebSocket 网关 |
| 数据库 API | ✅ 运行中 | 18800 | HTTP REST API |
| PostgreSQL | ✅ 运行中 | 5432 | 数据持久化 |
| Prometheus | ✅ 运行中 | 9090 | 指标采集 |
| Grafana | ✅ 运行中 | 3000 | 可视化监控 |
| Metrics Exporter | ✅ 运行中 | 9101 | Prometheus 指标导出 |

---

## 🌐 访问地址

### Web 界面

| 服务 | URL | 凭据 |
|------|-----|------|
| **Grafana 监控** | http://38.14.254.51:3000 | admin / moltbot2024 |
| **Prometheus** | http://38.14.254.51:9090 | - |
| **管理面板** | `admin-panel.html` | - |

### API 端点

| 端点 | 用途 |
|------|------|
| `http://38.14.254.51:18800/api/health` | 健康检查 |
| `http://38.14.254.51:18800/api/devices` | 获取设备列表 |
| `http://38.14.254.51:18800/api/history` | 获取对话历史 |
| `http://38.14.254.51:9101/metrics` | Prometheus 指标 |

---

## ✅ 已完成功能

### 1. 数据持久化 ✅

**数据库**: PostgreSQL `moltbot`

**表结构**:
- `conversations` - 对话历史
- `devices` - 设备状态
- `system_logs` - 系统日志
- `statistics` - 统计数据

**API**: http://38.14.254.51:18800
```bash
# 获取设备列表
curl http://38.14.254.51:18800/api/devices

# 保存对话
curl -X POST http://38.14.254.51:18800/api/conversation \
  -H "Content-Type: application/json" \
  -d '{"device_id":"desktop","session_id":"main","role":"user","content":"Hello"}'

# 更新设备状态
curl -X POST http://38.14.254.51:18800/api/device \
  -H "Content-Type: application/json" \
  -d '{"name":"DESKTOP-5H22JHQ","type":"desktop","ip":"192.168.1.100","status":"online"}'
```

### 2. 监控系统 ✅

**Grafana 仪表盘**: http://38.14.254.51:3000
- 系统资源使用率
- 在线设备数量
- 网络流量
- 负载平均值

**Prometheus 指标**:
```
moltbot_online_devices         - 在线设备数
moltbot_total_devices          - 设备总数
moltbot_cpu_percent            - CPU 使用率
moltbot_memory_percent         - 内存使用率
moltbot_disk_percent           - 磁盘使用率
moltbot_network_bytes          - 网络流量
moltbot_load_average           - 系统负载
```

### 3. 自动备份 ✅

**备份位置**: `/opt/moltbot-backup/database/`

**备份类型**:
- 每日备份: 保留 7 天
- 每周备份: 保留 4 周
- 每月备份: 保留 12 个月

**自动备份时间**: 每天凌晨 2:00

**恢复命令**:
```bash
# 列出所有备份
/opt/moltbot-backup/restore.sh list

# 恢复最新备份
/opt/moltbot-backup/restore.sh latest

# 恢复指定备份
/opt/moltbot-backup/restore.sh db /path/to/backup.sql.gz
```

### 4. 会话同步 ✅

**同步频率**: 每 10 分钟

**服务器端**: `/opt/moltbot-sync/sync-sessions.sh`
**客户端**: `sync-sessions.bat` (Windows)

**手动同步**:
```bash
# Windows
sync-sessions.bat

# 服务器
/opt/moltbot-sync/sync-sessions.sh sync
```

### 5. 安全加固 ✅

**防火墙规则**:
- SSH (22): 开放
- Gateway (18789): 仅 LAN
- Database API (18800): 仅 LAN
- Grafana (3000): 开放
- Prometheus (9090): 开放
- 其他: 默认拒绝

**查看防火墙**:
```bash
sudo iptables -L -n
```

### 6. 告警系统 ✅

**配置文件**: `/opt/moltbot-monitoring/alert-config.json`

**支持方式**:
- 邮件告警 (SMTP)
- 钉钉机器人
- Slack Webhook
- 企业微信

**配置示例**:
```json
{
  "email": {
    "enabled": true,
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_user": "your-email@gmail.com",
    "smtp_password": "your-app-password",
    "to_email": "admin@example.com"
  },
  "webhook": {
    "enabled": true,
    "url": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    "type": "dingtalk"
  }
}
```

---

## 🔧 自动化脚本

### Windows 客户端脚本

| 脚本 | 功能 |
|------|------|
| `notebook-auto-deploy.bat` | 自动部署笔记本 |
| `register-device.bat` | 注册设备到集群 |
| `setup-ssh-keys.bat` | 配置 SSH 密钥 |
| `sync-sessions.bat` | 手动同步会话 |
| `sync-daemon.bat` | 自动同步守护进程 |

### 服务器脚本

| 脚本 | 功能 |
|------|------|
| `/opt/moltbot-sync/sync-sessions.sh` | 会话同步 |
| `/opt/moltbot-sync/db-storage.py` | 数据库操作 |
| `/opt/moltbot-sync/metrics-exporter.py` | Prometheus 指标 |
| `/opt/moltbot-backup/backup.sh` | 数据库备份 |
| `/opt/moltbot-backup/restore.sh` | 数据库恢复 |
| `/opt/moltbot-monitoring/health-check.sh` | 健康检查 |
| `/opt/moltbot-monitoring/alert.sh` | 告警发送 |

---

## 📈 定时任务

| 任务 | 频率 | 说明 |
|------|------|------|
| 健康检查 | 每 5 分钟 | 检查服务状态 |
| 会话同步 | 每 10 分钟 | 同步到服务器 |
| 数据库备份 | 每天凌晨 2:00 | 自动备份 |
| 指标采集 | 每 10 秒 | Prometheus 抓取 |

**查看定时任务**:
```bash
cat /etc/cron.d/moltbot-tasks
cat /etc/cron.d/moltbot-backup
```

---

## 🚀 部署新设备

### 自动部署（推荐）

1. 在新设备上运行:
```bash
git clone https://github.com/flowerjunjie/moltbot.git C:\moltbot
cd C:\moltbot
notebook-auto-deploy.bat
```

2. 注册设备:
```bash
register-device.bat
```

### 手动部署

1. 克隆仓库
2. 安装依赖: `pnpm install`
3. 构建项目: `pnpm build`
4. 配置: 编辑 `~/.clawdbot/moltbot.json`
5. 启动: `moltbot gateway`

---

## 📊 监控指标

### 关键指标

| 指标 | 阈值 | 说明 |
|------|------|------|
| CPU 使用率 | < 80% | 正常运行 |
| 内存使用率 | < 80% | 正常运行 |
| 磁盘使用率 | < 80% | 正常运行 |
| 在线设备 | 2+ | 预期设备数 |

### 查看指标

**Grafana**: http://38.14.254.51:3000/d/moltbot-system

**Prometheus**: http://38.14.254.51:9090

**命令行**:
```bash
curl -s http://38.14.254.51:9101/metrics | grep moltbot
```

---

## 🛠️ 维护命令

### 服务管理

```bash
# Gateway 服务
systemctl status moltbot-gateway
systemctl restart moltbot-gateway

# 数据库 API
systemctl status moltbot-db-api
systemctl restart moltbot-db-api

# Metrics Exporter
systemctl status moltbot-metrics-exporter
systemctl restart moltbot-metrics-exporter

# 监控栈
cd /opt/moltbot-monitoring
docker-compose ps
docker-compose restart
```

### 数据库操作

```bash
# 连接数据库
psql -d moltbot

# 查看表
\dt

# 查询设备
SELECT * FROM devices;

# 查询对话
SELECT * FROM conversations ORDER BY created_at DESC LIMIT 10;

# 查看日志
SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 10;
```

### 日志查看

```bash
# Gateway 日志
journalctl -u moltbot-gateway -f

# 数据库 API 日志
journalctl -u moltbot-db-api -f

# 备份日志
tail -f /var/log/moltbot-backup.log

# 同步日志
tail -f /var/log/moltbot-sync.log
```

---

## 🔒 安全建议

### 已实施

✅ 防火墙配置
✅ 服务隔离
✅ 定期备份
✅ 访问日志

### 建议改进

- [ ] 配置 HTTPS/WSS
- [ ] 启用 PostgreSQL SSL
- [ ] 配置 fail2ban
- [ ] 定期更新系统

---

## 📝 故障排除

### 常见问题

**1. Gateway 无法启动**
```bash
# 检查配置
cat ~/.clawdbot/moltbot.json

# 查看日志
journalctl -u moltbot-gateway -n 50
```

**2. 数据库连接失败**
```bash
# 检查 PostgreSQL
systemctl status postgresql

# 测试连接
psql -d moltbot -c "SELECT 1"
```

**3. 监控服务无法访问**
```bash
# 重启 Docker
systemctl restart docker

# 重启监控栈
cd /opt/moltbot-monitoring
docker-compose restart
```

**4. 备份失败**
```bash
# 手动运行备份
/opt/moltbot-backup/backup.sh

# 检查磁盘空间
df -h
```

---

## 📚 相关文档

- `ROADMAP.md` - 功能路线图
- `CLUSTER-CONFIG-SUMMARY.md` - 集群配置详情
- `QUICK-START.md` - 快速开始指南
- `admin-panel.html` - Web 管理面板

---

## 🎯 下一步

### 短期优化

1. 配置邮件告警
2. 部署笔记本设备
3. 配置 HTTPS 证书

### 长期规划

1. 移动端应用
2. 多模型支持
3. Agent 智能体
4. 高可用部署

---

**🎉 系统已完全就绪，可以开始使用！**

如有问题，请查看日志或联系管理员。

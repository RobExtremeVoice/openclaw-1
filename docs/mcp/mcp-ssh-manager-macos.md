# mcp-ssh-manager macOS 自启 launchd

本指南适用于 **macOS 13+（含 macOS 26）**，使用 **launchd** 设置登录后自启。方案可回滚、可调试、可日志追踪，不修改业务代码，也不使用第三方守护工具。

## 1) 自适应探测规则

脚本会按顺序自动探测启动方式，成功即用：

1) 若 `command -v mcp-ssh-manager` 存在，使用其绝对路径作为 `ProgramArguments[0]`。
2) 否则按以下范围搜索仓库或安装路径：
   - 当前工作目录及其父级（最多向上 5 层），查找 `package.json` 且 `name` 含 `mcp-ssh-manager`。
   - `~/code`、`~/projects`、`~/src` 下搜索目录名包含 `mcp-ssh-manager`，深度 `<=3`。
   - `/usr/local`、`/opt/homebrew` 下搜索 `mcp-ssh-manager` 相关文件。
3) 若找到 Node 项目：
   - 优先 `pnpm start` 或 `npm run start`（`scripts.start` 存在时）。
   - 否则使用 `node <entry>`，入口依次为：`dist/index.js` -> `build/index.js` -> `index.js` -> `src/index.ts`。
4) Node 解释器绝对路径优先级：`/opt/homebrew/bin/node` -> `/usr/local/bin/node` -> `which node`。
5) `ProgramArguments` 使用绝对路径，禁止依赖 shell PATH 或 `~/.zshrc`。

## 2) 安装脚本

同目录脚本：`docs/mcp/install-launchd.sh`。用法：

```
./install-launchd.sh install
```

脚本会生成并安装 plist：

```
~/Library/LaunchAgents/com.bvisible.mcp-ssh-manager.plist
```

日志目录：

```
~/Library/Logs/mcp-ssh-manager/
```

## 3) 生成的 plist 完整内容

脚本会根据探测结果生成 plist。以下为两种可能的完整内容示例。

**示例 A：直接使用二进制**

```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.bvisible.mcp-ssh-manager</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/mcp-ssh-manager</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/USER/Library/Logs/mcp-ssh-manager/out.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/USER/Library/Logs/mcp-ssh-manager/err.log</string>
</dict>
</plist>
```

**示例 B：Node 项目入口**

```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.bvisible.mcp-ssh-manager</string>

  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>
    <string>/Users/USER/path/to/mcp-ssh-manager/dist/index.js</string>
  </array>

  <key>WorkingDirectory</key>
  <string>/Users/USER/path/to/mcp-ssh-manager</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/USER/Library/Logs/mcp-ssh-manager/out.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/USER/Library/Logs/mcp-ssh-manager/err.log</string>
</dict>
</plist>
```

## 4) plist 关键字段说明

- `Label`：launchd 唯一标识，用于 `launchctl` 管理。
- `ProgramArguments`：启动命令与参数，必须为绝对路径，禁止使用 shell 包裹。
- `WorkingDirectory`：Node 项目使用的工作目录，必须为绝对路径。
- `EnvironmentVariables`：明确指定 PATH，避免 launchd 的默认 PATH 过短。
- `RunAtLoad`：plist 加载时立即启动。
- `KeepAlive`：进程退出时自动拉起。
- `StandardOutPath`/`StandardErrorPath`：stdout 与 stderr 日志路径。

## 5) 一键命令

以下命令均可直接复制执行：

```
./install-launchd.sh install
./install-launchd.sh uninstall
./install-launchd.sh status
./install-launchd.sh logs
```

## 6) 手动命令

**安装与启动：**

```
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.bvisible.mcp-ssh-manager.plist
launchctl kickstart -k gui/$(id -u)/com.bvisible.mcp-ssh-manager
```

**卸载与停止：**

```
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.bvisible.mcp-ssh-manager.plist
rm -f ~/Library/LaunchAgents/com.bvisible.mcp-ssh-manager.plist
```

**状态与调试：**

```
launchctl print gui/$(id -u)/com.bvisible.mcp-ssh-manager
```

**日志追踪：**

```
tail -f ~/Library/Logs/mcp-ssh-manager/out.log ~/Library/Logs/mcp-ssh-manager/err.log
```

## 7) 验证是否自启成功

1) 登录后检查 launchd 状态：

```
launchctl print gui/$(id -u)/com.bvisible.mcp-ssh-manager
```

2) 查看日志是否有持续输出：

```
tail -f ~/Library/Logs/mcp-ssh-manager/out.log
```

## 8) 常见问题与排查

- **权限问题**：LaunchAgents 以当前用户运行，避免写入 root 目录。
- **WorkingDirectory 不存在**：确保仓库路径存在且为绝对路径。
- **Node 路径错误**：确认 `/opt/homebrew/bin/node` 或 `/usr/local/bin/node` 可执行。
- **端口占用**：检查已有进程是否占用目标端口，必要时先停止旧进程。
- **PATH 不一致**：保证 `EnvironmentVariables.PATH` 包含常用路径。

**临时前台运行对照验证：**

- 若使用二进制：

```
/usr/local/bin/mcp-ssh-manager
```

- 若使用 Node 入口：

```
/opt/homebrew/bin/node /Users/USER/path/to/mcp-ssh-manager/dist/index.js
```


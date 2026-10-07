#!/usr/bin/env bash
# 信息库 一键安装（在服务器上用 root 运行：bash /opt/info-hub/repo/install.sh）
# 重复运行是安全的：已有的密码和收藏都会保留。
set -e
HOME_DIR=/opt/info-hub
REPO_DIR=$HOME_DIR/repo
PORT=${PORT:-8800}
REPO_URL=https://github.com/fjzh632346-cmd/info-hub.git

echo "== 信息库 安装 =="

# 1. 装 git 和 Node.js（已经有就跳过）
install_pkg() {
  if command -v dnf >/dev/null 2>&1; then dnf install -y "$1" || true
  elif command -v yum >/dev/null 2>&1; then yum install -y "$1" || true
  elif command -v apt-get >/dev/null 2>&1; then apt-get update -y >/dev/null && apt-get install -y "$1" || true
  fi
}
command -v git  >/dev/null 2>&1 || { echo "-> 正在安装 git……"; install_pkg git; }
command -v node >/dev/null 2>&1 || { echo "-> 正在安装 Node.js……"; install_pkg nodejs; }
command -v git  >/dev/null 2>&1 || { echo "!! git 装不上。把这段报错截图发给 Claude。"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "!! Node.js 装不上。把这段报错截图发给 Claude。"; exit 1; }
echo "-> git $(git --version | awk '{print $3}')，Node.js $(node -v)"

# 2. 下载网站代码（已经下载过就更新）
mkdir -p "$HOME_DIR"
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true
if [ -d "$REPO_DIR/.git" ]; then
  echo "-> 已有代码，正在更新……"
  git -C "$REPO_DIR" pull --ff-only || echo "   （这次没更新成功，不影响安装，之后会自动重试）"
else
  echo "-> 正在从 GitHub 下载……"
  n=0
  until git clone --depth 1 "$REPO_URL" "$REPO_DIR"; do
    n=$((n+1)); [ $n -ge 3 ] && { echo "!! 连不上 GitHub。把这段截图发给 Claude，它会给你换一种方式。"; exit 1; }
    echo "   第 $n 次失败，10 秒后重试……"; rm -rf "$REPO_DIR"; sleep 10
  done
fi
# 拉取慢的时候别卡死
git -C "$REPO_DIR" config http.lowSpeedLimit 1000
git -C "$REPO_DIR" config http.lowSpeedTime 60

# 3. 配置（已有就保留，不会改你的密码）
if [ ! -f "$HOME_DIR/config.json" ]; then
  PASS=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-12)
  cat > "$HOME_DIR/config.json" <<EOF
{
  "port": $PORT,
  "password": "$PASS",
  "pullMinutes": 30
}
EOF
  chmod 600 "$HOME_DIR/config.json"
fi
[ -f "$HOME_DIR/saved.json" ] || echo '{}' > "$HOME_DIR/saved.json"

# 4. 开机自启 + 挂了自动重启
NODE_BIN=$(command -v node)
cat > /etc/systemd/system/info-hub.service <<EOF
[Unit]
Description=info-hub personal news site
After=network-online.target

[Service]
ExecStart=$NODE_BIN $REPO_DIR/server/server.js
WorkingDirectory=$REPO_DIR
Environment=INFOHUB_HOME=$HOME_DIR
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable info-hub >/dev/null 2>&1
systemctl restart info-hub

# 5. 服务器自带防火墙放行端口（阿里云控制台的"安全组"还要另外放行）
PORT_IN_CFG=$(grep -o '"port": *[0-9]*' "$HOME_DIR/config.json" | grep -o '[0-9]*$')
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port=${PORT_IN_CFG}/tcp >/dev/null && firewall-cmd --reload >/dev/null
fi
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow ${PORT_IN_CFG}/tcp >/dev/null
fi

sleep 2
IP=$(curl -s --max-time 4 http://ifconfig.me 2>/dev/null || true)
echo
if curl -s --max-time 3 http://127.0.0.1:${PORT_IN_CFG}/api/status | grep -q '"message"'; then
  echo "== 装好了，正在运行 =="
else
  echo "!! 程序好像没跑起来，运行  journalctl -u info-hub -n 30  把结果截图发给 Claude"
fi
echo
echo "浏览器打开：  http://${IP:-你的服务器IP}:${PORT_IN_CFG}"
grep -o '"password": *"[^"]*"' "$HOME_DIR/config.json" | sed 's/"password": *"\(.*\)"/网站密码：    \1   （收藏、写笔记时要用，别发给别人）/'
echo
echo "还差一步：到阿里云控制台 → 安全组 → 入方向，放行 TCP ${PORT_IN_CFG} 端口。"

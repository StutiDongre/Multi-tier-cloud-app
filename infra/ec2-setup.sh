#!/usr/bin/env bash
# ============================================================
# ec2-setup.sh — One-time EC2 bootstrap for TaskFlow Backend
# Run as root (User Data) on Amazon Linux 2023 / Ubuntu 22.04
# ============================================================

set -euo pipefail

echo "======================================================"
echo " TaskFlow EC2 Bootstrap Script"
echo " $(date)"
echo "======================================================"

# ── 1. System update ────────────────────────────────────────
echo "[1/6] Updating system packages..."
if command -v yum &>/dev/null; then
    yum update -y
    yum install -y git curl nginx
else
    apt-get update -y
    apt-get install -y git curl nginx
fi

# ── 2. Install Docker ────────────────────────────────────────
echo "[2/6] Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose v2
DOCKER_COMPOSE_VERSION="v2.24.0"
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version

# ── 3. Clone / update repo ───────────────────────────────────
echo "[3/6] Cloning repository..."
REPO_URL="${REPO_URL:-https://github.com/YOUR_USERNAME/YOUR_REPO.git}"
APP_DIR="/opt/taskflow"

if [ -d "$APP_DIR/.git" ]; then
    echo "Repo exists, pulling latest..."
    git -C "$APP_DIR" pull
else
    git clone "$REPO_URL" "$APP_DIR"
fi

# ── 4. Create .env for backend ───────────────────────────────
echo "[4/6] Writing production .env..."
cat > "$APP_DIR/multi-tier-app/backend/.env" <<EOF
NODE_ENV=production
PORT=3000
DB_HOST=postgres
DB_PORT=5432
DB_NAME=taskflow
DB_USER=taskuser
DB_PASSWORD=${DB_PASSWORD:-taskpass123}
FRONTEND_URL=${FRONTEND_URL:-*}
EOF

# ── 5. Start backend + postgres via Docker Compose ──────────
echo "[5/6] Starting Docker Compose services..."
cd "$APP_DIR/multi-tier-app/infra"
docker compose pull
docker compose up --build -d

echo "Waiting for backend to be healthy..."
sleep 15
docker compose ps

# ── 6. Configure Nginx ──────────────────────────────────────
echo "[6/6] Configuring Nginx..."
cp "$APP_DIR/multi-tier-app/infra/nginx.conf" /etc/nginx/conf.d/taskflow.conf

# Remove default site
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t
systemctl enable nginx
systemctl restart nginx

# ── Done ─────────────────────────────────────────────────────
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "<EC2-PUBLIC-IP>")

echo ""
echo "======================================================"
echo " ✅ TaskFlow EC2 Setup Complete!"
echo "======================================================"
echo " Backend API : http://${PUBLIC_IP}/api/health"
echo " Nginx status: $(systemctl is-active nginx)"
echo " Docker:       $(docker compose ps --services | tr '\n' ' ')"
echo ""
echo " Next steps:"
echo "   1. Note this IP: ${PUBLIC_IP}"
echo "   2. Add GitHub Secret EC2_HOST = ${PUBLIC_IP}"
echo "   3. Set your S3 CORS to allow this EC2 IP"
echo "   4. Update CloudFront origin"
echo "======================================================"

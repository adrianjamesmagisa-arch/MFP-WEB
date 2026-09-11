#!/usr/bin/env bash
# One-time bootstrap on the PCC physical server (run as deploy user with sudo).
# After this + GitHub self-hosted runner, pushes to main auto-deploy like Vercel.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/mfp-web}"
REPO_URL="${REPO_URL:-https://github.com/adrianjamesmagisa-arch/MFP-WEB.git}"
NODE_MAJOR="${NODE_MAJOR:-20}"

echo "==> Installing Node.js ${NODE_MAJOR}, Git, Nginx, PM2 basics..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo apt-get update -y
sudo apt-get install -y git nginx
sudo npm install -g pm2

echo "==> App directory: ${APP_DIR}"
sudo mkdir -p "$(dirname "$APP_DIR")"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo git clone "$REPO_URL" "$APP_DIR"
fi
sudo chown -R "$USER:$USER" "$APP_DIR"

cd "$APP_DIR"
if [ ! -f .env.local ]; then
  echo "!! Create ${APP_DIR}/.env.local with Supabase keys before first build."
  cat > .env.local.example <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EOF
fi

echo "==> First build (skip if waiting for .env.local)..."
if [ -f .env.local ]; then
  npm ci
  npm run build
  if pm2 describe mfp-web >/dev/null 2>&1; then
    pm2 restart mfp-web --update-env
  else
    pm2 start npm --name mfp-web -- start
  fi
  pm2 save
  pm2 startup || true
else
  echo "Skipped npm build — add .env.local then run: npm ci && npm run build && pm2 start npm --name mfp-web -- start"
fi

echo ""
echo "NEXT: Install GitHub Actions self-hosted runner with labels: self-hosted, linux, pcc-mfp"
echo "  Repo → Settings → Actions → Runners → New self-hosted runner"
echo "  Install under e.g. /opt/actions-runner and enable as a service."
echo "After that, every push to main will auto-deploy."

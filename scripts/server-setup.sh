#!/bin/bash
# Server setup script for Ubuntu with Caddy
# Run this once on the server to install dependencies
# Usage: ssh user@mylemonkitchen.com 'bash -s' < scripts/server-setup.sh

set -e

echo "=== Installing Node.js via nvm ==="
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20

echo "=== Installing PM2 ==="
npm install -g pm2

echo "=== Setting up PM2 startup ==="
pm2 startup | tail -1 | bash || true

echo "=== Creating app directory ==="
sudo mkdir -p /var/www/mylemonkitchen.com
sudo chown $(whoami):$(whoami) /var/www/mylemonkitchen.com

echo "=== Server setup complete ==="

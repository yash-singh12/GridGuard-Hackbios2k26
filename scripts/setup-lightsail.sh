#!/usr/bin/env bash
# GridGuard AWS Lightsail One-Click Host Setup
set -e

echo "=== [1/4] Updating package repositories ==="
sudo apt-get update -y
sudo apt-get install -y curl git ufw

echo "=== [2/4] Configuring 1GB Swap (Recommended for stability) ==="
if [ ! -f /swapfile ]; then
    sudo fallocate -l 1G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "Swap created successfully."
else
    echo "Swapfile already exists."
fi

echo "=== [3/4] Installing Docker and Docker Compose ==="
sudo apt-get install -y docker.io docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "=== [4/4] Opening Firewall Ports (80, 443, 22) ==="
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable || true

echo "=========================================================="
echo " Lightsail Host Setup Complete!"
echo " Next step: clone your repository and run:"
echo "   docker-compose up -d --build"
echo "=========================================================="

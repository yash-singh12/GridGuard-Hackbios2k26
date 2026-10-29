# Deploying GridGuard AI to AWS Lightsail (Lowest Cost Guide)

This guide walks you through deploying the **GridGuard AI** prototype on **Amazon Lightsail** for **$5.00/month** (or $3.50/month) with static IPv4 and generous bandwidth included.

---

## Step 1: Create an Amazon Lightsail Instance

1. Sign in to the [AWS Management Console](https://console.aws.amazon.com/) and navigate to **Amazon Lightsail** (or go to `https://lightsail.aws.amazon.com`).
2. Click **Create instance**.
3. Configure the instance:
   - **Instance location**: Choose an AWS Region closest to you (e.g., `Mumbai (ap-south-1)` or `N. Virginia (us-east-1)`).
   - **Platform**: Select **Linux/Unix**.
   - **Blueprint**: Select **OS Only** -> **Ubuntu 24.04 LTS** (or 22.04 LTS).
   - **Instance plan**: Select the **$5 USD/month** plan (1 GB RAM, 1 vCPU, 40 GB SSD, 2 TB transfer).
   - **Identify your instance**: Name it `gridguard-server`.
4. Click **Create instance**. It will be ready in ~1 minute.

---

## Step 2: Attach a Static IP (Free) & Open Firewall

1. In the Lightsail console, click the **Networking** tab.
2. Click **Create static IP**, attach it to your `gridguard-server`, and click **Create**. *(Lightsail static IPs are free while attached to a running instance).*
3. Click your instance name -> go to **Networking** tab -> scroll down to **IPv4 Firewall**:
   - Ensure **HTTP (port 80)** is listed. If not, click **Add rule** -> select **HTTP (port 80)** -> click **Create**.
   - (Optional) Add **HTTPS (port 443)** if planning to use SSL.

---

## Step 3: Connect and Set Up Docker

1. In the Lightsail console, click the terminal icon `>_` next to your instance to open the browser-based SSH terminal (or connect via SSH using your key).
2. Run the initialization script or copy-paste these commands:

```bash
# 1. Update and install Docker + Compose
sudo apt update && sudo apt install -y docker.io docker-compose git

# 2. REQUIRED: Enable 1GB Swap (prevents Out-Of-Memory / code 137 during build)
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active (should show 1.0G under Swap):
free -h
```

---

## Step 4: Clone & Launch GridGuard

In the same SSH terminal on your instance:

```bash
# 1. Clone your repository
git clone <YOUR_REPOSITORY_URL> gridguard
cd gridguard

# 2. Build and launch with BuildKit enabled
DOCKER_BUILDKIT=1 sudo docker-compose up -d --build
```

That's it! In about 1–2 minutes:
- Nginx frontend will be listening on **Port 80**.
- FastAPI ML backend will be running on **Port 8000** behind the reverse proxy.

---

## Step 5: Access Your Application

Open your browser and navigate to your Lightsail Static IP:
```
http://<YOUR_STATIC_IP>/
```

- The React Dashboard will load.
- Any API calls to `/api/predict` or `/api/health` are automatically reverse-proxied internally to FastAPI.
- No CORS errors, no ports to remember.

---

## Useful Maintenance Commands

```bash
# View container logs
sudo docker-compose logs -f

# Check container status & memory usage
sudo docker stats

# Restart containers
sudo docker-compose restart

# Rebuild after code updates
git pull
sudo docker-compose up -d --build
```

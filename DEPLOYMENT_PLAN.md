# Alibaba Cloud ECS Deployment Plan for HYTOPIA Game Server

This document outlines the plan for setting up an Alibaba Cloud Elastic Compute Service (ECS) instance to host the HYTOPIA game server.

**1. Recommended ECS Instance Configuration**

*   **Region:** US West 1 (Silicon Valley) - `us-west-1`
*   **Zone:** Zone A - `us-west-1a` (Matches VSwitch `vsw-rj9ppcbf6kboccheq0mv6`)
*   **Operating System:** Ubuntu 22.04 LTS (64-bit)
*   **Instance Type:** `ecs.g7.medium` (2 vCPU, 4 GiB RAM) - Monitor and resize if necessary.
*   **Network:**
    *   VPC: `vpc-rj96e3ccd4qj940avrzy6`
    *   VSwitch: `vsw-rj9ppcbf6kboccheq0mv6`
*   **Public IP:** Enable "Assign Public IPv4 Address". Consider using an Elastic IP (EIP) for a static IP.
*   **System Disk:** Standard SSD or ESSD PL0 (e.g., 40 GiB).
*   **Login Credentials:** Key Pair (Recommended) or Password.

**2. Security Group Configuration**

Create a new Security Group with the following *inbound* rules:

*   **Rule 1 (SSH):**
    *   Protocol: TCP
    *   Port Range: 22/22
    *   Source: `YOUR_IP/32` (Replace `YOUR_IP` with your actual public IP address - **Highly Recommended**) or `0.0.0.0/0` (Less Secure).
*   **Rule 2 (HTTP):**
    *   Protocol: TCP
    *   Port Range: 80/80
    *   Source: `0.0.0.0/0` (For Let's Encrypt validation & redirection).
*   **Rule 3 (HTTPS):**
    *   Protocol: TCP
    *   Port Range: 443/443
    *   Source: `0.0.0.0/0` (For game client connections).

**Recommendation:** Use a reverse proxy (Nginx/Caddy) on ports 80/443 instead of exposing the application's port (8080) directly.

**3. Initial Server Setup Steps (Post-Instance Creation)**

1.  **Connect via SSH:** `ssh -i /path/to/key.pem root@<INSTANCE_PUBLIC_IP>`
2.  **Update System:** `sudo apt update && sudo apt upgrade -y`
3.  **Install Essentials & Nginx:** `sudo apt install -y git curl unzip build-essential nginx`
4.  **Install Bun:**
    ```bash
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc # Or re-login
    bun --version
    ```
5.  **(Optional) Install Docker:**
    ```bash
    sudo apt install -y docker.io
    sudo systemctl start docker && sudo systemctl enable docker
    sudo usermod -aG docker $USER # Re-login needed
    docker --version
    ```
6.  **(Recommended) Install PM2:**
    ```bash
    sudo bun install -g pm2
    pm2 --version
    ```
7.  **(Recommended) Configure Nginx Reverse Proxy:**
    *   Create config in `/etc/nginx/sites-available/hytopia`.
    *   Use `proxy_pass http://127.0.0.1:8080;`.
    *   Set proxy headers (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`).
    *   Enable site: `sudo ln -s /etc/nginx/sites-available/hytopia /etc/nginx/sites-enabled/`
    *   Test: `sudo nginx -t`
    *   Reload: `sudo systemctl reload nginx`
8.  **(Recommended) Setup HTTPS (Let's Encrypt):**
    *   Install Certbot: `sudo apt install certbot python3-certbot-nginx`
    *   Run: `sudo certbot --nginx -d your.domain.com` (Use your domain).

**4. Deployment Strategies**

*   **Option A: Git Clone & PM2**
    1.  `git clone <your-repo-url> hytopia-demo`
    2.  `cd hytopia-demo`
    3.  `bun install`
    4.  `pm2 start bun --name hytopia-server -- run index.ts`
    5.  `pm2 save`
    6.  `pm2 startup` (Follow instructions)

*   **Option B: Docker Container**
    1.  Ensure Docker is installed.
    2.  Build/Pull image (`docker build .` or `docker pull <registry>/image`).
    3.  Run container: `docker run -d --name hytopia-container --restart always -p 127.0.0.1:8080:8080 <image_name>`
    4.  Ensure Nginx proxies to `http://127.0.0.1:8080`.
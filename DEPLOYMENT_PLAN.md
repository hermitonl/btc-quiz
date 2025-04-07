# Alibaba Cloud ECS Deployment Plan for HYTOPIA Game Server (Final)

This document outlines the final configuration and steps used to successfully deploy the HYTOPIA game server on an Alibaba Cloud Elastic Compute Service (ECS) instance.

**1. Final ECS Instance Configuration**

*   **Region:** Asia Pacific > Singapore (`ap-southeast-1`)
*   **Zone:** Singapore Zone A (`ap-southeast-1a`)
*   **Network:** Default VPC & Default vSwitch
*   **Instance Type:** `ecs.t5-lc1m1.small` (1 vCPU, 1 GiB RAM)
*   **Operating System:** Ubuntu 22.04 LTS (64-bit)
*   **Public IP Address:** `47.236.226.140` (Assigned - Consider EIP for static IP if needed)
*   **System Disk:** 40 GiB (Standard SSD or ESSD PL0)
*   **Login Credentials:** Key Pair (Used: `alibaba.pem`)

**2. Final Security Group Configuration**

The following *inbound* rules were configured:

*   **Rule 1 (SSH):**
    *   Protocol: TCP
    *   Port Range: 22/22
    *   Source: Specific Admin IP / `0.0.0.0/0` (Adjust as needed for security)
*   **Rule 2 (HTTP):**
    *   Protocol: TCP
    *   Port Range: 80/80
    *   Source: `0.0.0.0/0` (For Let's Encrypt validation & redirection)
*   **Rule 3 (HTTPS):**
    *   Protocol: TCP
    *   Port Range: 443/443
    *   Source: `0.0.0.0/0` (For game client connections via Nginx)

**Note:** Port 8080 (application port) is *not* directly exposed. Nginx handles external traffic on ports 80/443.

**3. Server Setup Steps Performed**

1.  **Connected via SSH:** Using the key pair `alibaba.pem` and public IP `47.236.226.140`.
    ```bash
    # Ensure correct permissions on the key file locally
    chmod 600 /path/to/alibaba.pem
    ssh -i /path/to/alibaba.pem root@47.236.226.140
    ```
2.  **Updated System:**
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```
3.  **Installed Essential Tools:**
    ```bash
    sudo apt install -y git curl unzip build-essential nginx
    ```
4.  **Installed Docker Engine:**
    ```bash
    sudo apt install docker.io -y
    sudo systemctl start docker
    sudo systemctl enable docker
    sudo usermod -aG docker $USER # Log out/in required after this
    # Verified with: docker --version (Result: 26.1.3)
    ```
5.  **Configured Nginx Reverse Proxy:**
    *   Created config in `/etc/nginx/sites-available/hytopia` (or similar) to proxy requests to `http://127.0.0.1:8080`.
    *   Included necessary proxy headers (`Host`, `X-Real-IP`, etc.).
    *   Enabled the site: `sudo ln -s /etc/nginx/sites-available/hytopia /etc/nginx/sites-enabled/`
    *   Tested config: `sudo nginx -t`
    *   Reloaded Nginx: `sudo systemctl reload nginx`
    *   *(Refer to `nginx_hytopia.conf` for the exact configuration used)*
6.  **Setup HTTPS with Let's Encrypt:**
    *   Installed Certbot: `sudo apt install certbot python3-certbot-nginx`
    *   Obtained certificate for the domain:
        ```bash
        sudo certbot --nginx -d game.moopt.com
        ```

**4. Final Deployment Method: Docker Container**

The application was successfully deployed using Docker.

1.  **Cloned/Updated Repository:** The project code was placed in `/var/www/hytopia-demo` on the server.
    ```bash
    # Example:
    # mkdir -p /var/www
    # cd /var/www
    # git clone <your-repo-url> hytopia-demo
    # cd hytopia-demo
    # git pull # If updating
    ```
2.  **Built Docker Image:**
    ```bash
    cd /var/www/hytopia-demo
    sudo docker build -t hytopia-dev-env:latest .
    ```
3.  **Ran Docker Container:** The following command was used to run the application container, ensuring it restarts automatically and maps the necessary port (only to localhost) and volume.
    ```bash
    # Ensure no other process uses port 8080 before running
    # sudo lsof -t -i :8080 | xargs --no-run-if-empty sudo kill -9
    # Remove previous container if exists: sudo docker rm hytopia-server

    sudo docker run -d --restart always -p 127.0.0.1:8080:8080 -v /var/www/hytopia-demo:/app --name hytopia-server hytopia-dev-env:latest bun run index.ts
    ```
    *   `-d`: Detached mode.
    *   `--restart always`: Ensures the container restarts if it stops.
    *   `-p 127.0.0.1:8080:8080`: Maps container port 8080 *only* to the host's localhost interface. Nginx proxies to this.
    *   `-v /var/www/hytopia-demo:/app`: Mounts the project code into the container.
    *   `--name hytopia-server`: Names the container.
    *   `hytopia-dev-env:latest`: The image used.
    *   `bun run index.ts`: The command to start the application inside the container.
4.  **Verified:** Container status checked with `sudo docker ps`. Application accessible via `https://game.moopt.com` (through Nginx).

---
*This document reflects the state after successful deployment.*

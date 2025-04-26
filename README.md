# Bitcoin Learning Game (Hytopia)

Welcome to the [HermitONL (Hermit Online)](https://hytopia.com/play/?join=aliyun.hermit.onl), a massive multiplayer online role-playing game (MMORPG) built with the HYTOPIA SDK. Players explore a voxel-based world, interact with NPCs to learn about Bitcoin concepts, and test their knowledge through timed quizzes.

**Play Live (Hytopia Client Link):** https://hytopia.com/play/?join=aliyun.hermit.onl (recommended using Mobile Web Browser)

OSS Example (3D Model): http://alicdn.hermit.onl/soldier-player.gltf

## Gameplay Overview

*   **Theme:** Players are newly activated humanoids in a dystopian world, learning about Bitcoin's decentralized concepts to break free from centralized fiat control.
*   **World:** Explore a voxel-style city plaza and a separate quiz platform area.
*   **Learning:** Interact with Knowledge Giver NPCs in the plaza to receive text-based lessons on Bitcoin fundamentals (transactions, Lightning Network, etc.). Earn 1 sat per unique lesson completed.
*   **Quizzes:** Participate in timed quizzes on the quiz platform (solo or multiplayer). Pay 1 sat to enter. Answer questions correctly within the time limit by moving to the corresponding platform area. Incorrect answers or running out of time results in falling and elimination for that round. Correct answers earn 10 sats.
*   **Quiz Rules & Mechanics:**
        *   **Basic Setup:** Players stand on platforms where a question and 4 multiple-choice answer options are displayed. Each answer option corresponds to a specific platform area.
        *   **Game Flow:** A Bitcoin-related question appears. Players have a time limit (e.g., 15 seconds) to run to the platform representing the correct answer.
        *   **Elimination:** After the timer ends, platforms with incorrect answers disappear. Players on those platforms, or those who didn't choose, fall and are eliminated for that round. Correct players proceed.
    *   **Quiz Strategies:**
        *   **Quick Reaction:** Read the question and move to the chosen platform quickly.
        *   **Positioning:** Stand centrally initially for easy access to all answer platforms. Observe others but don't blindly follow.
        *   **Knowledge:** Use the knowledge gained from NPCs. Remember answers, as questions might repeat.
*   **Progression:** Start with 5 sats. Earn more through lessons and quizzes. Player progress (sats, completed lessons/quizzes) is saved.
*   **(Incoming Features):** Peer-to-peer sat transfers, shop for items/upgrades.

## Technology Stack

*   **Game Engine:** HYTOPIA SDK
*   **Runtime:** Bun (fast all-in-one JavaScript runtime)
*   **Language:** TypeScript
*   **Database:** PostgreSQL (hosted on Alibaba Cloud ApsaraDB RDS and PolarDB)
*   **Asset Hosting:** Alibaba Cloud Object Storage Service (OSS)
*   **Content Delivery:** Alibaba Cloud Content Delivery Network (CDN)
*   **Deployment:** Docker, Nginx (Reverse Proxy), Alibaba Cloud Elastic Compute Service (ECS), Alibaba Cloud ACR (Container Registry)

## What I Built

This project is a robot-themed MMORPG called [HermitONL (Hermit Online)](https://hytopia.com/play/?join=aliyun.hermit.onl), built using the HYTOPIA SDK. Players take on the role of a newly activated humanoid robot in a world dominated by fiat currency. The core objective is educational: players learn about Bitcoin concepts by interacting with NPC characters and test their knowledge through a "fall-down" style quiz game mechanic. The game features persistent player progression (tracking sats earned, lessons completed, etc.) and is deployed live on Alibaba Cloud infrastructure.

## Alibaba Cloud Services Implementation

Several Alibaba Cloud services were utilized to build, deploy, and host this game:

*   **Elastic Compute Service (ECS):**
    *   **Why:** Chosen to host the backend game server (running the Hytopia SDK via Bun/Node.js within a Docker container) and the Nginx reverse proxy.
    *   **How:** A `ecs.t5-lc1m1.small` instance (1vCPU, 1GiB RAM) running Ubuntu 22.04 was provisioned in the Singapore region, leveraging the free tier. Nginx was installed to handle incoming web traffic and proxy requests to the game server container.
    *   **Experience:** The free tier instance provided a cost-effective way to deploy. However, the limited memory (1GiB) proved insufficient for building the Docker image directly on the instance (specifically during the `bun install` step), leading to OOM errors (exit code 137). This necessitated using Alibaba Cloud ACR.

*   **ApsaraDB RDS / PolarDB for PostgreSQL:**
    *   **Why:** Selected for persistent storage of player data, including usernames, sat balances, completed lessons, and quiz results. Both RDS and PolarDB were explored; PolarDB offers cloud-native benefits like auto-scaling storage, while RDS provides a familiar managed PostgreSQL experience. The project currently uses the public endpoint from one of these services.
    *   **How:** A PostgreSQL database (`kai_pdb_name`) and user (`kai_pdb_account`) were created. The application connects using credentials provided via environment variables (`PGHOST`, `PGPORT`, etc.). The `initializeDatabase` function in the code ensures the `players` table schema exists.
    *   **Experience:** Setting up the database instance was straightforward. Initial connection and schema creation faced permission issues (`permission denied for schema public`), which were resolved by granting `USAGE` and `CREATE` privileges to the application user on the `public` schema via SQL commands.

*   **Object Storage Service (OSS):**
    *   **Why:** Used to host static game assets like 3D models (`.gltf`), UI icons (`.png`), and potentially other media efficiently and scalably.
    *   **How:** An OSS bucket (`hermitonl`) was created in the Singapore region with Zone-Redundant Storage (ZRS) for higher availability. Specific assets (like `soldier-player.gltf` and UI icons) were uploaded. Bucket-level "Block Public Access" was disabled, and individual file ACLs were set to `Public Read` to allow access via CDN or direct URL.
    *   **Experience:** Setup was relatively simple. Understanding the interaction between bucket-level "Block Public Access" and file-level ACLs was crucial for making assets publicly readable.

*   **Content Delivery Network (CDN):**
    *   **Why:** To accelerate the delivery of static assets (hosted on OSS) to players globally, reducing latency and load on the origin server.
    *   **How:** A CDN domain (`alicdn.hermit.onl`) was configured, pointing to the OSS bucket (`hermitonl.oss-ap-southeast-1.aliyuncs.com`) as the origin server (using port 443 for secure origin fetch). DNS CNAME records were updated at the domain provider (Porkbun) to point `alicdn.hermit.onl` to the Alibaba Cloud CDN CNAME target. UI assets in HTML use a `{{CDN_ASSETS_URL}}` placeholder, replaced by an environment variable pointing to `http://alicdn.hermit.onl`.
    *   **Experience:** The setup involved multiple steps (domain verification, origin config, CNAME). Troubleshooting involved verifying direct OSS access, checking DNS propagation, and confirming CDN domain status. HTTPS setup via CDN/ESA was explored but deferred due to perceived complexity/cost, settling on HTTP for asset delivery initially. The environment variable approach for integrating the CDN URL into the UI was identified as the likely intended method.

*   **Container Registry (ACR):**
    *   **Why:** Adopted to overcome the memory limitations of building the Docker image directly on the small ECS instance.
    *   **How:** An ACR instance/namespace/repository was set up. The Docker image is now built locally, tagged with the ACR repository path, and pushed to ACR. The ECS instance then pulls the pre-built image from ACR for deployment.
    *   **Experience:** This workflow effectively solved the OOM build errors on ECS and represents a more robust deployment strategy. It requires initial setup of ACR and authentication on both the build machine and the ECS instance.

## Game Development Highlights

*   **Persistence:** Successfully integrated PostgreSQL (via Alibaba Cloud PolarDB/RDS) to save and load player progress (sats, lessons, quizzes), making the game state persistent across sessions.
*   **Quiz Mechanic:** Implemented the core "fall-down" quiz mechanic where players move to platforms corresponding to answers, with incorrect platforms disappearing.
*   **Deployment Pipeline:** Established a full deployment pipeline involving Docker containerization, Nginx reverse proxying, HTTPS via Let's Encrypt, and leveraging Alibaba Cloud services (ECS, ACR, OSS, CDN, Database).
*   **Troubleshooting:** Successfully diagnosed and resolved various deployment issues, including Docker build memory limits (using ACR), Nginx 502 errors (caused by application crashes), missing modules (due to `.gitignore`), and database permissions.
*   **CDN Integration:** Configured OSS and CDN for asset delivery and identified the environment variable method for integrating asset URLs into the game's UI.
## Local Development Setup

### Prerequisites

*   [Git](https://git-scm.com/)
*   [Docker](https://www.docker.com/products/docker-desktop/)
*   [Bun](https://bun.sh/) (or Node.js with npm/yarn)

### Steps

1.  **Clone Repository:**
    
    ```bash
    git clone https://github.com/hermitonl/btc-quiz.git
    cd btc-quiz
    ```
    
2.  **Environment Variables:**
    Create a `.env` file in the project root directory. This file stores your database credentials and CDN URL. **Do not commit this file to Git.**
    Add `.env` to your `.gitignore` file:
    ```
    .env
    ```
    Populate `.env` with your details (replace placeholders):
    ```dotenv
    # Alibaba Cloud ApsaraDB RDS or PolarDB for PostgreSQL details
    PGHOST=pgm-2ev2q290zzf22gz24o.pg.rds.aliyuncs.com # Or your RDS public endpoint 
    PGPORT=5432
    PGDATABASE=kai_pdb_name
    PGUSER=kai_pdb_account
    PGPASSWORD=XXXXXXXXXXXXX # Replace with your actual password
    
    # CDN URL for UI assets (icons, etc.)
    CDN_ASSETS_URL=http://alicdn.hermit.onl
    ```

3.  **Build Docker Image:**
    ```bash
    docker build -t hytopia-dev-env:latest .
    ```

4.  **Run Docker Container:**
    This command runs the server interactively, maps port 8080, mounts your local code for live updates, and sets the CDN URL environment variable.
    ```bash
    docker run -it --rm \
      -p 8080:8080 \
      -v "$(pwd)":/app \
      -e CDN_ASSETS_URL="http://alicdn.hermit.onl" \
      hytopia-dev-env
    ```
    *(Inside the container, the app is typically started with `bun run index.ts`)*

5.  **Access Locally:**
    The server should be accessible at `http://localhost:8080`.

## Deployment (Alibaba Cloud ECS)

This outlines the deployment process using Alibaba Cloud services.

### Overview

*   **Compute:** ECS instance (`ecs.t5-lc1m1.small`, Ubuntu 22.04) in Singapore region.
*   **Database:** ApsaraDB RDS or PolarDB for PostgreSQL (ensure network connectivity with ECS, e.g., same VPC or public endpoint with whitelist).
*   **Storage/CDN:** OSS for assets, CDN (`alicdn.hermit.onl`) for delivery.
*   **Container Registry:** Alibaba Cloud ACR (recommended to avoid building on ECS).
*   **Web Server:** Nginx acting as a reverse proxy, handling HTTPS via Let's Encrypt.

### Recommended Workflow (using ACR)

1.  **Build Image Locally:**
    ```bash
    docker build -t hytopia-dev-env:latest .
    ```

2.  **Login to ACR:** (Replace placeholders)
    ```bash
    docker login --username=<your_aliyun_username> registry.<region-id>.aliyuncs.com
    ```

3.  **Tag Image for ACR:** (Replace placeholders)
    ```bash
    docker tag hytopia-dev-env:latest registry.ap-southeast-1.aliyuncs.com/<your-namespace>/btc-quiz:latest
    ```

4.  **Push Image to ACR:** (Replace placeholders)
    ```bash
    docker push registry.ap-southeast-1.aliyuncs.com/<your-namespace>/btc-quiz:latest
    ```

5.  **On ECS Instance:**
    *   Install Docker.
    *   Login to ACR (`docker login ...`).
    *   Pull the image:
        ```bash
        docker pull registry.ap-southeast-1.aliyuncs.com/<your-namespace>/btc-quiz:latest
        ```
    *   Run the container (ensure necessary environment variables are set):
        ```bash
        # Stop/Remove previous container if necessary
        # sudo docker stop hytopia-server && sudo docker rm hytopia-server
        
        sudo docker run -d --restart always \
          -p 127.0.0.1:8080:8080 \
          -e PGHOST="pgm-2ev2q290zzf22gz24o.pg.rds.aliyuncs.com" \
          -e PGPORT="5432" \
          -e PGDATABASE="kai_pdb_name" \
          -e PGUSER="kai_pdb_account" \
          -e PGPASSWORD="XXXXXXXXXXXXX" \
          -e CDN_ASSETS_URL="http://alicdn.hermit.onl" \
          --name hytopia-server \
          registry.ap-southeast-1.aliyuncs.com/<your-namespace>/btc-quiz:latest \
          bun run index.ts
        ```
        *(Note: Port 8080 is mapped only to the host's localhost interface, as Nginx will proxy to it).*

### Server Configuration

*   **Nginx:** Configure Nginx (`/etc/nginx/sites-available/hytopia`) as a reverse proxy listening on ports 80 and 443, with `server_name aliyun.hermit.onl;`. It should `proxy_pass` requests to `http://127.0.0.1:8080;`. Use `certbot --nginx` to obtain and configure Let's Encrypt SSL certificates for HTTPS.
*   **Database:** Ensure the ApsaraDB RDS or PolarDB instance is accessible from the ECS instance (check VPC/Security Groups/Whitelists). The application uses environment variables (`PGHOST`, `PGPORT`, etc.) to connect. The `initializeDatabase` function attempts to create the `players` table; ensure the database user (`kai_pdb_account`) has `USAGE` and `CREATE` permissions on the `public` schema.
    
    ```sql
    -- Run as privileged user in the target database
    GRANT USAGE ON SCHEMA public TO kai_pdb_account;
    GRANT CREATE ON SCHEMA public TO kai_pdb_account;
    ```
*   **Firewall/Security Group:** Ensure ports 22 (SSH), 80 (HTTP), and 443 (HTTPS) are open inbound on the ECS instance's security group.


## Conclusion

This Bitcoin Learning Game demonstrates the integration of the HYTOPIA SDK with various Alibaba Cloud services to create a persistent, deployed MMORPG experience. Players can currently learn about Bitcoin via NPCs and test their knowledge in a unique quiz format. Future development aims to expand interactivity with features like peer-to-peer sat transfers and an in-game shop. The project serves as both an educational tool about Bitcoin and a practical example of deploying a modern web game on cloud infrastructure.

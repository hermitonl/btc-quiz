# Use a Node.js base image which includes common build tools
FROM node:latest

# Install necessary dependencies (curl and git might be present, but ensure unzip is)
# Use non-interactive frontend to avoid prompts during build
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install the latest version of Bun
RUN curl -fsSL https://bun.sh/install | bash

# Add Bun to the PATH environment variable
# Note: The Bun installer might add this to shell profiles, but setting ENV ensures it's globally available.
# The default install location is /root/.bun/bin for the root user.
ENV PATH="/root/.bun/bin:${PATH}"

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and bun.lockb to leverage cache
COPY package.json bun.lock ./

# Install project dependencies using Bun
RUN bun install --frozen-lockfile

# Copy the rest of the application code
# COPY . . # Optional: Uncomment if you want the code baked into the image instead of using volume mount

# Set the default command to bash for an interactive shell
CMD ["bash"]
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl iptables iproute2 ca-certificates dnsmasq openssl \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package file and install dependencies
COPY package.json ./
# Replacing 'npm ci' with 'npm install --omit=dev' to handle missing lockfiles
RUN npm install --omit=dev

# Copy application files
COPY index.js ./
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Expose necessary ports
EXPOSE 53 80 443 8080

ENTRYPOINT ["/start.sh"]
CMD []

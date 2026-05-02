FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl iptables iproute2 ca-certificates dnsmasq openssl \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json
COPY package.json ./

# Since you're on GitHub Web, we use this to avoid the lockfile requirement
RUN npm install --omit=dev

# Copy the rest
COPY index.js ./
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 53 80 443 8080

ENTRYPOINT ["/start.sh"]
CMD []

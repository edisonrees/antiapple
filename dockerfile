FROM node:20-slim

# Install Tailscale + networking tools
RUN apt-get update && apt-get install -y curl iptables iproute2 ca-certificates && \
    curl -fsSL https://tailscale.com/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY index.js ./
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]

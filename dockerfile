FROM node:20-slim

# Install system dependencies + libcap2-bin for port permissions
RUN apt-get update && apt-get install -y \
    curl iptables iproute2 ca-certificates dnsmasq openssl libcap2-bin \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Grant Node.js and Dnsmasq permission to bind to ports 443 and 53
RUN setcap 'cap_net_bind_service=+ep' $(which node) && \
    setcap 'cap_net_bind_service=+ep' $(which dnsmasq)

# Copy application code
COPY index.js ./
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Railway uses 8080 for public traffic; 443/53 are for Tailscale internal traffic
EXPOSE 8080 443 53

ENTRYPOINT ["/start.sh"]

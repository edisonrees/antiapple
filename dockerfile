FROM node:20-slim

RUN apt-get update && apt-get install -y \
    curl iptables iproute2 ca-certificates dnsmasq openssl \
    && curl -fsSL https://tailscale.com/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY index.js ./
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 53 80 443

CMD ["/start.sh"]

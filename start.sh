#!/bin/bash
echo "🔄 Initializing Environment..."

# 1. Start Tailscale
tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &
sleep 5

# 2. Bring Tailscale up - added --accept-dns=false to stop it from taking port 53
tailscale up --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=apple-dns-spoof \
  --advertise-exit-node \
  --accept-dns=false

TS_IP=$(tailscale ip -4)
echo "📍 Tailscale IP: $TS_IP"

# ... (Keep cert generation as is) ...

# 3. Clear Port 53 and Start dnsmasq
echo "🟢 Freeing port 53 and starting dnsmasq..."

# This finds whatever is on port 53 (usually tailscale's internal dns) and kills it
fuser -k 53/udp
fuser -k 53/tcp

# Revised dnsmasq config for reliability
cat > /etc/dnsmasq.conf <<EOF
port=53
listen-address=0.0.0.0
bind-interfaces
address=/apple.com/$TS_IP
address=/www.apple.com/$TS_IP
server=1.1.1.1
user=root
EOF

dnsmasq

echo "🚀 Starting Node App..."
exec node index.js

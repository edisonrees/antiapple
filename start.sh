#!/bin/bash
echo "🔄 Initializing Environment..."

# Start Tailscale
tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &
sleep 5
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=apple-dns-spoof --accept-dns=false

TS_IP=$(tailscale ip -4)
echo "📍 Tailscale IP: $TS_IP"

# === DNSMASQ ===
echo "🟢 Starting dnsmasq..."
fuser -k 53/udp || true # Clear port 53 if tailscale grabbed it
cat > /etc/dnsmasq.conf <<EOF
port=53
listen-address=0.0.0.0
bind-interfaces
address=/apple.com/$TS_IP
address=/www.apple.com/$TS_IP
server=1.1.1.1
EOF
dnsmasq

echo "🚀 Starting Node App..."
exec node index.js

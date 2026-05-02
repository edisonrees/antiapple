#!/bin/bash
echo "🔄 Starting Tailscale + dnsmasq..."

tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &

sleep 4

tailscale up --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=apple-mitm-proxy \
  --advertise-exit-node \
  --accept-routes \
  --accept-dns=false

TS_IP=$(tailscale ip -4)
echo "📍 Tailscale IP: $TS_IP"

cat > /etc/dnsmasq.conf <

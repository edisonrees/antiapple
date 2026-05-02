#!/bin/bash
echo "🔄 Starting Tailscale + Apple Proxy..."

# Start Tailscale daemon (userspace mode for containers)
tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &

sleep 4

# Connect to Tailscale + enable as Exit Node
tailscale up --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=apple-proxy \
  --advertise-exit-node \
  --accept-routes \
  --accept-dns=false

echo "✅ Tailscale VPN is running as Exit Node!"
echo "📍 Your private Tailscale IP: $(tailscale ip -4)"
echo "🌐 Proxy URL: http://$(tailscale ip -4):8080/apple.com/github.com"
echo ""
echo "👉 On iOS: Open Tailscale app → enable this Exit Node"
echo "Then open Safari → go to the proxy URL above"

# Keep container alive
node index.js & tail -f /dev/null

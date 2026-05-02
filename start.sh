#!/bin/bash
echo "🔄 Starting Tailscale + dnsmasq + Apple.com DNS spoof proxy..."

tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &

sleep 5

tailscale up --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=apple-dns-spoof \
  --advertise-exit-node \
  --accept-routes \
  --accept-dns=false

TS_IP=$(tailscale ip -4)
echo "📍 Tailscale IP: $TS_IP"

# Generate certs (safe & idempotent)
mkdir -p /certs
if [ ! -f /certs/ca.key ]; then
  openssl genrsa -out /certs/ca.key 4096
  openssl req -x509 -new -nodes -key /certs/ca.key -sha256 -days 3650 -out /certs/ca.crt \
    -subj "/C=AU/ST=WA/L=Perth/O=AppleProxy/CN=Apple MITM CA"
fi
if [ ! -f /certs/apple.key ]; then
  openssl genrsa -out /certs/apple.key 2048
  openssl req -new -key /certs/apple.key -out /certs/apple.csr -subj "/CN=apple.com"
  echo "subjectAltName = DNS:apple.com, DNS:www.apple.com" > /certs/apple.ext
  openssl x509 -req -days 365 -in /certs/apple.csr -CA /certs/ca.crt -CAkey /certs/ca.key -CAcreateserial -out /certs/apple.crt -extfile /certs/apple.ext
fi
echo "✅ Certificates ready"

# dnsmasq spoof
cat > /etc/dnsmasq.conf <<EOF
listen-address=0.0.0.0
port=53
address=/apple.com/$TS_IP
address=/www.apple.com/$TS_IP
EOF
dnsmasq --keep-in-foreground &

echo "✅ dnsmasq spoofing apple.com → $TS_IP"

# Start Node.js (proxy + health check)
node index.js

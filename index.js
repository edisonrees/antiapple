const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');

const app = express();
const HEALTH_PORT = process.env.PORT || 8080;

// 1. PUBLIC HEALTH CHECK & CA DOWNLOAD
// Access this via your .railway.app URL to get the certificate
const healthApp = express();
healthApp.get('/', (req, res) => res.send('✅ DNS spoof proxy healthy'));
healthApp.get('/ca.crt', (req, res) => {
    if (fs.existsSync('/certs/ca.crt')) {
        res.download('/certs/ca.crt');
    } else {
        res.status(404).send('CA certificate not generated yet. Wait a few seconds.');
    }
});

healthApp.listen(HEALTH_PORT, '0.0.0.0', () => {
    console.log(`🚀 Railway Health check on port ${HEALTH_PORT}`);
});

// 2. MITM PROXY LOGIC
const proxyApp = express();

proxyApp.all('/*', async (req, res) => {
    let targetPath = req.originalUrl.substring(1) || 'github.com';
    const targetUrl = targetPath.startsWith('http') ? targetPath : 'https://' + targetPath;

    console.log(`🍎 MITM apple.com/${targetPath} → ${targetUrl}`);

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            headers: { 'User-Agent': req.headers['user-agent'] },
            responseType: 'arraybuffer',
            maxRedirects: 10,
            validateStatus: () => true
        });

        // Forward headers, stripping security policies that would block our MITM
        Object.keys(response.headers).forEach(h => {
            if (!['content-encoding','content-length','transfer-encoding','connection','content-security-policy'].includes(h.toLowerCase())) {
                res.set(h, response.headers[h]);
            }
        });

        const contentType = response.headers['content-type'] || '';
        if (contentType.includes('text/html')) {
            let html = response.data.toString('utf-8');
            const $ = cheerio.load(html);
            const attrs = ['href','src','action'];

            $(attrs.map(a => `[${a}]`).join(',')).each((_, el) => {
                const $el = $(el);
                attrs.forEach(attr => {
                    let val = $el.attr(attr);
                    if (val && !val.startsWith('#') && !val.startsWith('data:')) {
                        try {
                            const absolute = new URL(val, targetUrl).href;
                            $el.attr(attr, `https://apple.com/${absolute}`);
                        } catch(e) {}
                    }
                });
            });
            res.send($.html());
        } else {
            res.send(Buffer.from(response.data));
        }
    } catch (err) {
        res.status(502).send('Proxy error: ' + err.message);
    }
});

// 3. START HTTPS SERVER (Internal Tailscale Port 443)
try {
    const privateKey = fs.readFileSync('/certs/apple.key', 'utf8');
    const certificate = fs.readFileSync('/certs/apple.crt', 'utf8');

    https.createServer({ key: privateKey, cert: certificate }, proxyApp)
        .listen(443, '0.0.0.0', () => {
            console.log('🚀 Apple.com MITM proxy active on Tailscale Port 443');
        });
} catch (e) {
    console.error('❌ SSL Files missing. The proxy server cannot start yet.');
}

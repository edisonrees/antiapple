const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http'); // Added for Port 80 redirect
const fs = require('fs');

const HEALTH_PORT = process.env.PORT || 8080;

// 1. PUBLIC HEALTH / CA DOWNLOAD
const healthApp = express();
healthApp.get('/', (req, res) => res.send('✅ Proxy Active'));
healthApp.get('/ca.crt', (req, res) => res.download('/certs/ca.crt'));
healthApp.listen(HEALTH_PORT, '0.0.0.0');

// 2. HTTP TO HTTPS REDIRECT (Fixes 'Connection Refused' on Port 80)
http.createServer((req, res) => {
    res.writeHead(301, { "Location": "https://apple.com" + req.url });
    res.end();
}).listen(80, '0.0.0.0');

// 3. MITM PROXY
const proxyApp = express();
proxyApp.all('/*', async (req, res) => {
    const targetPath = req.originalUrl.substring(1) || 'github.com';
    const targetUrl = targetPath.startsWith('http') ? targetPath : 'https://' + targetPath;

    try {
        const response = await axios({
            method: req.method,
            url: targetUrl,
            responseType: 'arraybuffer',
            validateStatus: () => true
        });

        res.set(response.headers);
        res.send(response.data);
    } catch (err) {
        res.status(502).send(err.message);
    }
});

// 4. HTTPS SERVER
const options = {
    // This points to the files you committed to the repo
    key: fs.readFileSync('apple.key'), 
    cert: fs.readFileSync('apple.crt')
};

https.createServer(options, proxyApp).listen(443, '0.0.0.0', () => {
    console.log('🚀 MITM active on 443');
});

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');

const app = express();
const HEALTH_PORT = process.env.PORT || 8080;

// Health check + CA download
const healthApp = express();
healthApp.get('/', (req, res) => res.send('✅ DNS spoof proxy healthy'));
healthApp.get('/ca.crt', (req, res) => res.download('/certs/ca.crt'));
healthApp.listen(HEALTH_PORT, '0.0.0.0', () => console.log(`🚀 Health check on port ${HEALTH_PORT}`));

// MITM proxy on 443
const privateKey = fs.readFileSync('/certs/apple.key', 'utf8');
const certificate = fs.readFileSync('/certs/apple.crt', 'utf8');

const proxyApp = express();

proxyApp.all('/*', async (req, res) => {
  let targetPath = req.path.substring(1) || 'github.com';
  const targetUrl = targetPath.startsWith('http') ? targetPath : 'https://' + targetPath;

  console.log(`🍎 MITM apple.com/${targetPath} → ${targetUrl}`);

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: { 'User-Agent': req.headers['user-agent'], 'Accept': req.headers.accept },
      data: req.body,
      responseType: 'arraybuffer',
      maxRedirects: 10,
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';
    Object.keys(response.headers).forEach(h => {
      if (!['content-encoding','content-length','transfer-encoding','connection'].includes(h.toLowerCase())) {
        res.set(h, response.headers[h]);
      }
    });

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      let html = response.data.toString('utf-8');
      const $ = cheerio.load(html);

      const attrs = ['href','src','action','data-src','data-href','poster'];
      $(attrs.map(a => `[${a}]`).join(',')).each((_, el) => {
        const $el = $(el);
        for (let attr of attrs) {
          let val = $el.attr(attr);
          if (val && !val.startsWith('#') && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('mailto:')) {
            try {
              const absolute = new URL(val, targetUrl).href;
              $el.attr(attr, `https://apple.com/${absolute}`);
            } catch(e) {}
          }
        }
      });

      res.send($.html());
    } else {
      res.send(Buffer.from(response.data));
    }
  } catch (err) {
    console.error(err.message);
    res.status(502).send('Proxy error');
  }
});

https.createServer({ key: privateKey, cert: certificate }, proxyApp)
  .listen(443, '0.0.0.0', () => {
    console.log('🚀 Apple.com DNS-spoof MITM proxy running on port 443');
  });

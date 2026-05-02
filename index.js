const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT_HTTP = 80;
const PORT_HTTPS = 443;

const privateKey = fs.readFileSync('/certs/apple.key', 'utf8');
const certificate = fs.readFileSync('/certs/apple.crt', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const proxyBase = 'https://apple.com';

app.all('/*', async (req, res) => {
  let targetPath = req.path.substring(1); // remove leading /
  if (!targetPath) return res.redirect('/github.com');

  let targetUrl = targetPath.startsWith('http') ? targetPath : 'https://' + targetPath;

  console.log(`🍎 MITM → ${req.method} ${targetUrl} (Host: ${req.headers.host})`);

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        'User-Agent': req.headers['user-agent'],
        'Accept': req.headers.accept,
        'Accept-Language': req.headers['accept-language'],
        'Referer': req.headers.referer,
      },
      data: req.body,
      responseType: 'arraybuffer',
      maxRedirects: 10,
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';

    // Copy headers (skip hop-by-hop)
    Object.keys(response.headers).forEach(h => {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(h.toLowerCase())) {
        res.set(h, response.headers[h]);
      }
    });

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      let html = response.data.toString('utf-8');
      const $ = cheerio.load(html);

      const attrs = ['href', 'src', 'action', 'data-src', 'data-href', 'poster'];
      $(attrs.map(a => `[${a}]`).join(',')).each((_, el) => {
        const $el = $(el);
        for (let attr of attrs) {
          let val = $el.attr(attr);
          if (val && !val.startsWith('#') && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('mailto:')) {
            try {
              const absolute = new URL(val, targetUrl).href;
              $el.attr(attr, `${proxyBase}/${absolute}`);
            } catch(e) {}
          }
        }
      });

      res.send($.html());
    } else {
      res.send(Buffer.from(response.data));
    }
  } catch (err) {
    console.error(err);
    res.status(502).send(`Proxy error: ${err.message}`);
  }
});

// HTTP → HTTPS redirect
const httpApp = express();
httpApp.all('*', (req, res) => res.redirect(301, `https://${req.hostname}${req.url}`));

// Start servers
const httpServer = httpApp.listen(PORT_HTTP, '0.0.0.0', () => console.log(`🚀 HTTP (redirect) on port ${PORT_HTTP}`));
const httpsServer = https.createServer(credentials, app).listen(PORT_HTTPS, '0.0.0.0', () => {
  console.log(`🚀 HTTPS MITM Proxy listening on port ${PORT_HTTPS}`);
  console.log(`✅ You can now type https://apple.com/github.com in any browser`);
});

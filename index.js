const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 8080;

app.use(express.raw({ type: '*/*', limit: '50mb' }));

app.all('/*', async (req, res) => {
  let path = req.path.substring(1);
  if (path.startsWith('apple.com/')) path = path.substring(11);

  let targetUrl = path.startsWith('http') ? path : 'https://' + path;

  if (!path) {
    return res.send('✅ Usage: /apple.com/github.com or /apple.com/https://example.com');
  }

  try {
    console.log(`🍎 Proxying ${req.method} → ${targetUrl}`);

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        'User-Agent': req.headers['user-agent'],
        'Accept': req.headers.accept,
        'Accept-Language': req.headers['accept-language'],
        'Referer': req.headers.referer,
      },
      data: req.body.length ? req.body : undefined,
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

    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      let html = response.data.toString('utf-8');
      const $ = cheerio.load(html);

      const proxyBase = `http://${req.hostname}:${PORT}`;

      const attrs = ['href','src','action','data-src','data-href','poster'];
      $(attrs.map(a => `[${a}]`).join(',')).each((_, el) => {
        const $el = $(el);
        for (let attr of attrs) {
          let val = $el.attr(attr);
          if (val && !val.startsWith('#') && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('mailto:')) {
            try {
              const absolute = new URL(val, targetUrl).href;
              $el.attr(attr, `${proxyBase}/apple.com/${absolute}`);
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
    res.status(502).send(`Proxy error: ${err.message}`);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Apple rewriting proxy listening on 0.0.0.0:${PORT}`);
});

const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

const app = express();
const PORT_HTTP = 80;
const PORT_HTTPS = 443;

const CERT_DIR = '/certs';
const KEY_PATH = `${CERT_DIR}/apple.key`;
const CERT_PATH = `${CERT_DIR}/apple.crt`;
const CA_CERT_PATH = `${CERT_DIR}/ca.crt`;

function ensureCertificates() {
  if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
  }

  if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CERT_PATH)) {
    console.log('🔑 Generating self-signed certificates for apple.com...');

    // CA (only once)
    if (!fs.existsSync(`${CERT_DIR}/ca.key`)) {
      execSync(`openssl genrsa -out ${CERT_DIR}/ca.key 4096`, { stdio: 'inherit' });
      execSync(`openssl req -x509 -new -nodes -key ${CERT_DIR}/ca.key -sha256 -days 3650 -out ${CERT_DIR}/ca.crt -subj "/C=AU/ST=WA/L=Perth/O=AppleProxy/CN=Apple MITM CA"`, { stdio: 'inherit' });
    }

    // apple.com key + CSR
    execSync(`openssl genrsa -out ${KEY_PATH} 2048`, { stdio: 'inherit' });
    execSync(`openssl req -new -key ${KEY_PATH} -out ${CERT_DIR}/apple.csr -subj "/CN=apple.com"`, { stdio: 'inherit' });

    // Create extension file (this replaces the broken process substitution)
    const extFile = `${CERT_DIR}/apple.ext`;
    fs.writeFileSync(extFile, 'subjectAltName = DNS:apple.com, DNS:www.apple.com\n');

    // Sign the certificate using the extension file
    execSync(`openssl x509 -req -days 365 -in ${CERT_DIR}/apple.csr -CA ${CERT_DIR}/ca.crt -CAkey ${CERT_DIR}/ca.key -CAcreateserial -out ${CERT_PATH} -extfile ${extFile}`, { stdio: 'inherit' });

    console.log('✅ Certificates generated successfully!');
  } else {
    console.log('✅ Certificates already exist – reusing them');
  }
}

// Generate certs BEFORE starting the server
ensureCertificates();

const privateKey = fs.readFileSync(KEY_PATH, 'utf8');
const certificate = fs.readFileSync(CERT_PATH, 'utf8');
const credentials = { key: privateKey, cert: certificate };

const proxyBase = 'https://apple.com';

app.all('/*', async (req, res) => {
  let targetPath = req.path.substring(1);
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
      },
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
    console.error(err.message);
    res.status(502).send(`Proxy error: ${err.message}`);
  }
});

// HTTP → HTTPS redirect
const httpApp = express();
httpApp.all('*', (req, res) => res.redirect(301, `https://${req.hostname}${req.url}`));

httpApp.listen(PORT_HTTP, '0.0.0.0', () => console.log(`🚀 HTTP redirect on port ${PORT_HTTP}`));
https.createServer(credentials, app).listen(PORT_HTTPS, '0.0.0.0', () => {
  console.log(`🚀 HTTPS Apple.com MITM Proxy running on ${PORT_HTTPS}`);
  console.log(`✅ Ready – type https://apple.com/github.com in Safari after setup`);
});

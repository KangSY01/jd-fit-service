const http = require('http');
const https = require('https');
const { URL } = require('url');
const FormData = require('form-data');

async function downloadImage(url){
  return new Promise((resolve, reject)=>{
    if(!url){
      return reject(new Error('imageUrl이 없습니다'));
    }
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      headers: { 'User-Agent': 'timely-ocr/1.0' },
      agent: false
    };
    const req = mod.get(options, (res) => {
      if(res.statusCode !== 200){
        return reject(new Error('image HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          mimeType: res.headers['content-type'] || 'application/octet-stream',
          content: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('image download timeout'));
    });
  });
}

async function ocrImageUrl(imageUrl){
  if(!imageUrl){
    return null;
  }

  let image;
  try {
    image = await downloadImage(imageUrl);
  } catch(e){
    return null;
  }

  const apiKey = process.env.SOLAR_API_KEY;
  if(!apiKey){
    return null;
  }

  const form = new FormData();
  form.append('model', 'ocr');
  form.append('document', image.content, {
    filename: 'document.png',
    contentType: image.mimeType || 'application/octet-stream'
  });

  const endpoint = 'https://api.upstage.ai/v1/document-digitization';
  const parsed = new URL(endpoint);
  const mod = parsed.protocol === 'https:' ? https : http;

  let res;
  try {
    res = await new Promise((resolve, reject)=>{
      const req = mod.request(parsed.hostname, parsed.pathname + (parsed.search || ''), {
        method: 'POST',
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Accept': 'application/json'
        },
        agent: false
      }, (response) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(c));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      });
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error('request timeout'));
      });
      req.on('error', (e) => reject(e));

      form.pipe(req);
      req.end();
    });
  } catch(e){
    return null;
  }

  if(!res || res.status < 200 || res.status >= 300){
    return null;
  }

  try {
    const parsed = JSON.parse(res.body);
    if(parsed && typeof parsed.text === 'string'){
      return parsed.text;
    }
    return null;
  } catch(e){
    return null;
  }
}

module.exports = {
  ocrImageUrl
};
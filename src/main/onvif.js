// ONVIF SOAP helpers. Used by stream.js to discover the live RTSP URL.
const https = require('https');
const crypto = require('crypto');

function securityHeader(username, password) {
  const nonce = crypto.randomBytes(16);
  const created = new Date().toISOString();
  const digest = crypto.createHash('sha1')
    .update(Buffer.concat([nonce, Buffer.from(created), Buffer.from(password)]))
    .digest('base64');

  return (
    '<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">' +
    '<wsse:UsernameToken>' +
    '<wsse:Username>' + username + '</wsse:Username>' +
    '<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">' +
    digest + '</wsse:Password>' +
    '<wsse:Nonce>' + nonce.toString('base64') + '</wsse:Nonce>' +
    '<wsu:Created xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">' +
    created + '</wsu:Created>' +
    '</wsse:UsernameToken></wsse:Security>'
  );
}

function envelope(username, password, innerXml) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope">' +
    '<s:Header>' + securityHeader(username, password) + '</s:Header>' +
    '<s:Body>' + innerXml + '</s:Body></s:Envelope>';
}

function soapPost(ip, path, xml) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: ip,
      port: 443,
      path,
      method: 'POST',
      rejectUnauthorized: false,
      timeout: 6000,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(xml)
      }
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk.toString(); });
      res.on('end', () => resolve(text));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('ONVIF timeout')); });
    req.write(xml);
    req.end();
  });
}

function withCredentials(rtspUrl, username, password) {
  const user = encodeURIComponent(username);
  const pass = encodeURIComponent(password);
  return rtspUrl.replace(/^rtsp:\/\//i, 'rtsp://' + user + ':' + pass + '@');
}

async function getRtspUrl(camera) {
  const profilesXml = await soapPost(
    camera.ip,
    '/onvif/media_service',
    envelope(camera.username, camera.password, '<trt:GetProfiles xmlns:trt="http://www.onvif.org/ver10/media/wsdl"/>')
  );

  const tokens = [...profilesXml.matchAll(/token="(Profile_\d+)"/g)].map((m) => m[1]);
  const token = tokens.find((t) => t.endsWith('102')) || tokens[0];
  if (!token) {
    return null;
  }

  const uriXml = await soapPost(
    camera.ip,
    '/onvif/media_service',
    envelope(
      camera.username,
      camera.password,
      '<trt:GetStreamUri xmlns:trt="http://www.onvif.org/ver10/media/wsdl">' +
      '<trt:StreamSetup><tt:Stream xmlns:tt="http://www.onvif.org/ver10/schema">RTP-Unicast</tt:Stream>' +
      '<tt:Transport xmlns:tt="http://www.onvif.org/ver10/schema"><tt:Protocol>RTSP</tt:Protocol></tt:Transport>' +
      '</trt:StreamSetup><trt:ProfileToken>' + token + '</trt:ProfileToken></trt:GetStreamUri>'
    )
  );

  const match = uriXml.match(/<(?:\w+:)?Uri>([^<]+)</);
  if (!match) {
    return null;
  }

  return withCredentials(match[1].replace(/&amp;/g, '&'), camera.username, camera.password);
}

module.exports = { getRtspUrl };

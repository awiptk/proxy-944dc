const pick = require("../util/pick"),
  fetch = require("node-fetch"),
  shouldCompress = require("../util/shouldCompress"),
  compress = require("../util/compress"),
  DEFAULT_QUALITY = 40;

let requestCountWithoutKey = 0;
let lastResetTime = Date.now();

// DNS Cache untuk menghindari resolve berulang
const dnsCache = new Map();
const DNS_CACHE_TTL = 5 * 60 * 1000; // 5 menit

// Fungsi untuk resolve DNS menggunakan Google DoH (DNS over HTTPS)
async function resolveDNS(hostname) {
  // Cek cache dulu
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL) {
    console.log(`DNS Cache Hit: ${hostname} -> ${cached.ip}`);
    return cached.ip;
  }

  try {
    console.log(`Resolving DNS for: ${hostname}`);
    const response = await fetch(`https://dns.google/resolve?name=${hostname}&type=A`);
    const data = await response.json();
    
    if (data.Answer && data.Answer.length > 0) {
      const ip = data.Answer[0].data;
      console.log(`DNS Resolved: ${hostname} -> ${ip}`);
      
      // Simpan ke cache
      dnsCache.set(hostname, {
        ip: ip,
        timestamp: Date.now()
      });
      
      return ip;
    } else {
      console.log(`No DNS records found for: ${hostname}`);
      return null;
    }
  } catch (error) {
    console.error(`DNS Resolution failed for ${hostname}:`, error.message);
    return null;
  }
}

// Fungsi untuk fetch dengan DNS resolver (pre-warm DNS)
async function fetchWithDNS(url, options = {}) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Skip DNS resolution untuk localhost dan IP address
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return await fetch(url, options);
    }
    
    // Pre-resolve DNS untuk "warm up" DNS cache di Node.js
    const ip = await resolveDNS(hostname);
    
    if (ip) {
      console.log(`DNS Pre-warmed: ${hostname} -> ${ip}, now fetching original URL`);
    } else {
      console.log(`DNS resolution failed for ${hostname}, proceeding with normal fetch`);
    }
    
    // Fetch dengan URL original (bukan IP) - biarkan Node.js handle HTTPS/SNI
    // DNS sudah di-resolve sebelumnya jadi seharusnya lebih cepat
    return await fetch(url, options);
    
  } catch (error) {
    console.error('Error in fetchWithDNS:', error.message);
    // Fallback ke fetch biasa
    return await fetch(url, options);
  }
}

exports.handler = async (e, t) => {
  let { url: r, jpeg: s, l: a, w: width, h: height, q: customQuality, env } = e.queryStringParameters;
  
  // DEBUG: Log environment info
  console.log('ENV_KEY from process:', process.env.ENV_KEY);
  console.log('env parameter:', env);
  console.log('Match:', env === process.env.ENV_KEY);
  
  if (!r)
    return { statusCode: 200, body: "Bandwidth Hero Data Compression Service with DNS Resolver" };
  
  const VALID_ENV_KEY = process.env.ENV_KEY;
  
  // Cek apakah env parameter valid
  const hasValidKey = env && VALID_ENV_KEY && env === VALID_ENV_KEY;
  
  console.log('hasValidKey:', hasValidKey);
  console.log('Request count:', requestCountWithoutKey);
  
  if (!hasValidKey) {
    const now = Date.now();
    const sixtyMinutes = 60 * 60 * 1000;
    
    if (now - lastResetTime > sixtyMinutes) {
      requestCountWithoutKey = 0;
      lastResetTime = now;
    }
    
    requestCountWithoutKey++;
    
    console.log('New request count:', requestCountWithoutKey);
    
    if (requestCountWithoutKey > 5) {
      const timeUntilReset = sixtyMinutes - (now - lastResetTime);
      const minutesLeft = Math.ceil(timeUntilReset / 60000);
      
      return {
        statusCode: 429,
        body: `<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akses Terbatas</title>
</head>
<body style="background: #333; color: white; text-align: center;">
  <h1 style="color: red;">⏰ Akses Terbatas</h1>
  <p><h3>Tunggu <strong style="color: #4ee44e;">${minutesLeft} menit</strong></h3></p>
</body>
</html>`,
        headers: {
          "content-type": "text/html"
        }
      };
    }
  }
  
  const isPhinf = /phinf/i.test(r);
  
  try {
    r = JSON.parse(r);
  } catch {}
  
  Array.isArray(r) && (r = r.join("&url=")),
    (r = r.replace(/http:\/\/1\.1\.\d\.\d\/bmi\.(https?:\/\/)?/i, "http://"));
  
  let d = !s,
    i = parseInt(customQuality || a, 10) || DEFAULT_QUALITY,
    imageWidth = width ? parseInt(width, 10) : null,
    imageHeight = height ? parseInt(height, 10) : null;
  
  try {
    let h = {};
    
    // MODIFIKASI: Gunakan fetchWithDNS instead of fetch
    const response = await fetchWithDNS(r, {
      headers: {
        ...pick(e.headers, ["cookie", "dnt", "referer"]),
        "user-agent": "Mozilla/5.0 (Linux; Android 11; M2102J20SG Build/RKQ1.200826.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36",
        "x-forwarded-for": e.headers["x-forwarded-for"] || e.ip,
        via: "1.1 bandwidth-hero",
      },
    });
    
    if (!response.ok) {
      console.log(`Fetch failed with status: ${response.status}`);
      return { statusCode: response.status || 302 };
    }
    
    h = response.headers;
    const c = await response.buffer();
    const l = response.headers.get("content-type") || "";
    const p = c.length;
    
    if (!shouldCompress(l, p, d))
      return (
        console.log("Bypassing... Size: ", c.length),
        {
          statusCode: 200,
          body: c.toString("base64"),
          isBase64Encoded: !0,
          headers: { "content-encoding": "identity", ...h },
        }
      );
    
    {
      let { err: u, output: y, headers: g } = await compress(c, d, i, p, imageWidth, imageHeight);
      if (u) throw (console.log("Conversion failed: ", r), u);
      console.log(`From ${p}, Saved: ${(p - y.length) / p}%`);
      let $ = y.toString("base64");
      return {
        statusCode: 200,
        body: $,
        isBase64Encoded: !0,
        headers: { "content-encoding": "identity", ...h, ...g },
      };
    }
  } catch (f) {
    return console.error(f), { statusCode: 500, body: f.message || "" };
  }
};

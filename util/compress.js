const pick = require("../util/pick"),
  fetch = require("node-fetch"),
  shouldCompress = require("../util/shouldCompress"),
  compress = require("../util/compress"),
  DEFAULT_QUALITY = 40;

let requestCountWithoutKey = 0;
let lastResetTime = Date.now();

exports.handler = async (e, t) => {
  let { url: r, jpeg: s, l: a, w: width, h: height, q: customQuality, env } = e.queryStringParameters;
  
  console.log('=== REQUEST START ===');
  console.log('URL:', r);
  
  if (!r)
    return { statusCode: 200, body: "Bandwidth Hero Data Compression Service" };
  
  const VALID_ENV_KEY = process.env.ENV_KEY;
  const hasValidKey = env && VALID_ENV_KEY && env === VALID_ENV_KEY;
  
  console.log('hasValidKey:', hasValidKey);
  
  if (!hasValidKey) {
    const now = Date.now();
    const sixtyMinutes = 60 * 60 * 1000;
    
    if (now - lastResetTime > sixtyMinutes) {
      requestCountWithoutKey = 0;
      lastResetTime = now;
    }
    
    requestCountWithoutKey++;
    console.log('Request count:', requestCountWithoutKey);
    
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
  
  console.log('Settings:', { webp: d, quality: i, width: imageWidth, height: imageHeight });
  
  try {
    console.log('Fetching from:', r);
    
    const response = await fetch(r, {
      headers: {
        ...pick(e.headers, ["cookie", "dnt", "referer"]),
        "user-agent": "Mozilla/5.0 (Linux; Android 11; M2102J20SG Build/RKQ1.200826.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36",
        "x-forwarded-for": e.headers["x-forwarded-for"] || e.ip,
        via: "1.1 bandwidth-hero",
      },
      timeout: 30000,
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      console.error(`Fetch failed: ${response.status}`);
      return { 
        statusCode: response.status,
        body: `Failed to fetch: ${response.status}`,
        headers: { "content-type": "text/plain" }
      };
    }
    
    console.log('Reading buffer...');
    const imageBuffer = await response.buffer();
    console.log('Buffer size:', imageBuffer.length);
    
    const contentType = response.headers.get("content-type") || "";
    const originalSize = imageBuffer.length;
    
    if (!shouldCompress(contentType, originalSize, d)) {
      console.log("Bypassing compression");
      return {
        statusCode: 200,
        body: imageBuffer.toString("base64"),
        isBase64Encoded: true,
        headers: { 
          "content-type": contentType,
          "content-length": originalSize
        },
      };
    }
    
    console.log('Compressing...');
    const result = await compress(imageBuffer, d, i, originalSize, imageWidth, imageHeight);
    
    if (result.err) {
      console.error("Compression failed:", result.err.message);
      // Return original
      return {
        statusCode: 200,
        body: imageBuffer.toString("base64"),
        isBase64Encoded: true,
        headers: { 
          "content-type": contentType,
          "x-compression-failed": "true"
        },
      };
    }
    
    console.log('Success! Compressed:', result.output.length);
    
    return {
      statusCode: 200,
      body: result.output.toString("base64"),
      isBase64Encoded: true,
      headers: result.headers,
    };
    
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
    
    return { 
      statusCode: 500, 
      body: error.message,
      headers: { "content-type": "text/plain" }
    };
  }
};

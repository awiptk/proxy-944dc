const pick = require("../util/pick"),
  fetch = require("node-fetch"),
  shouldCompress = require("../util/shouldCompress"),
  compress = require("../util/compress"),
  DEFAULT_QUALITY = 40;

let requestCountWithoutKey = 0;
let lastResetTime = Date.now();

exports.handler = async (e, t) => {
  let { url: r, jpeg: s, l: a, w: width, h: height, q: customQuality, env } = e.queryStringParameters;
  
  console.log('=== VERSI BARU TANPA DNS ===');
  
  if (!r) return { statusCode: 200, body: "Bandwidth Hero Service" };
  
  const hasValidKey = env && process.env.ENV_KEY && env === process.env.ENV_KEY;
  
  if (!hasValidKey) {
    const now = Date.now();
    const sixtyMinutes = 60 * 60 * 1000;
    
    if (now - lastResetTime > sixtyMinutes) {
      requestCountWithoutKey = 0;
      lastResetTime = now;
    }
    
    requestCountWithoutKey++;
    
    if (requestCountWithoutKey > 5) {
      const minutesLeft = Math.ceil((sixtyMinutes - (now - lastResetTime)) / 60000);
      return {
        statusCode: 429,
        body: `<html><body style="background:#333;color:white;text-align:center;"><h1 style="color:red;">⏰ Tunggu ${minutesLeft} menit</h1></body></html>`,
        headers: { "content-type": "text/html" }
      };
    }
  }
  
  try { r = JSON.parse(r); } catch {}
  Array.isArray(r) && (r = r.join("&url="));
  r = r.replace(/http:\/\/1\.1\.\d\.\d\/bmi\.(https?:\/\/)?/i, "http://");
  
  let d = !s,
    i = parseInt(customQuality || a, 10) || DEFAULT_QUALITY,
    imageWidth = width ? parseInt(width, 10) : null,
    imageHeight = height ? parseInt(height, 10) : null;
  
  try {
    const response = await fetch(r, {
      headers: {
        ...pick(e.headers, ["cookie", "dnt", "referer"]),
        "user-agent": "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/136.0 Mobile Safari/537.36",
        "x-forwarded-for": e.headers["x-forwarded-for"] || e.ip,
        via: "1.1 bandwidth-hero",
      },
      timeout: 30000,
    });
    
    if (!response.ok) {
      return { statusCode: response.status, body: "Fetch failed" };
    }
    
    const imageBuffer = await response.buffer();
    const contentType = response.headers.get("content-type") || "";
    const originalSize = imageBuffer.length;
    
    if (!shouldCompress(contentType, originalSize, d)) {
      return {
        statusCode: 200,
        body: imageBuffer.toString("base64"),
        isBase64Encoded: true,
        headers: { "content-type": contentType },
      };
    }
    
    const result = await compress(imageBuffer, d, i, originalSize, imageWidth, imageHeight);
    
    if (result.err) {
      return {
        statusCode: 200,
        body: imageBuffer.toString("base64"),
        isBase64Encoded: true,
        headers: { "content-type": contentType },
      };
    }
    
    return {
      statusCode: 200,
      body: result.output.toString("base64"),
      isBase64Encoded: true,
      headers: result.headers,
    };
    
  } catch (error) {
    console.error('ERROR:', error.message);
    return { statusCode: 500, body: error.message };
  }
};

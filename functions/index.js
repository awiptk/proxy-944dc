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
  console.log('Parameters:', { jpeg: s, webp: !s, quality: customQuality || a, width, height });
  
  if (!r) return { statusCode: 200, body: "Bandwidth Hero Data Compression Service" };
  
  const VALID_ENV_KEY = process.env.ENV_KEY;
  const hasValidKey = env && VALID_ENV_KEY && env === VALID_ENV_KEY;
  
  console.log('Has valid key:', hasValidKey);
  
  if (!hasValidKey) {
    const now = Date.now();
    const sixtyMinutes = 60 * 60 * 1000;
    
    if (now - lastResetTime > sixtyMinutes) {
      requestCountWithoutKey = 0;
      lastResetTime = now;
      console.log('Request counter reset');
    }
    
    requestCountWithoutKey++;
    console.log('Request count:', requestCountWithoutKey);
    
    if (requestCountWithoutKey > 5) {
      const timeUntilReset = sixtyMinutes - (now - lastResetTime);
      const minutesLeft = Math.ceil(timeUntilReset / 60000);
      
      console.log('Rate limit exceeded. Minutes left:', minutesLeft);
      
      return {
        statusCode: 429,
        body: `<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akses Terbatas</title>
</head>
<body style="background: #333; color: white; text-align: center; padding: 50px;">
  <h1 style="color: red;">⏰ Akses Terbatas</h1>
  <h3>Tunggu <strong style="color: #4ee44e;">${minutesLeft} menit</strong></h3>
  <p style="margin-top: 20px; opacity: 0.8;">Gunakan parameter ?env=KEY untuk unlimited access</p>
</body>
</html>`,
        headers: { "content-type": "text/html" }
      };
    }
  }
  
  // Parse URL
  try {
    r = JSON.parse(r);
  } catch {}
  
  Array.isArray(r) && (r = r.join("&url="));
  r = r.replace(/http:\/\/1\.1\.\d\.\d\/bmi\.(https?:\/\/)?/i, "http://");
  
  let d = !s, // useWebP
    i = parseInt(customQuality || a, 10) || DEFAULT_QUALITY,
    imageWidth = width ? parseInt(width, 10) : null,
    imageHeight = height ? parseInt(height, 10) : null;
  
  console.log('Compression settings:', {
    format: d ? 'webp' : 'jpeg',
    quality: i,
    width: imageWidth,
    height: imageHeight
  });
  
  try {
    console.log('Step 1: Fetching image from:', r);
    const fetchStartTime = Date.now();
    
    const response = await fetch(r, {
      headers: {
        ...pick(e.headers, ["cookie", "dnt", "referer"]),
        "user-agent": "Mozilla/5.0 (Linux; Android 11; M2102J20SG Build/RKQ1.200826.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36",
        "x-forwarded-for": e.headers["x-forwarded-for"] || e.ip,
        via: "1.1 bandwidth-hero",
      },
      timeout: 30000,
    });
    
    const fetchDuration = Date.now() - fetchStartTime;
    console.log(`Step 2: Fetch completed in ${fetchDuration}ms`);
    console.log('Response status:', response.status, response.statusText);
    console.log('Response headers:', JSON.stringify([...response.headers.entries()].slice(0, 5)));
    
    if (!response.ok) {
      console.error('Fetch failed with status:', response.status);
      return { 
        statusCode: response.status,
        body: JSON.stringify({
          error: 'Failed to fetch image',
          status: response.status,
          statusText: response.statusText,
          url: r
        }),
        headers: { "content-type": "application/json" }
      };
    }
    
    console.log('Step 3: Reading image buffer...');
    const bufferStartTime = Date.now();
    const imageBuffer = await response.buffer();
    const bufferDuration = Date.now() - bufferStartTime;
    
    console.log(`Buffer read in ${bufferDuration}ms, size: ${imageBuffer.length} bytes`);
    
    const contentType = response.headers.get("content-type") || "";
    const originalSize = imageBuffer.length;
    
    console.log('Content-Type:', contentType);
    
    console.log('Step 4: Checking if should compress...');
    const shouldComp = shouldCompress(contentType, originalSize, d);
    console.log('Should compress:', shouldComp);
    
    if (!shouldComp) {
      console.log('Bypassing compression, returning original image');
      return {
        statusCode: 200,
        body: imageBuffer.toString("base64"),
        isBase64Encoded: true,
        headers: { 
          "content-type": contentType,
          "content-length": originalSize,
          "x-compression": "bypassed"
        },
      };
    }
    
    console.log('Step 5: Compressing image...');
    const compressStartTime = Date.now();
    
    const result = await compress(imageBuffer, d, i, originalSize, imageWidth, imageHeight);
    
    const compressDuration = Date.now() - compressStartTime;
    console.log(`Compression completed in ${compressDuration}ms`);
    
    if (result.err) {
      console.error('Compression failed:', result.err.message);
      console.error('Error stack:', result.err.stack);
      console.log('Returning original image as fallback');
      
      return {
        statusCode: 200,
        body: imageBuffer.toString("base64"),
        isBase64Encoded: true,
        headers: { 
          "content-type": contentType,
          "x-compression": "failed",
          "x-compression-error": result.err.message
        },
      };
    }
    
    const compressedSize = result.output.length;
    const savedBytes = originalSize - compressedSize;
    const savedPercent = ((savedBytes / originalSize) * 100).toFixed(2);
    
    console.log('Step 6: Compression successful!');
    console.log(`Original size: ${originalSize} bytes`);
    console.log(`Compressed size: ${compressedSize} bytes`);
    console.log(`Saved: ${savedBytes} bytes (${savedPercent}%)`);
    console.log('=== REQUEST END ===');
    
    return {
      statusCode: 200,
      body: result.output.toString("base64"),
      isBase64Encoded: true,
      headers: {
        ...result.headers,
        "x-compression": "success",
        "x-saved-percent": savedPercent
      },
    };
    
  } catch (error) {
    console.error('=== ERROR CAUGHT ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('URL that failed:', r);
    
    return { 
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "Unknown error",
        errorType: error.name,
        url: r
      }),
      headers: { "content-type": "application/json" }
    };
  }
};

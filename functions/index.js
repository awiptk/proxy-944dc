const pick = require("../util/pick"),
  fetch = require("node-fetch"),
  shouldCompress = require("../util/shouldCompress"),
  compress = require("../util/compress"),
  DEFAULT_QUALITY = 40;

let requestCountWithoutKey = 0;
let lastResetTime = Date.now();

exports.handler = async (e, t) => {
  let { url: r, jpeg: s, l: a, w: width, h: height, q: customQuality, env } = e.queryStringParameters;
  
  // DEBUG: Log environment info
  console.log('ENV_KEY from process:', process.env.ENV_KEY);
  console.log('env parameter:', env);
  console.log('Match:', env === process.env.ENV_KEY);
  
  if (!r)
    return { statusCode: 200, body: "Bandwidth Hero Data Compression Service" };
  
  const VALID_ENV_KEY = process.env.ENV_KEY;
  
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
  <h1 style="color: red;">&#x23F0; Akses Terbatas</h1>
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
  
  if (!isPhinf) {
    r = `https://proxy.duckduckgo.com/iu/?u=${encodeURIComponent(r)}`;
  }
  
  let d = !s,
    i = parseInt(customQuality || a, 10) || DEFAULT_QUALITY,
    imageWidth = width ? parseInt(width, 10) : null,
    imageHeight = height ? parseInt(height, 10) : null;
  
  try {
    let h = {},
      { data: c, type: l } = await fetch(r, {
        headers: {
          ...pick(e.headers, ["cookie", "dnt", "referer"]),
          "user-agent": "Bandwidth-Hero Compressor",
          "x-forwarded-for": e.headers["x-forwarded-for"] || e.ip,
          via: "1.1 bandwidth-hero",
        },
      }).then(async (e) =>
        e.ok
          ? ((h = e.headers),
            {
              data: await e.buffer(),
              type: e.headers.get("content-type") || "",
            })
          : { statusCode: e.status || 302 },
      ),
      p = c.length;
    
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

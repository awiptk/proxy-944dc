const sharp = require("sharp");

function compress(imageBuffer, useWebp, quality, originalSize, width, height) {
  // Validasi input
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    return Promise.resolve({
      err: new Error('Invalid image buffer'),
      output: null,
      headers: {}
    });
  }

  if (imageBuffer.length === 0) {
    return Promise.resolve({
      err: new Error('Empty image buffer'),
      output: null,
      headers: {}
    });
  }

  let format = useWebp ? "webp" : "jpeg";
  
  try {
    let sharpInstance = sharp(imageBuffer);
    
    // Resize jika ada parameter width atau height
    if (width || height) {
      sharpInstance = sharpInstance.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3'
      });
    }

    return sharpInstance
      .withMetadata(false) // Buang metadata
      .toFormat(format, { 
        quality,
        progressive: true,
        optimizeScans: true,
        chromaSubsampling: '4:2:0',
        mozjpeg: format === 'jpeg'
      })
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        if (!data || !info) {
          throw new Error('Sharp returned invalid result');
        }
        
        return {
          err: null,
          headers: {
            "content-type": `image/${format}`,
            "content-length": info.size,
            "x-original-size": originalSize,
            "x-bytes-saved": originalSize - info.size,
          },
          output: data,
        };
      })
      .catch((err) => {
        console.error('Sharp compression error:', err);
        return { 
          err: err,
          output: null,
          headers: {}
        };
      });
  } catch (error) {
    console.error('Sharp initialization error:', error);
    return Promise.resolve({
      err: error,
      output: null,
      headers: {}
    });
  }
}

module.exports = compress;

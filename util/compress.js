const sharp = require("sharp");

function compress(imagePath, useWebp, quality, originalSize, width, height) {
  let format = useWebp ? "webp" : "jpeg";
  
  let sharpInstance = sharp(imagePath);
  
  if (width || height) {
    sharpInstance = sharpInstance.resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3'
    }).sharpen(0.5, 1, 0.5);
  }

  return sharpInstance
    .toFormat(format, { 
      quality, 
      progressive: true, 
      optimizeScans: true
    })
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({
      err: null,
      headers: {
        "content-type": `image/${format}`,
        "content-length": info.size,
        "x-original-size": originalSize,
        "x-bytes-saved": originalSize - info.size,
      },
      output: data,
    }))
    .catch((err) => ({ err }));
}

module.exports = compress;

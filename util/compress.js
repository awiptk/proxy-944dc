const sharp = require("sharp");

function compress(imagePath, useWebp, quality, originalSize, width, height) {
  let format = useWebp ? "webp" : "jpeg";
  
  let sharpInstance = sharp(imagePath);
  
  // Resize jika ada parameter width atau height dengan smoothing
  if (width || height) {
    sharpInstance = sharpInstance.resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3' // Algoritma terbaik untuk smoothing
    });
  }

  return sharpInstance
    .sharpen() // Tambahkan sharpening ringan untuk hasil lebih halus
    .toFormat(format, { 
      quality, 
      progressive: true, 
      optimizeScans: true,
      effort: 6 // Untuk webp, usaha kompresi lebih tinggi = hasil lebih halus
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

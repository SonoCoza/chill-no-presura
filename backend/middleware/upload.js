const multer = require('multer');
const cloudinary = require('../utils/cloudinary');

// Use memory storage — file is uploaded to Cloudinary in route handlers
const storage = multer.memoryStorage();

const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];

const upload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter: (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo file non consentito. Solo JPEG, PNG, GIF, WebP, AVIF.'));
    }
  },
});

/**
 * Upload a multer memory buffer to Cloudinary.
 * Returns the secure_url string.
 */
function uploadToCloudinary(file, folder = 'chill-no-presura') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });
}

module.exports = upload;
module.exports.uploadToCloudinary = uploadToCloudinary;

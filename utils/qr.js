const QRCode = require('qrcode');

async function generateQRBuffer(url) {
  return QRCode.toBuffer(url, {
    width: 400,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });
}

async function generateQRDataURL(url) {
  return QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' }
  });
}

module.exports = { generateQRBuffer, generateQRDataURL };

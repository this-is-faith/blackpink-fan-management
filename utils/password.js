const { randomBytes, scrypt, scryptSync, timingSafeEqual } = require('node:crypto');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function makeTemporaryPassword() {
  return randomBytes(24).toString('base64url');
}

function verifyPassword(password, storedHash) {
  const parts = storedHash?.split(':');
  if (parts?.length !== 3 || parts[0] !== 'scrypt' || !/^[0-9a-f]{32}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) {
    return Promise.resolve(false);
  }

  const expected = Buffer.from(parts[2], 'hex');
  return new Promise((resolve, reject) => {
    scrypt(password, parts[1], expected.length, (error, actual) => {
      if (error) return reject(error);
      resolve(timingSafeEqual(actual, expected));
    });
  });
}

module.exports = { hashPassword, verifyPassword, makeTemporaryPassword };

import * as Crypto from 'expo-crypto';

// Polyfill dla biblioteki tweetnacl, aby uzywala natywnego silnika Expo do liczb losowych
if (typeof global.crypto !== 'object') {
  (global as any).crypto = {};
}

if (typeof (global as any).crypto.getRandomValues !== 'function') {
  (global as any).crypto.getRandomValues = function getRandomValues(arr: Uint8Array) {
    const randomBytes = Crypto.getRandomBytes(arr.length);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = randomBytes[i];
    }
    return arr;
  };
}

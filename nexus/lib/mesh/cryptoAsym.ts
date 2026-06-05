import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

/**
 * Generuje nową parę kluczy (Prywatny i Publiczny)
 */
export function generateKeyPair() {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

/**
 * Szyfruje wiadomość (Twój klucz prywatny + Klucz publiczny odbiorcy)
 */
export function encryptE2E(text: string, mySecretKeyBase64: string, theirPublicKeyBase64: string): string | null {
  try {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageUint8 = naclUtil.decodeUTF8(text);
    const mySecretKey = naclUtil.decodeBase64(mySecretKeyBase64);
    const theirPublicKey = naclUtil.decodeBase64(theirPublicKeyBase64);

    const encrypted = nacl.box(messageUint8, nonce, theirPublicKey, mySecretKey);
    
    // Złączamy Nonce z zaszyfrowaną wiadomością, żeby odbiorca wiedział jak to zdeszyfrować
    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    return naclUtil.encodeBase64(fullMessage);
  } catch (e) {
    console.error("Encryption error:", e);
    return null;
  }
}

/**
 * Odszyfrowuje wiadomość (Twój klucz prywatny + Klucz publiczny nadawcy)
 */
export function decryptE2E(cipherBase64: string, mySecretKeyBase64: string, theirPublicKeyBase64: string): string | null {
  try {
    const messageWithNonceAsUint8Array = naclUtil.decodeBase64(cipherBase64);
    const nonce = messageWithNonceAsUint8Array.slice(0, nacl.box.nonceLength);
    const message = messageWithNonceAsUint8Array.slice(nacl.box.nonceLength, messageWithNonceAsUint8Array.length);

    const mySecretKey = naclUtil.decodeBase64(mySecretKeyBase64);
    const theirPublicKey = naclUtil.decodeBase64(theirPublicKeyBase64);

    const decrypted = nacl.box.open(message, nonce, theirPublicKey, mySecretKey);
    if (!decrypted) return null; // Zła para kluczy lub uszkodzony pakiet

    return naclUtil.encodeUTF8(decrypted);
  } catch (e) {
    return null;
  }
}

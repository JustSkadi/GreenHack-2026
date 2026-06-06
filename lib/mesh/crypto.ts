import CryptoJS from 'crypto-js';

/**
 * Szyfruje tekst przy użyciu hasła (Klucz Grupy) algorytmem AES.
 */
export function encryptText(text: string, secret: string): string {
  if (!secret) return text;
  return CryptoJS.AES.encrypt(text, secret).toString();
}

/**
 * Próbuje rozszyfrować tekst. 
 * Jeśli hasło jest błędne lub ciąg nie jest poprawnym base64, zwraca null.
 */
export function decryptText(cipher: string, secret: string): string | null {
  if (!secret) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, secret);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    // Jeśli decrypted jest pustym stringiem, oznacza to złe hasło
    if (!decrypted) return null; 
    return decrypted;
  } catch(e) {
    // Rzuci błędem np. przy złym formatowaniu (Malformed UTF-8)
    return null;
  }
}

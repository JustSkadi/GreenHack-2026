const net = require('net');
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');

// Generowanie "fałszywych" kluczy do zrzutu ekranu
const senderKeys = nacl.box.keyPair();
const receiverKeys = nacl.box.keyPair();

const text = "Krytyczny Alert: Zlokalizowano potrzebujacych! Ranni w sektorze B.";
const nonce = nacl.randomBytes(nacl.box.nonceLength);
const messageUint8 = naclUtil.decodeUTF8(text);
const encrypted = nacl.box(messageUint8, nonce, receiverKeys.publicKey, senderKeys.secretKey);

const fullMessage = new Uint8Array(nonce.length + encrypted.length);
fullMessage.set(nonce);
fullMessage.set(encrypted, nonce.length);
const encryptedBase64 = naclUtil.encodeBase64(fullMessage);

const packet = {
  type: "MESSAGE",
  payload: {
    id: "a1b2c3d4e5f6",
    senderId: "+48 500 111 222",
    recipientId: "+48 600 333 444",
    senderTier: 4,
    content: encryptedBase64,
    encrypted: true,
    isPriority: false,
    trustScore: 100,
    hops: ["+48 500 111 222"],
    ttl: 5,
    timestamp: Date.now()
  }
};

const server = net.createServer((socket) => {
  socket.on('data', () => {});
});

server.listen(8888, '127.0.0.1', () => {
  console.log('Symulator sieci Mesh dziala. Wlacz Wireshark i nasluchuj na karcie Loopback (Adapter for loopback traffic capture).');
  console.log('Kiedy bedziesz gotowy, wcisnij ENTER, aby wyslac pakiet...');

  process.stdin.once('data', () => {
    const client = new net.Socket();
    client.connect(8888, '127.0.0.1', () => {
      const dataStr = JSON.stringify(packet) + '\n';
      client.write(dataStr);
      console.log('Pakiet wyslany! Zlap go w Wiresharku.');
      setTimeout(() => process.exit(0), 1000);
    });
  });
});

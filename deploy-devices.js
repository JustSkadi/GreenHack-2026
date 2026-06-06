const { execSync } = require('child_process');

console.log('🔄 Wyszukiwanie podłączonych urządzeń Android...');
try {
  const devicesOutput = execSync('adb devices').toString();
  const devices = devicesOutput
    .split('\n')
    .slice(1)
    .map(line => line.split('\t')[0].trim())
    .filter(id => id.length > 0);

  if (devices.length === 0) {
    console.log('❌ Nie znaleziono podłączonych urządzeń. Sprawdź kabel i debugowanie USB.');
    process.exit(1);
  }

  console.log(`✅ Znaleziono ${devices.length} urządzeń: ${devices.join(', ')}`);
  console.log('🚀 Rozpoczynam budowanie i wgrywanie natywnej aplikacji...');

  for (const deviceId of devices) {
    console.log(`\n==========================================`);
    console.log(`📱 Wgrywanie na urządzenie: ${deviceId}`);
    console.log(`==========================================`);
    
    // Uruchamianie kompilacji dla konkretnego urządzenia
    execSync(`npx expo run:android -d ${deviceId}`, { stdio: 'inherit' });
  }

  console.log('\n🎉 Gotowe! Aplikacja została wgrana na wszystkie urządzenia.');
} catch (error) {
  console.error('❌ Wystąpił błąd podczas wdrażania:', error.message);
}

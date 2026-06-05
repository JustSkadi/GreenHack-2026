const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ANSI Colors for terminal styling
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m"
};

const PACKAGE_NAME = "com.nexus.app";
const ACTIVITY_NAME = "com.nexus.app/.MainActivity";
const ANDROID_DIR = path.join(__dirname, 'nexus', 'android');

// Resolve APK paths
const APK_PATHS = {
  release: path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  debug: path.join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
};

// Auto-detect ADB location if not in PATH
function getAdbCommand() {
  try {
    execSync('adb --version', { stdio: 'ignore' });
    return 'adb';
  } catch (e) {
    const localAppData = process.env.LOCALAPPDATA || '';
    const androidHome = process.env.ANDROID_HOME || '';
    const possiblePaths = [
      path.join(localAppData, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
      path.join(androidHome, 'platform-tools', 'adb.exe'),
      'C:\\Android\\sdk\\platform-tools\\adb.exe',
      'C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe'
    ];
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        return `"${p}"`;
      }
    }
  }
  return null;
}

const ADB = getAdbCommand();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Get connected devices list
function getConnectedDevices() {
  if (!ADB) {
    return [];
  }
  try {
    const output = execSync(`${ADB} devices`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    const devices = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        devices.push({
          id: parts[0],
          status: parts[1] // 'device', 'unauthorized', 'offline'
        });
      }
    }
    return devices;
  } catch (err) {
    return [];
  }
}

// Get detailed info for a device (Model, Manufacturer)
function getDeviceInfo(deviceId) {
  try {
    const manufacturer = execSync(`${ADB} -s ${deviceId} shell getprop ro.product.manufacturer`, { encoding: 'utf8' }).trim();
    const model = execSync(`${ADB} -s ${deviceId} shell getprop ro.product.model`, { encoding: 'utf8' }).trim();
    return `${manufacturer} ${model}`;
  } catch (e) {
    return "Nieznane urządzenie";
  }
}

// Execute command with real-time output
function runCommand(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`\n${COLORS.dim}> ${command}${COLORS.reset}`);
    const proc = exec(command, { cwd });

    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(COLORS.red + data + COLORS.reset);
    });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Komenda zakończyła się kodem błędu ${code}`));
    });
  });
}

// Parallel install on devices
function installOnDevices(devices, apkPath, setupReverse = false) {
  const promises = devices.map(device => {
    return new Promise((resolve) => {
      console.log(`\n${COLORS.cyan}[${device.id}] Rozpoczynanie instalacji...${COLORS.reset}`);

      // Install
      exec(`${ADB} -s ${device.id} install -r "${apkPath}"`, (err, stdout, stderr) => {
        if (err) {
          console.error(`${COLORS.red}[${device.id}] Błąd instalacji: ${stderr.trim() || err.message}${COLORS.reset}`);
          resolve({ device, success: false });
          return;
        }

        console.log(`${COLORS.green}[${device.id}] Sukces: Zainstalowano aplikację.${COLORS.reset}`);

        // Setup reverse port if Debug mode
        if (setupReverse) {
          try {
            execSync(`${ADB} -s ${device.id} reverse tcp:8081 tcp:8081`);
            console.log(`${COLORS.yellow}[${device.id}] Sukces: Przekierowano port 8081 (Metro).${COLORS.reset}`);
          } catch (e) {
            console.log(`${COLORS.dim}[${device.id}] Pomiń reverse (częste dla połączeń bezprzewodowych).${COLORS.reset}`);
          }
        }

        // Start app
        exec(`${ADB} -s ${device.id} shell am start -n ${ACTIVITY_NAME}`, (startErr) => {
          if (startErr) {
            console.error(`${COLORS.red}[${device.id}] Nie udało się uruchomić aplikacji: ${startErr.message}${COLORS.reset}`);
          } else {
            console.log(`${COLORS.green}[${device.id}] Sukces: Aplikacja została uruchomiona!${COLORS.reset}`);
          }
          resolve({ device, success: true });
        });
      });
    });
  });

  return Promise.all(promises);
}

// Main Flow
async function main() {
  console.clear();
  console.log(`${COLORS.bright}${COLORS.bgGreen}  NEXUS - DEPLOYMENT HELPER (MULTIPLE DEVICES)  ${COLORS.reset}\n`);

  if (!ADB) {
    console.log(`${COLORS.red}${COLORS.bright}BŁĄD: Nie znaleziono narzędzia ADB!${COLORS.reset}`);
    console.log(`Upewnij się, że:`);
    console.log(`1. Masz zainstalowane Android SDK / Android Studio.`);
    console.log(`2. Narzędzie adb.exe znajduje się w zmiennej środowiskowej PATH,`);
    console.log(`   lub w standardowej lokalizacji: %LOCALAPPDATA%\\Android\\Sdk\\platform-tools`);
    rl.close();
    return;
  }

  // 1. Check devices
  const allDevices = getConnectedDevices();

  if (allDevices.length === 0) {
    console.log(`${COLORS.yellow}Nie znaleziono żadnych urządzeń Android podłączonych przez USB lub Wi-Fi.${COLORS.reset}`);
    console.log(`\n${COLORS.bright}Wskazówki jak podłączyć urządzenia:${COLORS.reset}`);
    console.log(`1. Włącz 'Opcje programistyczne' oraz 'Debugowanie USB' na telefonach.`);
    console.log(`2. Podłącz telefony kablem USB do komputera.`);
    console.log(`3. Zaakceptuj klucz RSA na ekranie telefonu (zezwól na debugowanie).`);
    console.log(`4. Aby połączyć bezprzewodowo (Wi-Fi):`);
    console.log(`   a. Podłącz telefon kablem USB.`);
    console.log(`   b. Uruchom: adb tcpip 5555`);
    console.log(`   c. Odłącz kabel USB i uruchom: adb connect <IP_TELEFONU>:5555`);
    console.log(`\nCo chcesz zrobić?`);
    console.log(`1) Spróbuj wykryć ponownie`);
    console.log(`2) Parowanie bezprzewodowe Android 11+ (BEZ KABLA)`);
    console.log(`3) Połączenie starsze (Android 10-, wymaga kabla na start)`);
    console.log(`4) Wyjdź`);

    const choice = await ask(`Wybierz opcję (1-4): `);
    if (choice === '1') {
      main();
    } else if (choice === '2') {
      await connectWirelessAndroid11();
      main();
    } else if (choice === '3') {
      await connectWireless();
      main();
    } else {
      rl.close();
    }
    return;
  }

  // List detected devices
  console.log(`${COLORS.bright}Wykryte urządzenia:${COLORS.reset}`);
  allDevices.forEach((dev, idx) => {
    let statusText = dev.status;
    let color = COLORS.green;
    if (dev.status === 'unauthorized') {
      statusText = 'Brak autoryzacji (zaakceptuj komunikat na telefonie!)';
      color = COLORS.red;
    } else if (dev.status === 'offline') {
      statusText = 'Offline (odłączony/zablokowany)';
      color = COLORS.yellow;
    }

    const name = dev.status === 'device' ? getDeviceInfo(dev.id) : '';
    console.log(` ${idx + 1}) [${dev.id}] - ${color}${statusText}${COLORS.reset} ${name ? `(${name})` : ''}`);
  });

  // Warn if < 2 devices
  if (allDevices.length < 2) {
    console.log(`\n${COLORS.yellow}OSTRZEŻENIE: Podłączono tylko 1 urządzenie. Do testowania sieci mesh zalecamy co najmniej 2 urządzenia.${COLORS.reset}`);
  }

  // Device selection
  let selectedDevices = [];
  if (allDevices.length === 1) {
    console.log(`\n${COLORS.cyan}Wybrano jedyne podłączone urządzenie.${COLORS.reset}`);
    selectedDevices = allDevices;
  } else {
    console.log(`\n${COLORS.bright}Wybierz urządzenia do instalacji (np. '1', '1,2' lub 'all'):${COLORS.reset}`);
    const devInput = await ask(`Wprowadź numery oddzielone przecinkiem: `);
    if (devInput.toLowerCase() === 'all') {
      selectedDevices = allDevices;
    } else {
      const indices = devInput.split(',').map(x => parseInt(x.trim()) - 1);
      selectedDevices = allDevices.filter((_, idx) => indices.includes(idx));
    }
  }

  // Filter out unauthorized/offline for installation
  const activeDevices = selectedDevices.filter(d => d.status === 'device');
  if (activeDevices.length === 0) {
    console.log(`${COLORS.red}\nBłąd: Żadne z wybranych urządzeń nie jest w stanie gotowości (status: device).${COLORS.reset}`);
    rl.close();
    return;
  }

  console.log(`\nWybrane urządzenia do instalacji:`);
  activeDevices.forEach(d => console.log(` - ${d.id} (${getDeviceInfo(d.id)})`));

  // Build & deploy options
  console.log(`\n${COLORS.bright}Wybierz wariant instalacji:${COLORS.reset}`);
  console.log(`${COLORS.green}${COLORS.bright}1) Wariant OFFLINE (Release APK) - ZALECANY DO TESTÓW MESH${COLORS.reset}`);
  console.log(`   - Buduje spakowaną aplikację produkcyjną (JS wgrany bezpośrednio do pliku APK).`);
  console.log(`   - Nie potrzebuje uruchomionego serwera Metro (npm start) na laptopie.`);
  console.log(`   - Działa w pełni offline, aplikacja NIE wywali się przy rozłączaniu z Wi-Fi komputera.`);
  console.log(`   - Budowanie trwa dłużej (~1-3 minuty za pierwszym razem).`);

  console.log(`\n${COLORS.blue}2) Wariant DEWELOPERSKI (Debug APK) - Szybkie zmiany w kodzie${COLORS.reset}`);
  console.log(`   - Buduje wersję deweloperską. Wymaga uruchomionego Metro server na komputerze (npm start).`);
  console.log(`   - Konfiguruje automatycznie 'adb reverse' (przekierowanie portu 8081).`);
  console.log(`   - Budowanie jest szybsze, kod pobierany jest dynamicznie z laptopa.`);

  console.log(`\n${COLORS.dim}3) Szybka instalacja istniejącego wariantu OFFLINE (bez budowania)${COLORS.reset}`);
  console.log(`   - Instaluje ostatnio zbudowany plik app-release.apk (oszczędza czas).`);

  console.log(`\n${COLORS.dim}4) Szybka instalacja istniejącego wariantu DEWELOPERSKIEGO (bez budowania)${COLORS.reset}`);
  console.log(`   - Instaluje ostatnio zbudowany plik app-debug.apk i konfiguruje porty.`);

  console.log(`\n5) Parowanie bezprzewodowe Android 11+ (BEZ KABLA)`);
  console.log(`6) Połączenie starsze (Android 10-, wymaga kabla na start)`);
  console.log(`7) Tylko przekierowanie portów (adb reverse)`);
  console.log(`8) Anuluj`);

  const variantChoice = await ask(`\nWybierz opcję (1-8): `);

  switch (variantChoice) {
    case '1':
      await buildAndInstall('release', activeDevices);
      break;
    case '2':
      await buildAndInstall('debug', activeDevices, true);
      break;
    case '3':
      await installExisting('release', activeDevices);
      break;
    case '4':
      await installExisting('debug', activeDevices, true);
      break;
    case '5':
      await connectWirelessAndroid11();
      main();
      break;
    case '6':
      await connectWireless();
      main();
      break;
    case '7':
      setupReverseOnly(activeDevices);
      rl.close();
      break;
    default:
      console.log('Anulowano.');
      rl.close();
  }
}

// Build and Install flow
async function buildAndInstall(variant, devices, setupReverse = false) {
  console.log(`\n${COLORS.bright}Rozpoczynam budowanie wariantu: ${variant.toUpperCase()}...${COLORS.reset}`);

  const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const task = variant === 'release' ? 'assembleRelease' : 'assembleDebug';

  try {
    // Run build inside nexus/android
    await runCommand(`${gradlewCmd} ${task}`, ANDROID_DIR);

    console.log(`\n${COLORS.green}${COLORS.bright}Budowanie zakończone sukcesem! Rozpoczynam wdrażanie...${COLORS.reset}`);
    await deployApk(variant, devices, setupReverse);
  } catch (err) {
    console.error(`\n${COLORS.red}${COLORS.bright}BŁĄD BUDOWANIA:${COLORS.reset} Nie udało się skompilować aplikacji.`);
    console.error(err.message);
    rl.close();
  }
}

// Install existing APK
async function installExisting(variant, devices, setupReverse = false) {
  const apkPath = APK_PATHS[variant];
  if (!fs.existsSync(apkPath)) {
    console.error(`\n${COLORS.red}Błąd: Plik APK nie istnieje pod ścieżką: ${apkPath}${COLORS.reset}`);
    console.log(`Musisz najpierw zbudować ten wariant (opcja 1 lub 2).`);
    rl.close();
    return;
  }

  console.log(`\n${COLORS.bright}Instalowanie istniejącego pliku APK: ${path.basename(apkPath)}...${COLORS.reset}`);
  await deployApk(variant, devices, setupReverse);
}

// Deploy helper
async function deployApk(variant, devices, setupReverse) {
  const apkPath = APK_PATHS[variant];
  const results = await installOnDevices(devices, apkPath, setupReverse);

  console.log(`\n${COLORS.bright}--- RAPORT DEPLOYMENTU ---${COLORS.reset}`);
  let allSuccess = true;
  results.forEach(res => {
    if (res.success) {
      console.log(` [${res.device.id}]: ${COLORS.green}SUKCES${COLORS.reset} (${getDeviceInfo(res.device.id)})`);
    } else {
      console.log(` [${res.device.id}]: ${COLORS.red}BŁĄD${COLORS.reset}`);
      allSuccess = false;
    }
  });

  if (allSuccess) {
    console.log(`\n${COLORS.green}${COLORS.bright}Aplikacja została pomyślnie załadowana na wszystkie wybrane urządzenia!${COLORS.reset}`);
    if (variant === 'debug') {
      console.log(`\n${COLORS.yellow}PAMIĘTAJ: Wersja deweloperska wymaga uruchomionego serwera Metro. Uruchom w konsoli w folderze 'nexus':${COLORS.reset}`);
      console.log(`${COLORS.bright}npm run start${COLORS.reset}`);
    } else {
      console.log(`\n${COLORS.green}Wersja Release działa offline. Możesz odłączyć urządzenia od komputera i testować Wi-Fi Direct!${COLORS.reset}`);
    }
  } else {
    console.log(`\n${COLORS.red}Niektóre urządzenia zgłosiły błędy podczas instalacji. Sprawdź komunikaty powyżej.${COLORS.reset}`);
  }
  rl.close();
}

// Helper to configure ADB over Wi-Fi (Android 11+ Pair)
async function connectWirelessAndroid11() {
  console.log(`\n${COLORS.bright}Parowanie bezprzewodowe (Android 11+ BEZ KABLI):${COLORS.reset}`);
  console.log(`1. W telefonie wejdź w Opcje Programistyczne -> Debugowanie bezprzewodowe (włącz).`);
  console.log(`2. Kliknij w napis 'Debugowanie bezprzewodowe' i wybierz 'Sparuj urządzenie za pomocą kodu parowania'.`);

  const pairIpPort = await ask(`\nWpisz 'Adres IP i port' z okienka parowania (np. 192.168.1.15:41234): `);
  if (!pairIpPort) {
    console.log('Anulowano.');
    return;
  }

  const pairCode = await ask(`Wpisz 6-cyfrowy 'Kod parowania Wi-Fi' z ekranu: `);

  try {
    console.log(`Parowanie z ${pairIpPort}...`);
    const pairResult = execSync(`${ADB} pair ${pairIpPort} ${pairCode}`, { encoding: 'utf8' }).trim();
    console.log(`${COLORS.green}${pairResult}${COLORS.reset}`);

    console.log(`\n${COLORS.yellow}TERAZ WAŻNE: Po udanym sparowaniu okienko z kodem na telefonie zniknie.${COLORS.reset}`);
    console.log(`Na głównym ekranie 'Debugowania bezprzewodowego' w sekcji 'Adres IP i port' zobaczysz NOWY port.`);
    const connectIpPort = await ask(`Wpisz ten NOWY 'Adres IP i port' do ostatecznego połączenia (np. 192.168.1.15:37890): `);

    if (connectIpPort) {
      console.log(`Łączenie z ${connectIpPort}...`);
      const connectResult = execSync(`${ADB} connect ${connectIpPort}`, { encoding: 'utf8' }).trim();
      console.log(`${COLORS.green}${connectResult}${COLORS.reset}`);
    }
  } catch (err) {
    console.error(`${COLORS.red}Błąd podczas parowania/łączenia: ${err.message}${COLORS.reset}`);
  }
}

// Helper to configure ADB over Wi-Fi (Old method)
async function connectWireless() {
  console.log(`\n${COLORS.bright}Konfiguracja ADB bezprzewodowego (Wi-Fi):${COLORS.reset}`);
  console.log(`Kroki:`);
  console.log(`1. Podłącz telefon kablem USB do komputera.`);
  console.log(`2. Upewnij się, że telefon i komputer są w tej samej sieci Wi-Fi.`);
  console.log(`3. Odczytaj IP telefonu (np. w Ustawienia -> Informacje o telefonie -> Stan -> Adres IP).`);

  const ip = await ask(`\nWpisz adres IP telefonu (np. 192.168.1.15): `);
  if (!ip) {
    console.log('Anulowano.');
    return;
  }

  try {
    console.log(`Uruchamianie serwera ADB na porcie 5555...`);
    execSync(`${ADB} tcpip 5555`);
    console.log(`Odłącz teraz kabel USB.`);
    await ask(`Naciśnij [Enter] po odłączeniu kabla USB, aby połączyć się przez Wi-Fi...`);

    console.log(`Łączenie z ${ip}:5555...`);
    const connectResult = execSync(`${ADB} connect ${ip}:5555`, { encoding: 'utf8' }).trim();
    console.log(`${COLORS.green}${connectResult}${COLORS.reset}`);
  } catch (err) {
    console.error(`${COLORS.red}Błąd podczas nawiązywania połączenia: ${err.message}${COLORS.reset}`);
  }
}

// Helper to setup reverse port mapping only
function setupReverseOnly(devices) {
  console.log(`\nUruchamianie adb reverse tcp:8081 tcp:8081...`);
  devices.forEach(device => {
    try {
      execSync(`${ADB} -s ${device.id} reverse tcp:8081 tcp:8081`);
      console.log(` [${device.id}]: ${COLORS.green}Port przekierowany (8081)${COLORS.reset}`);
    } catch (e) {
      console.log(` [${device.id}]: ${COLORS.red}Błąd przekierowania portu${COLORS.reset}`);
    }
  });
}

// Run the script
main();

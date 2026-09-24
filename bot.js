const { Client } = require('discord.js-selfbot-v13');

// -------------------------------------------------------------------
// ORTAM DEĞİŞKENLERİ (Railway Variables'tan gelir)
// -------------------------------------------------------------------
const TOKEN = process.env.SELF_TOKEN;
const KANAL_ID = process.env.KANAL_ID;
const OWO_BOT_ID = process.env.OWO_BOT_ID || '408785106942164992';
const BASLANGIC = parseInt(process.env.BASLANGIC_COOLDOWN || '15', 10);
const ARTIS = parseInt(process.env.COOLDOWN_ARTIS || '1', 10);
const KOMUTLAR = (process.env.KOMUTLAR || 'owo hunt,owo battle,owo pray')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

// -------------------------------------------------------------------
// İSTEMCİ
// -------------------------------------------------------------------
const client = new Client({ checkUpdate: false });

let cooldown = BASLANGIC;
let muteUntil = 0;
let calisiyor = false;

// -------------------------------------------------------------------
// HAZIR OLUNCA
// -------------------------------------------------------------------
client.on('ready', async () => {
  console.log(`[SELF] Giriş yapıldı: ${client.user.tag}`);

  const kanal = await client.channels.fetch(KANAL_ID).catch(() => null);
  if (!kanal) {
    console.log(`[SELF] Kanal bulunamadı: ${KANAL_ID}, çıkılıyor.`);
    process.exit(1);
  }

  console.log(`[SELF] Kanal: #${kanal.name}`);
  owoKas(kanal);
});

// -------------------------------------------------------------------
// OWO MESAJLARINI DİNLE (mute / cooldown tespiti)
// -------------------------------------------------------------------
client.on('messageCreate', (message) => {
  if (message.author.id !== OWO_BOT_ID) return;

  const icerik = message.content.toLowerCase();
  const now = Date.now();

  // Cooldown mesajı (log)
  const cdMatch = icerik.match(/in (\d+)\s*seconds/);
  if (cdMatch) {
    console.log(`[OWO] cooldown mesajı: ${cdMatch[1]}s`);
  }

  // Mute tespiti
  if (icerik.includes('muted')) {
    const m = icerik.match(/muted for (\d+)\s*(minute|second|hour|min|sec)/);
    if (m) {
      const adet = parseInt(m[1], 10);
      const brm = m[2];
      let sn;
      if (brm.includes('hour')) sn = adet * 3600;
      else if (brm.includes('min')) sn = adet * 60;
      else sn = adet;
      muteUntil = now + sn * 1000;
      console.log(`[OWO] MUTE algılandı: ${sn}s bekleyecek`);
    } else {
      muteUntil = now + 300 * 1000;
      console.log('[OWO] MUTE algılandı (süresiz): 300s');
    }
  }

  // Geçici kısıtlama
  if (icerik.includes("you can't use") || icerik.includes('slow down')) {
    muteUntil = now + 5000;
    console.log('[OWO] Geçici kısıtlama: 5s');
  }
});

// -------------------------------------------------------------------
// YARDIMCI: bekleme
// -------------------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -------------------------------------------------------------------
// ANA DÖNGÜ
// -------------------------------------------------------------------
async function owoKas(kanal) {
  if (calisiyor) return;
  calisiyor = true;

  console.log(
    `[SELF] Kasma başladı. cd=${cooldown}s, komutlar=${JSON.stringify(KOMUTLAR)}`
  );

  while (client.isReady()) {
    const now = Date.now();

    // Mute beklemesi
    if (now < muteUntil) {
      const bekle = muteUntil - now;
      console.log(`[SELF] Mute: ${(bekle / 1000).toFixed(1)}s bekleniyor...`);
      await sleep(bekle);
      continue;
    }

    // Kendi cooldown'umuz
    console.log(`[SELF] ${cooldown}s bekleniyor...`);
    await sleep(cooldown * 1000);

    // Bekleme sırasında mute gelmişse tekrar kontrol
    if (Date.now() < muteUntil) continue;

    const komut = KOMUTLAR[Math.floor(Math.random() * KOMUTLAR.length)];

    try {
      await kanal.send(komut);
      console.log(`[SELF] gönderildi: ${komut} (cd=${cooldown}s)`);
    } catch (e) {
      console.log(`[SELF] gönderme hatası: ${e.message}`);
      await sleep(5000);
      continue;
    }

    // Cooldown'u artır: 15 → 16 → 17 ...
    cooldown += ARTIS;

    // OwO cevabı gelsin diye kısa bekleme
    await sleep(2000);
  }
}

// -------------------------------------------------------------------
// ÇALIŞTIR
// -------------------------------------------------------------------
if (!TOKEN) {
  console.log('❌ SELF_TOKEN ortam değişkeni yok!');
  process.exit(1);
}
if (!KANAL_ID) {
  console.log('❌ KANAL_ID ortam değişkeni yok!');
  process.exit(1);
}

client.login(TOKEN).catch((e) => {
  console.log(`❌ Giriş başarısız: ${e.message}`);
  process.exit(1);
});

// Çökme koruması
process.on('unhandledRejection', (err) => {
  console.log(`[HATA] unhandledRejection: ${err}`);
});
process.on('uncaughtException', (err) => {
  console.log(`[HATA] uncaughtException: ${err}`);
});

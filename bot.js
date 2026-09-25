const express = require('express');
const { Client } = require('discord.js-selfbot-v13');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PANEL_KEY = process.env.PANEL_KEY || 'degistir-bunu';
const OWO_BOT_ID = process.env.OWO_BOT_ID || '408785106942164992';

// -------------------------------------------------------------------
// AYARLAR
// -------------------------------------------------------------------
const BASLANGIC_COOLDOWN = parseInt(process.env.BASLANGIC_COOLDOWN || '15', 10);
const MAX_COOLDOWN       = parseInt(process.env.MAX_COOLDOWN       || '20', 10);
const ARTIS              = parseInt(process.env.COOLDOWN_ARTIS    || '1',  10);

// CF ayarları
const CF_AKTIF       = (process.env.CF_AKTIF || 'true') === 'true';
const CF_MIN_BAKIYE  = parseInt(process.env.CF_MIN_BAKIYE  || '200', 10);  // bu bakiyenin altındaysa cf atmaz
const CF_BAHIS_ORANI = parseFloat(process.env.CF_BAHIS_ORANI || '0.05');   // bakiyenin %5'i
const CF_MIN_BAHIS   = parseInt(process.env.CF_MIN_BAHIS   || '10',  10);
const CF_MAX_BAHIS   = parseInt(process.env.CF_MAX_BAHIS   || '100', 10);
const CF_INTERVAL    = parseInt(process.env.CF_INTERVAL    || '300000', 10); // 5 dk

// Ana komutlar
const ANA_KOMUTLAR = ['owo hunt', 'owo battle', 'owo pray'];

// Özel komutlar (zamanlanmış)
const OZEL_KOMUTLAR = [
  { cmd: 'owo daily',    interval: 12 * 60 * 60 * 1000, son: 0 },
  { cmd: 'owo cookie',   interval: 24 * 60 * 60 * 1000, son: 0 },
  { cmd: 'owo vote',     interval: 12 * 60 * 60 * 1000, son: 0 },
  { cmd: 'owo quest',    interval: 30 * 60 * 1000,      son: 0 },
  { cmd: 'owo sell all', interval: 30 * 60 * 1000,      son: 0 },  // otomatik satış
  { cmd: 'owo cash',     interval: 10 * 60 * 1000,      son: 0 },  // bakiye güncelle
];

// -------------------------------------------------------------------
// HESAP DEPOSU
// -------------------------------------------------------------------
const hesaplar = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -------------------------------------------------------------------
// HESAP BAŞLAT
// -------------------------------------------------------------------
async function hesapBaslat(token, kanalId) {
  if (hesaplar.has(token)) throw new Error('Bu token zaten ekli.');

  const client = new Client({ checkUpdate: false });
  const ozel = OZEL_KOMUTLAR.map((k) => ({ ...k }));

  const kayit = {
    client,
    cooldown: BASLANGIC_COOLDOWN,
    muteUntil: 0,
    kanalId,
    durum: 'bağlanıyor',
    user: null,
    durdu: false,
    ozel,
    bakiye: 0,           // en son bilinen bakiye
    cfSon: 0,            // son cf zamanı
    cfSeri: 0,           // üst üste kayıp sayısı
    cfMola: 0,           // cf molası bitiş zamanı
    kazanc: 0,           // toplam kazanç (log)
    kayip: 0,            // toplam kayıp (log)
  };
  hesaplar.set(token, kayit);

  // -------------------------------------------------------------
  // READY
  // -------------------------------------------------------------
  client.on('ready', async () => {
    kayit.user = client.user.tag;
    kayit.durum = 'çalışıyor';
    console.log(`[SELF] ${client.user.tag} giriş yaptı`);

    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal) {
      kayit.durum = 'kanal yok';
      console.log(`[SELF] ${client.user.tag} kanal bulunamadı: ${kanalId}`);
      return;
    }
    console.log(`[SELF] ${client.user.tag} → #${kanal.name}`);
    kasDongusu(client, kanal, kayit);
  });

  // -------------------------------------------------------------
  // OWO MESAJLARINI DİNLE
  // -------------------------------------------------------------
  client.on('messageCreate', (message) => {
    if (message.author.id !== OWO_BOT_ID) return;
    const icerik = message.content;
    const kucuk = icerik.toLowerCase();
    const now = Date.now();

    // Log (kısaltılmış)
    console.log(`[OWO / ${kayit.user}] ${icerik.slice(0, 140).replace(/\n/g, ' ')}`);

    // --- CAPTCHA ---
    if (kucuk.includes('captcha') || kucuk.includes('human check') || kucuk.includes('are you a human')) {
      kayit.durdu = true;
      kayit.durum = 'captcha!';
      console.log(`[⚠️ CAPTCHA / ${kayit.user}] Manuel çöz!`);
      return;
    }

    // --- BAN ---
    if (kucuk.includes('you have been banned') || kucuk.includes('banned from owo')) {
      kayit.durdu = true;
      kayit.durum = 'banlı';
      console.log(`[🚫 BAN / ${kayit.user}]`);
      return;
    }

    // --- MUTE ---
    if (kucuk.includes('muted') && !kucuk.includes('unmuted')) {
      const m = kucuk.match(/muted for (\d+)\s*(minute|second|hour|min|sec)/);
      if (m) {
        const adet = parseInt(m[1], 10);
        const brm = m[2];
        let sn;
        if (brm.includes('hour')) sn = adet * 3600;
        else if (brm.includes('min')) sn = adet * 60;
        else sn = adet;
        kayit.muteUntil = now + sn * 1000;
        console.log(`[OWO / ${kayit.user}] MUTE: ${sn}s`);
      } else {
        kayit.muteUntil = now + 300 * 1000;
        console.log(`[OWO / ${kayit.user}] MUTE (süresiz): 300s`);
      }
    }

    // --- GEÇİCİ KISITLAMA ---
    if (kucuk.includes("you can't use") || kucuk.includes('slow down')) {
      kayit.muteUntil = now + 5000;
    }

    // -----------------------------------------------------------
    // BAKİYE PARSE
    // -----------------------------------------------------------
    // "You currently have **1,234** coins in your wallet"
    const cashM = icerik.match(/you currently have \*{0,2}([\d,]+)\*{0,2} coins/i);
    if (cashM) {
      const yeni = parseInt(cashM[1].replace(/,/g, ''), 10);
      const fark = yeni - kayit.bakiye;
      kayit.bakiye = yeni;
      console.log(`[💰 ${kayit.user}] Bakiye: ${yeni.toLocaleString()} (değişim: ${fark >= 0 ? '+' : ''}${fark})`);
    }

    // "You won **X** coins"
    const wonM = icerik.match(/you won \*{0,2}([\d,]+)\*{0,2} coins/i);
    if (wonM) {
      const kaz = parseInt(wonM[1].replace(/,/g, ''), 10);
      kayit.bakiye += kaz;
      kayit.kazanc += kaz;
      kayit.cfSeri = 0; // kazanınca seri sıfırlanır
      console.log(`[🟢 ${kayit.user}] CF KAZANÇ: +${kaz} → bakiye ~${kayit.bakiye}`);
    }

    // "You lost **X** coins"
    const lostM = icerik.match(/you lost \*{0,2}([\d,]+)\*{0,2} coins/i);
    if (lostM) {
      const kay = parseInt(lostM[1].replace(/,/g, ''), 10);
      kayit.bakiye -= kay;
      kayit.kayip += kay;
      kayit.cfSeri += 1;
      console.log(`[🔴 ${kayit.user}] CF KAYIP: -${kay} → bakiye ~${kayit.bakiye} (seri: ${kayit.cfSeri})`);

      // 3 üst üste kayıp = 30 dk cf molası
      if (kayit.cfSeri >= 3) {
        kayit.cfMola = now + 30 * 60 * 1000;
        kayit.cfSeri = 0;
        console.log(`[⏸️ ${kayit.user}] 3 üst üste kayıp → 30 dk CF molası`);
      }
    }

    // "You sold X animals for Y coins"
    const sellM = icerik.match(/sold \*{0,2}(\d+)\*{0,2} animals? for \*{0,2}([\d,]+)\*{0,2} coins/i);
    if (sellM) {
      const satisTutari = parseInt(sellM[2].replace(/,/g, ''), 10);
      kayit.bakiye += satisTutari;
      console.log(`[💵 ${kayit.user}] ${sellM[1]} hayvan satıldı → +${satisTutari} coin`);
    }

    // "You got X coins" (cookie/vote)
    const gotM = icerik.match(/you got \*{0,2}([\d,]+)\*{0,2} coins/i);
    if (gotM) {
      const g = parseInt(gotM[1].replace(/,/g, ''), 10);
      kayit.bakiye += g;
      console.log(`[🎁 ${kayit.user}] Ödül: +${g}`);
    }
  });

  client.on('error', (e) => console.log(`[SELF/${kayit.user}] hata: ${e.message}`));

  await client.login(token);
  return kayit;
}

// -------------------------------------------------------------------
// KASMA DÖNGÜSÜ (akıllı öncelik sırası)
// -------------------------------------------------------------------
async function kasDongusu(client, kanal, kayit) {
  while (client.isReady()) {
    if (kayit.durdu) {
      await sleep(30 * 1000);
      continue;
    }

    const now = Date.now();

    // Mute bekle
    if (now < kayit.muteUntil) {
      await sleep(kayit.muteUntil - now);
      continue;
    }

    // -------------------------------------------------------------
    // 1) Özel komut sırası geldi mi? (daily, cookie, sell, cash, ...)
    // -------------------------------------------------------------
    let gonderilecek = null;
    for (const k of kayit.ozel) {
      if (now - k.son >= k.interval) {
        gonderilecek = k.cmd;
        k.son = now;
        break;
      }
    }

    // -------------------------------------------------------------
    // 2) CF sırası geldi mi?
    // -------------------------------------------------------------
    if (!gonderilecek && CF_AKTIF && now - kayit.cfSon >= CF_INTERVAL) {
      // mola kontrolü
      if (now < kayit.cfMola) {
        // molada, cf atla
      } else if (kayit.bakiye >= CF_MIN_BAKIYE) {
        // bahsi hesapla: bakiyenin %X'i, min/max arası
        let bahis = Math.floor(kayit.bakiye * CF_BAHIS_ORANI);
        if (bahis < CF_MIN_BAHIS) bahis = CF_MIN_BAHIS;
        if (bahis > CF_MAX_BAHIS) bahis = CF_MAX_BAHIS;

        const yon = Math.random() < 0.5 ? 'heads' : 'tails';
        gonderilecek = `owo cf ${bahis} ${yon}`;
        kayit.cfSon = now;
      }
    }

    // -------------------------------------------------------------
    // 3) Hiçbiri yoksa ana komut
    // -------------------------------------------------------------
    if (!gonderilecek) {
      gonderilecek = ANA_KOMUTLAR[Math.floor(Math.random() * ANA_KOMUTLAR.length)];
    }

    try {
      await kanal.send(gonderilecek);
      console.log(`[${kayit.user}] → ${gonderilecek} (cd=${kayit.cooldown}s, bakiye=${kayit.bakiye})`);
    } catch (e) {
      console.log(`[${kayit.user}] gönderim hatası: ${e.message}`);
      await sleep(5000);
      continue;
    }

    // Cooldown artır (max sınırına kadar)
    if (kayit.cooldown < MAX_COOLDOWN) {
      kayit.cooldown += ARTIS;
      if (kayit.cooldown > MAX_COOLDOWN) kayit.cooldown = MAX_COOLDOWN;
    }

    await sleep(kayit.cooldown * 1000);
  }
}

// -------------------------------------------------------------------
// API
// -------------------------------------------------------------------
function auth(req, res, next) {
  const key = req.headers['x-panel-key'] || req.body?.panelKey;
  if (key !== PANEL_KEY) return res.status(401).json({ error: 'Yetkisiz' });
  next();
}

app.post('/api/add', auth, async (req, res) => {
  const { token, kanalId } = req.body;
  if (!token || !kanalId) return res.json({ error: 'token ve kanalId zorunlu' });
  try {
    await hesapBaslat(token, kanalId);
    res.json({ ok: true });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/remove', auth, async (req, res) => {
  const { token } = req.body;
  const k = hesaplar.get(token);
  if (!k) return res.json({ error: 'Yok' });
  try { await k.client.destroy(); } catch {}
  hesaplar.delete(token);
  res.json({ ok: true });
});

app.post('/api/resume', auth, async (req, res) => {
  const { token } = req.body;
  const k = hesaplar.get(token);
  if (!k) return res.json({ error: 'Yok' });
  k.durdu = false;
  k.durum = 'çalışıyor';
  res.json({ ok: true });
});

app.get('/api/list', auth, (req, res) => {
  const liste = [];
  for (const [token, k] of hesaplar.entries()) {
    liste.push({
      tokenSon: token.slice(-8),
      tokenTam: token,
      user: k.user,
      kanalId: k.kanalId,
      durum: k.durum,
      cooldown: k.cooldown,
      bakiye: k.bakiye,
      kazanc: k.kazanc,
      kayip: k.kayip,
    });
  }
  res.json({ hesaplar: liste });
});

// -------------------------------------------------------------------
// PANEL
// -------------------------------------------------------------------
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>OwO Farm</title>
<style>
body{font-family:system-ui;background:#0f1115;color:#e8e8e8;padding:20px;margin:0}
.card{background:#171a21;border:1px solid #262b36;border-radius:10px;padding:18px;margin-bottom:16px;max-width:1000px}
input{width:100%;padding:10px;background:#0f1115;border:1px solid #2b3140;border-radius:6px;color:#eee;font-family:monospace;margin-bottom:10px;box-sizing:border-box}
button{background:#5865f2;color:#fff;border:none;padding:10px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-right:6px}
button.danger{background:#ed4245}button.warn{background:#f0a020}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px;border-bottom:1px solid #262b36}
.status{padding:2px 8px;border-radius:4px;font-size:11px}
.ok{background:#1e3a25;color:#4ade80}.err{background:#3a1e1e;color:#f87171}.warn{background:#3a331e;color:#fbbf24}
code{background:#262b36;padding:2px 6px;border-radius:4px}
.coin{color:#fbbf24;font-weight:600}
.kazanc{color:#4ade80}.kayip{color:#f87171}
</style></head><body>
<div style="max-width:1000px;margin:0 auto">
<h1>💰 OwO Farm Paneli</h1>

<div class="card">
<label>Panel Şifresi</label>
<input id="panelKey" type="password" placeholder="PANEL_KEY">
<button onclick="kaydetKey()">Kaydet</button>
</div>

<div class="card">
<h3>Hesap Ekle</h3>
<input id="token" type="password" placeholder="Kullanıcı token'ı">
<input id="kanalId" placeholder="Kanal ID">
<button onclick="ekle()">Ekle ve Başlat</button>
<div id="addMsg" style="margin-top:10px"></div>
</div>

<div class="card">
<div style="display:flex;justify-content:space-between;align-items:center">
<h3 style="margin:0">Hesaplar</h3>
<button onclick="listele()">🔄 Yenile</button>
</div>
<table style="margin-top:12px">
<thead><tr><th>Hesap</th><th>Bakiye</th><th>Kazanç</th><th>Kayıp</th><th>Durum</th><th>İşlem</th></tr></thead>
<tbody id="tb"><tr><td colspan="6">Yükleniyor...</td></tr></tbody>
</table>
</div>

</div>
<script>
const $=id=>document.getElementById(id);
const getKey=()=>localStorage.getItem('panelKey')||'';
const fmt=n=>n==null?0:n.toLocaleString('tr-TR');
function kaydetKey(){localStorage.setItem('panelKey',$('panelKey').value.trim());listele();}
async function api(url,body){const o={method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-panel-key':getKey()}};if(body)o.body=JSON.stringify(body);return await(await fetch(url,o)).json();}
async function ekle(){const token=$('token').value.trim(),kanalId=$('kanalId').value.trim();if(!token||!kanalId){$('addMsg').textContent='Token ve kanal ID gerekli';return;}$('addMsg').textContent='Başlatılıyor...';const r=await api('/api/add',{token,kanalId});$('addMsg').textContent=r.ok?'✅ Eklendi':('❌ '+r.error);if(r.ok){$('token').value='';listele();}}
async function kaldir(t){if(!confirm('Durdur?'))return;await api('/api/remove',{token:t});listele();}
async function devam(t){await api('/api/resume',{token:t});listele();}
async function listele(){const r=await api('/api/list');const tb=$('tb');if(!r.hesaplar||!r.hesaplar.length){tb.innerHTML='<tr><td colspan=6 style="color:#666">Aktif hesap yok</td></tr>';return;}tb.innerHTML='';for(const h of r.hesaplar){const cls=h.durum==='çalışıyor'?'ok':(h.durum==='bağlanıyor'?'warn':'err');const tr=document.createElement('tr');tr.innerHTML='<td>'+(h.user||'...')+'</td><td class="coin">'+fmt(h.bakiye)+'</td><td class="kazanc">+'+fmt(h.kazanc)+'</td><td class="kayip">-'+fmt(h.kayip)+'</td><td><span class="status '+cls+'">'+h.durum+'</span></td><td><button class="warn" onclick="devam(\\''+h.tokenTam+'\\')">Devam</button> <button class="danger" onclick="kaldir(\\''+h.tokenTam+'\\')">Durdur</button></td>';tb.appendChild(tr);}}
$('panelKey').value=getKey();listele();setInterval(listele,5000);
</script>
</body></html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PANEL] http://0.0.0.0:${PORT}`);
});

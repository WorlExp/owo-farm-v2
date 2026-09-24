import os
import re
import random
import asyncio
import discord

# -------------------------------------------------------------------
# ORTAM DEĞİŞKENLERİ (Railway Variables'tan gelir)
# -------------------------------------------------------------------
TOKEN = os.getenv("SELF_TOKEN")              # ZORUNLU
KANAL_ID = int(os.getenv("KANAL_ID", "0"))   # ZORUNLU
OWO_BOT_ID = int(os.getenv("OWO_BOT_ID", "408785106942164992"))
BASLANGIC = int(os.getenv("BASLANGIC_COOLDOWN", "15"))
ARTIS = int(os.getenv("COOLDOWN_ARTIS", "1"))
KOMUTLAR = os.getenv("KOMUTLAR", "owo hunt,owo battle,owo pray").split(",")

client = discord.Client()


# -------------------------------------------------------------------
# HAZIR OLUNCA
# -------------------------------------------------------------------
@client.event
async def on_ready():
    print(f"[SELF] Giriş yapıldı: {client.user}")
    kanal = client.get_channel(KANAL_ID)
    if kanal is None:
        print(f"[SELF] Kanal bulunamadı: {KANAL_ID}, çıkılıyor.")
        await client.close()
        return
    print(f"[SELF] Kanal: #{kanal.name}")
    client.loop.create_task(owo_kas(client, kanal))


# -------------------------------------------------------------------
# OWO MESAJLARINI DİNLE (mute / cooldown tespiti)
# -------------------------------------------------------------------
@client.event
async def on_message(message):
    if message.author.id != OWO_BOT_ID:
        return

    icerik = message.content.lower()
    now = asyncio.get_event_loop().time()

    # Cooldown mesajı (bilgi amaçlı log)
    cd_match = re.search(r"in (\d+)\s*seconds", icerik)
    if cd_match:
        print(f"[OWO] cooldown mesajı: {cd_match.group(1)}s")

    # Mute tespiti
    if "muted" in icerik:
        m = re.search(r"muted for (\d+)\s*(minute|second|hour|min|sec)", icerik)
        if m:
            adet = int(m.group(1))
            brm = m.group(2)
            if "hour" in brm:
                sn = adet * 3600
            elif "min" in brm:
                sn = adet * 60
            else:
                sn = adet
            client.mute_until = now + sn
            print(f"[OWO] MUTE algılandı: {sn}s bekleyecek")
        else:
            client.mute_until = now + 300
            print("[OWO] MUTE algılandı (süresiz): 300s")

    # Geçici kısıtlama
    if "you can't use" in icerik or "slow down" in icerik:
        client.mute_until = now + 5
        print("[OWO] Geçici kısıtlama: 5s")


# -------------------------------------------------------------------
# ANA DÖNGÜ
# -------------------------------------------------------------------
async def owo_kas(client, kanal):
    await client.wait_until_ready()
    client.cooldown = BASLANGIC
    client.mute_until = 0

    print(f"[SELF] Kasma başladı. cd={client.cooldown}s, komutlar={KOMUTLAR}")

    while not client.is_closed():
        now = asyncio.get_event_loop().time()

        # Mute beklemesi
        if now < client.mute_until:
            bekle = client.mute_until - now
            print(f"[SELF] Mute: {bekle:.1f}s bekleniyor...")
            await asyncio.sleep(bekle)
            continue

        # Kendi cooldown'umuz
        print(f"[SELF] {client.cooldown}s bekleniyor...")
        await asyncio.sleep(client.cooldown)

        # Bekleme sırasında mute gelmişse tekrar kontrol
        if asyncio.get_event_loop().time() < client.mute_until:
            continue

        komut = random.choice(KOMUTLAR).strip()
        try:
            await kanal.send(komut)
            print(f"[SELF] gönderildi: {komut} (cd={client.cooldown}s)")
        except Exception as e:
            print(f"[SELF] gönderme hatası: {e}")
            await asyncio.sleep(5)
            continue

        # Cooldown'u artır: 15 → 16 → 17 ...
        client.cooldown += ARTIS

        # OwO cevabı gelsin diye kısa bekleme
        await asyncio.sleep(2)


# -------------------------------------------------------------------
# ÇALIŞTIR
# -------------------------------------------------------------------
if __name__ == "__main__":
    if not TOKEN:
        print("❌ SELF_TOKEN ortam değişkeni yok!")
        raise SystemExit(1)
    if KANAL_ID == 0:
        print("❌ KANAL_ID ortam değişkeni yok!")
        raise SystemExit(1)

    try:
        client.run(TOKEN)
    except discord.LoginFailure:
        print("❌ Token geçersiz!")
        raise SystemExit(1)
    except Exception as e:
        print(f"❌ Çöktü: {e}")
        raise SystemExit(1)

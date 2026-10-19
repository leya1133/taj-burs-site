// ---------- Bulut eşitleme (GitHub'daki gizli veri deposu) ----------
// data.json: fotoğraflar hariç tüm kayıtlar. fotolar/<id>-<surum>.txt: her fotoğraf ayrı dosya.
// Birleştirme kayıt bazında: aynı kayıt iki yerde değiştiyse son değiştirilen kazanır,
// silinen kayıtlar "silinenler" listesiyle diğer cihazlara da silinir.

const VERI_REPO = 'leya1133/taj-burs-veri';
const SITE_URL = 'https://leya1133.github.io/taj-burs-site/';
const DEPOLAR = { burslar: 'id', gorevler: 'id', ulkeler: 'ad', cumleler: 'id' };

let senkronCalisiyor = false;
let senkronTekrar = false;
let senkronZamanlayici;
let sonSenkron = null;

function tokenAl() { try { return localStorage.getItem('ghToken'); } catch { return null; } }
function tokenYaz(t) { try { t ? localStorage.setItem('ghToken', t) : localStorage.removeItem('ghToken'); } catch {} }

function b64Yaz(s) {
  const b = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64Oku(c) {
  const bin = atob(c.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

function gh(yol, { method = 'GET', govde, ham = false, token = tokenAl() } = {}) {
  return fetch(`https://api.github.com/repos/${VERI_REPO}${yol}`, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: ham ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      ...(govde ? { 'Content-Type': 'application/json' } : {}),
    },
    body: govde ? JSON.stringify(govde) : undefined,
  });
}

async function uzakOku() {
  const r = await gh('/contents/data.json');
  if (r.status === 404) return { veri: null, sha: null, metin: null };
  if (!r.ok) throw new Error(`okuma ${r.status}`);
  const j = await r.json();
  // 1 MB'tan büyük dosyalarda içerik gelmez, ham olarak ayrıca istenir
  const metin = j.content ? b64Oku(j.content) : await (await gh('/contents/data.json', { ham: true })).text();
  return { veri: JSON.parse(metin), sha: j.sha, metin };
}

function serilestir(d) {
  const cikti = { surum: 1 };
  for (const [depo, anahtar] of Object.entries(DEPOLAR)) {
    cikti[depo] = d[depo]
      .map((k) => { if (depo !== 'burslar') return k; const { foto, ...r } = k; return r; })
      .sort((a, b) => String(a[anahtar]).localeCompare(String(b[anahtar])));
  }
  cikti.silinenler = Object.fromEntries(Object.entries(d.silinenler).sort());
  return JSON.stringify(cikti, null, 1);
}

function yerelDurum() { return { burslar, gorevler, ulkeler, cumleler }; }

function birlestir(uzak) {
  const silinenler = { ...silinenleriOku() };
  for (const [k, t] of Object.entries(uzak?.silinenler || {})) if (!(silinenler[k] >= t)) silinenler[k] = t;
  const yerel = yerelDurum();
  const sonuc = { silinenler };
  for (const [depo, anahtar] of Object.entries(DEPOLAR)) {
    const harita = new Map(yerel[depo].map((k) => [k[anahtar], k]));
    for (const u of uzak?.[depo] || []) {
      const y = harita.get(u[anahtar]);
      if (!y || (u.guncelleme || 0) > (y.guncelleme || 0)) {
        const yeni = { ...u };
        // Fotoğraf değişmediyse eldekini koru, değiştiyse sonra indirilecek
        if (depo === 'burslar') yeni.foto = y && y.fotoSurum === u.fotoSurum ? y.foto : null;
        harita.set(u[anahtar], yeni);
      }
    }
    for (const [id, k] of harita) {
      const t = silinenler[`${depo}:${id}`];
      if (t && t >= (k.guncelleme || 0)) harita.delete(id);
    }
    sonuc[depo] = [...harita.values()];
  }
  return sonuc;
}

async function fotoYukle(k) {
  const r = await gh(`/contents/fotolar/${k.id}-${k.fotoSurum}.txt`, {
    method: 'PUT', govde: { message: `Fotoğraf: ${k.ad}`, content: b64Yaz(k.foto) },
  });
  if (!r.ok && r.status !== 422) throw new Error(`foto ${r.status}`); // 422: zaten yüklü
}

async function fotoIndir(k) {
  const r = await gh(`/contents/fotolar/${k.id}-${k.fotoSurum}.txt`, { ham: true });
  if (!r.ok) return false;
  k.foto = await r.text();
  await yaz('burslar', k, { uzaktan: true });
  return true;
}

async function senkronize() {
  if (!tokenAl()) return bulutDurum('kapali');
  if (senkronCalisiyor) { senkronTekrar = true; return; }
  senkronCalisiyor = true;
  bulutDurum('calisiyor');
  try {
    for (let deneme = 0; ; deneme++) {
      const { veri, sha, metin } = await uzakOku();

      // Birleştir ve hemen uygula (arada bekleme yok, böylece yerel değişiklik kaçmaz)
      const once = yerelDurum();
      const b = birlestir(veri);
      burslar = b.burslar; gorevler = b.gorevler; ulkeler = b.ulkeler; cumleler = b.cumleler;
      silinenleriYaz(b.silinenler);
      hepsiniCiz();

      // IndexedDB'yi güncelle
      for (const [depo, anahtar] of Object.entries(DEPOLAR)) {
        const eski = new Map(once[depo].map((k) => [k[anahtar], k]));
        const yeni = new Set(b[depo].map((k) => k[anahtar]));
        for (const k of b[depo]) if (eski.get(k[anahtar]) !== k) await yaz(depo, k, { uzaktan: true });
        for (const id of eski.keys()) if (!yeni.has(id)) await sil(depo, id, { uzaktan: true });
      }

      // Fotoğraflar: önce yükle (diğer cihazlar data.json'u görünce bulabilsin), sonra eksikleri indir
      const uzakBurs = new Map((veri?.burslar || []).map((k) => [k.id, k]));
      for (const k of b.burslar) {
        const u = uzakBurs.get(k.id);
        if (k.fotoVar && k.foto && !(u && u.fotoVar && u.fotoSurum === k.fotoSurum)) await fotoYukle(k);
      }
      let indirildi = false;
      for (const k of b.burslar) if (k.fotoVar && !k.foto) indirildi = (await fotoIndir(k)) || indirildi;
      if (indirildi) hepsiniCiz();

      const yeniMetin = serilestir(b);
      if (yeniMetin === metin) break;
      const r = await gh('/contents/data.json', {
        method: 'PUT',
        govde: { message: 'Veriler güncellendi', content: b64Yaz(yeniMetin), ...(sha ? { sha } : {}) },
      });
      if (r.ok) break;
      // 409/422: başka cihaz arada yazdı → tekrar oku, birleştir
      if ((r.status === 409 || r.status === 422) && deneme < 3) continue;
      throw new Error(`yazma ${r.status}`);
    }
    sonSenkron = Date.now();
    bulutDurum('tamam');
  } catch (e) {
    console.warn('Eşitleme hatası:', e);
    bulutDurum(navigator.onLine === false ? 'cevrimdisi' : 'hata');
  } finally {
    senkronCalisiyor = false;
    if (senkronTekrar) { senkronTekrar = false; senkronize(); }
  }
}

// app.js her kayıt/silmede çağırır
function senkronPlanla() {
  if (!tokenAl()) return;
  bulutDurum('calisiyor');
  clearTimeout(senkronZamanlayici);
  senkronZamanlayici = setTimeout(senkronize, 1200);
}

// ---------- Arayüz ----------
const BULUT_YAZI = {
  kapali: '☁️ Buluta bağla',
  calisiyor: '🔄 Kaydediliyor…',
  tamam: '✅ Kaydedildi',
  hata: '⚠️ Kaydedilemedi',
  cevrimdisi: '📴 İnternet yok',
};
let bulutSonDurum = 'kapali';

function bulutDurum(d) {
  bulutSonDurum = d;
  const btn = $('#bulutBtn');
  btn.textContent = BULUT_YAZI[d];
  btn.dataset.durum = d;
  if ($('#bulutDialog').open) bulutDialogCiz();
}

function bulutDialogCiz() {
  const bagli = !!tokenAl();
  $('#bulutBagli').hidden = !bagli;
  $('#bulutForm').hidden = bagli;
  if (bagli) {
    const yazi = {
      tamam: sonSenkron ? `Son kayıt: ${new Date(sonSenkron).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : '',
      calisiyor: 'Şu an kaydediliyor…',
      hata: 'Son denemede kaydedilemedi. Biraz sonra tekrar denenecek.',
      cevrimdisi: 'İnternet yok — bağlantı gelince otomatik kaydedilecek.',
    };
    $('#bulutSon').textContent = yazi[bulutSonDurum] || '';
  }
}

$('#bulutBtn').addEventListener('click', () => {
  $('#bulutHata').textContent = '';
  bulutDialogCiz();
  $('#bulutDialog').showModal();
});
$('#bulutKapat').addEventListener('click', () => $('#bulutDialog').close());
$('#simdiEsitle').addEventListener('click', () => senkronize());

$('#bulutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = $('#tokenGir').value.trim();
  if (!t) return;
  $('#bulutHata').textContent = 'Kontrol ediliyor…';
  try {
    const r = await gh('', { token: t });
    const j = r.ok ? await r.json() : null;
    if (!j?.permissions?.push) throw new Error();
  } catch {
    $('#bulutHata').textContent = 'Bu anahtar veri deposuna yazamıyor. Anahtarı ve izinleri kontrol et.';
    return;
  }
  tokenYaz(t);
  $('#tokenGir').value = '';
  bulutDialogCiz();
  senkronize();
});

$('#linkKopyala').addEventListener('click', async () => {
  const link = `${SITE_URL}#baglan=${encodeURIComponent(tokenAl())}`;
  try {
    await navigator.clipboard.writeText(link);
    $('#linkKopyala').textContent = '✓ Kopyalandı — telefonuna gönder';
  } catch {
    prompt('Bu linki kopyala:', link);
  }
  setTimeout(() => ($('#linkKopyala').textContent = '🔗 Bağlantı linkini kopyala'), 3000);
});

$('#bagKes').addEventListener('click', () => {
  if (!confirm('Bu cihazın bulut bağlantısı kesilsin mi? Bu cihazdaki veriler silinmez.')) return;
  tokenYaz(null);
  bulutDurum('kapali');
});

function senkronBaslat() {
  // Telefona gönderilen bağlantı linkiyle açıldıysa anahtarı kaydet ve linkten sil
  if (location.hash.startsWith('#baglan=')) {
    tokenYaz(decodeURIComponent(location.hash.slice('#baglan='.length)));
    history.replaceState(null, '', location.pathname + location.search);
    bildir('Bu cihaz buluta bağlandı ☁️');
  }
  bulutDurum(tokenAl() ? 'calisiyor' : 'kapali');
  senkronize();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') senkronize(); });
  window.addEventListener('online', senkronize);
  setInterval(() => { if (document.visibilityState === 'visible') senkronize(); }, 30000);
}

if (uygulamaHazir) senkronBaslat();

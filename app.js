// ---------- Depolama (IndexedDB: fotoğraflar localStorage'a sığmaz) ----------
const DB_AD = 'burs-takip';
let db;

function dbAc() {
  return new Promise((res, rej) => {
    const istek = indexedDB.open(DB_AD, 3);
    istek.onupgradeneeded = () => {
      const d = istek.result;
      if (!d.objectStoreNames.contains('burslar')) d.createObjectStore('burslar', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('gorevler')) d.createObjectStore('gorevler', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('ulkeler')) d.createObjectStore('ulkeler', { keyPath: 'ad' });
      if (!d.objectStoreNames.contains('cumleler')) d.createObjectStore('cumleler', { keyPath: 'id' });
    };
    istek.onsuccess = () => res(istek.result);
    istek.onerror = () => rej(istek.error);
  });
}

function hepsi(depo) {
  return new Promise((res, rej) => {
    const r = db.transaction(depo).objectStore(depo).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function yaz(depo, kayit) {
  return new Promise((res, rej) => {
    const t = db.transaction(depo, 'readwrite');
    t.objectStore(depo).put(kayit);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

function sil(depo, id) {
  return new Promise((res, rej) => {
    const t = db.transaction(depo, 'readwrite');
    t.objectStore(depo).delete(id);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

function temizle(depo) {
  return new Promise((res, rej) => {
    const t = db.transaction(depo, 'readwrite');
    t.objectStore(depo).clear();
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

// ---------- Yardımcılar ----------
const $ = (s) => document.querySelector(s);
const yeniId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tarihOku = (s) => { const [y, m, g] = s.split('-').map(Number); return new Date(y, m - 1, g); };
const gunEkle = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const haftaBasi = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return gunEkle(x, -((x.getDay() + 6) % 7)); };
const trTarih = (d, ops = { day: 'numeric', month: 'long' }) => d.toLocaleDateString('tr-TR', ops);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function guvenliLink(u) {
  try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; } catch { return ''; }
}

const DURUMLAR = ['Başvurulacak', 'Hazırlanıyor', 'Başvuruldu', 'Sonuç bekleniyor', 'Kabul 🎉', 'Ret'];

// Ülke adı → bayrak kodu (Windows bayrak emojisi göstermediği için bayrak resmi kullanılıyor)
const ULKE_KOD = {
  'Almanya': 'de', 'ABD': 'us', 'Amerika': 'us', 'İngiltere': 'gb', 'Birleşik Krallık': 'gb', 'Kanada': 'ca',
  'Hollanda': 'nl', 'Fransa': 'fr', 'İtalya': 'it', 'İspanya': 'es', 'Portekiz': 'pt', 'Belçika': 'be',
  'Avusturya': 'at', 'İsviçre': 'ch', 'İsveç': 'se', 'Norveç': 'no', 'Danimarka': 'dk', 'Finlandiya': 'fi',
  'İrlanda': 'ie', 'Polonya': 'pl', 'Çekya': 'cz', 'Macaristan': 'hu', 'Romanya': 'ro', 'Yunanistan': 'gr',
  'Estonya': 'ee', 'Litvanya': 'lt', 'Letonya': 'lv', 'Slovakya': 'sk', 'Slovenya': 'si', 'Hırvatistan': 'hr',
  'Türkiye': 'tr', 'Rusya': 'ru', 'Japonya': 'jp', 'Güney Kore': 'kr', 'Çin': 'cn', 'Tayvan': 'tw',
  'Hong Kong': 'hk', 'Singapur': 'sg', 'Malezya': 'my', 'Endonezya': 'id', 'Tayland': 'th', 'Hindistan': 'in',
  'Avustralya': 'au', 'Yeni Zelanda': 'nz', 'Katar': 'qa', 'BAE': 'ae', 'Suudi Arabistan': 'sa', 'Mısır': 'eg',
  'Azerbaycan': 'az', 'Kazakistan': 'kz', 'Özbekistan': 'uz', 'Kırgızistan': 'kg', 'Tacikistan': 'tj',
  'Türkmenistan': 'tm', 'Gürcistan': 'ge', 'Brezilya': 'br', 'Meksika': 'mx', 'Arjantin': 'ar',
};
const ULKESIZ = '__ulkesiz__';

function bayrak(ad, yedek = '📁') {
  const kod = ULKE_KOD[ad];
  if (!kod) return yedek;
  // İnternet yoksa resim yüklenmez, klasör ikonu görünür
  return `<img class="bayrak" src="https://flagcdn.com/w80/${kod}.png" alt="" onerror="this.replaceWith('${yedek}')">`;
}

// Yazılan ülkeyi mevcut klasörle eşleştir ("almanya" → "Almanya")
function ulkeNormalize(ad) {
  ad = (ad || '').trim().replace(/\s+/g, ' ');
  if (!ad) return '';
  const kucuk = ad.toLocaleLowerCase('tr');
  const var_ = [...ulkeler.map((u) => u.ad), ...Object.keys(ULKE_KOD)].find((u) => u.toLocaleLowerCase('tr') === kucuk);
  return var_ || ad.charAt(0).toLocaleUpperCase('tr') + ad.slice(1);
}

// ---------- Durum ----------
let burslar = [];
let gorevler = [];
let ulkeler = [];
let cumleler = [];
let acikUlke = null; // Ülkeler sekmesinde açık klasör
let gosterilenHafta = haftaBasi(new Date());
let gosterilenGun = new Date();
let duzenlenenId = null;
let bekleyenFoto = undefined; // undefined: değişmedi, null: kaldırıldı, string: yeni foto

// ---------- Burs kartı ----------
function kalanGun(sonTarih) {
  if (!sonTarih) return null;
  const bugun = tarihOku(ymd(new Date()));
  return Math.round((tarihOku(sonTarih) - bugun) / 86400000);
}

const DURUM_SINIF = { 'Başvurulacak': 'd1', 'Hazırlanıyor': 'd2', 'Başvuruldu': 'd3', 'Sonuç bekleniyor': 'd4', 'Kabul 🎉': 'd5', 'Ret': 'd6' };
const BASVURULMUS = ['Başvuruldu', 'Sonuç bekleniyor', 'Kabul 🎉', 'Ret'];

// Fotoğrafı olmayan burs için isminden sabit renkli kapak
function kapak(ad) {
  let h = 0;
  for (const c of ad) h = (h * 31 + c.charCodeAt(0)) % 90;
  h += 250; // mor–pembe aralığı
  const harf = esc(ad.trim().charAt(0).toLocaleUpperCase('tr') || '🎓');
  return `<div class="kapak" style="background:linear-gradient(135deg,hsl(${h} 50% 45%),hsl(${h + 30} 65% 66%))">${harf}</div>`;
}

function bursKarti(b, { haftadan = false } = {}) {
  const link = guvenliLink(b.link);
  const kalan = kalanGun(b.sonTarih);
  let tarihCip = '<span></span>';
  if (kalan !== null) {
    const yazi = kalan < 0 ? 'Süresi geçti' : kalan === 0 ? 'Son gün bugün!' : `${kalan} gün kaldı`;
    const sinif = kalan < 0 ? 'gecti' : kalan <= 3 ? 'uyari' : '';
    tarihCip = `<span class="cip ${sinif}" title="Son tarih: ${trTarih(tarihOku(b.sonTarih), { day: 'numeric', month: 'long', year: 'numeric' })}">⏳ ${yazi}</span>`;
  }
  const ulkeCip = b.ulke
    ? `<button class="cip" data-ulke-ac="${esc(b.ulke)}" title="${esc(b.ulke)} klasörünü aç">${bayrak(b.ulke, '📍')} ${esc(b.ulke)}</button>`
    : '<span></span>';
  return `
    <article class="kart">
      <div class="kart-foto">
        ${b.foto ? `<img class="foto" src="${b.foto}" alt="">` : kapak(b.ad)}
        <div class="foto-ust">${ulkeCip}${tarihCip}</div>
      </div>
      <div class="kart-ic">
        <span class="durum ${DURUM_SINIF[b.durum] || 'd1'}">${esc(b.durum)}</span>
        <h3>${esc(b.ad)}</h3>
        ${b.aciklama ? `<p class="aciklama" title="Tamamını görmek için tıkla">${esc(b.aciklama)}</p>` : ''}
        <div class="kart-alt">
          ${link ? `<a class="btn kucuk ana" href="${esc(link)}" target="_blank" rel="noopener">Başvur ↗</a>` : ''}
          <span class="bosluk"></span>
          <button class="btn kucuk hayalet" data-duzenle="${b.id}">Düzenle</button>
          ${haftadan
            ? `<button class="btn kucuk hayalet" data-haftadan-cikar="${b.id}">Haftadan çıkar</button>`
            : `<button class="btn kucuk hayalet tehlike" data-sil="${b.id}">Sil</button>`}
        </div>
      </div>
    </article>`;
}

function ozetCiz() {
  const yaklasan = burslar.filter((b) => {
    const k = kalanGun(b.sonTarih);
    return k !== null && k >= 0 && k <= 7 && !BASVURULMUS.includes(b.durum);
  }).length;
  const basvurulan = burslar.filter((b) => BASVURULMUS.includes(b.durum)).length;
  const kabul = burslar.filter((b) => b.durum === 'Kabul 🎉').length;
  $('#ozet').innerHTML = `
    <div class="ozet-kutu"><b>${burslar.length}</b><span>Toplam burs</span></div>
    <div class="ozet-kutu ${yaklasan ? 'uyari' : ''}"><b>${yaklasan}</b><span>7 gün içinde son tarih</span></div>
    <div class="ozet-kutu"><b>${basvurulan}</b><span>Başvuru yapıldı</span></div>
    <div class="ozet-kutu ${kabul ? 'iyi' : ''}"><b>${kabul}</b><span>Kabul</span></div>`;
}

function yedekDurumCiz() {
  let son = null;
  try { son = Number(localStorage.getItem('sonYedek')) || null; } catch {}
  const el = $('#yedekDurum');
  if (!son) {
    el.textContent = burslar.length ? '⚠ Henüz yedek alınmadı' : 'Veriler bu bilgisayarda, bu tarayıcıda saklanır.';
    el.classList.toggle('uyari', burslar.length > 0);
    return;
  }
  const gun = Math.floor((Date.now() - son) / 86400000);
  el.textContent = gun === 0 ? '✓ Son yedek: bugün' : `${gun > 7 ? '⚠' : '✓'} Son yedek: ${gun} gün önce`;
  el.classList.toggle('uyari', gun > 7);
}

function liste(el, kayitlar, bosYazi, ops) {
  el.innerHTML = kayitlar.length ? kayitlar.map((b) => bursKarti(b, ops)).join('') : `<div class="bos">${bosYazi}</div>`;
}

const tarihSirala = (a, b) => (a.sonTarih || '9999').localeCompare(b.sonTarih || '9999');

// ---------- Burslar sekmesi ----------
function burslariCiz() {
  const q = $('#ara').value.trim().toLocaleLowerCase('tr');
  const f = $('#durumFiltre').value;
  const u = $('#ulkeFiltre').value;
  const sonuc = burslar
    .filter((b) => (!f || b.durum === f) && (!u || (u === ULKESIZ ? !b.ulke : b.ulke === u)) &&
      (!q || (b.ad + ' ' + b.aciklama + ' ' + (b.ulke || '')).toLocaleLowerCase('tr').includes(q)))
    .sort(tarihSirala);
  liste($('#bursListe'), sonuc, burslar.length ? 'Eşleşen burs yok.' : 'Henüz burs yok — “+ Burs Ekle” ile başla.');
}

// ---------- Ülkeler sekmesi ----------
const ulkeSirali = () => [...ulkeler].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

function ulkeleriCiz() {
  const el = $('#ulkeIcerik');
  const acik = acikUlke !== null;
  $('#ulkeGeri').hidden = !acik;
  $('#ulkeSil').hidden = !acik || acikUlke === ULKESIZ;
  $('#yeniUlke').hidden = acik;

  if (!acik) {
    $('#ulkeBaslik').textContent = 'Ülkeler';
    const ulkesizSayi = burslar.filter((b) => !b.ulke).length;
    const klasorler = ulkeSirali().map((u) => {
      const n = burslar.filter((b) => b.ulke === u.ad).length;
      return `<button class="klasor" data-klasor="${esc(u.ad)}">
        <span class="klasor-ikon">${bayrak(u.ad)}</span>
        <strong>${esc(u.ad)}</strong>
        <small>${n ? `${n} burs` : 'Boş klasör'}</small>
      </button>`;
    });
    if (ulkesizSayi) {
      klasorler.push(`<button class="klasor" data-klasor="${ULKESIZ}">
        <span class="klasor-ikon">📂</span><strong>Ülkesi belirtilmemiş</strong><small>${ulkesizSayi} burs</small>
      </button>`);
    }
    el.innerHTML = klasorler.length
      ? `<div class="klasorler">${klasorler.join('')}</div>`
      : '<div class="bos">Henüz ülke yok. “+ Ülke Ekle” ile klasör aç ya da bir bursa ülke yazınca klasörü kendiliğinden açılır.</div>';
    return;
  }

  const ulkesiz = acikUlke === ULKESIZ;
  $('#ulkeBaslik').innerHTML = ulkesiz ? 'Ülkesi belirtilmemiş' : `${bayrak(acikUlke, '')} ${esc(acikUlke)}`;
  const icerik = burslar.filter((b) => (ulkesiz ? !b.ulke : b.ulke === acikUlke)).sort(tarihSirala);
  el.innerHTML = '<div class="kartlar"></div>';
  liste(el.firstChild, icerik, 'Bu klasörde henüz burs yok — “+ Burs Ekle” ile ekle.');
}

function ulkeAc(ad) {
  acikUlke = ad;
  document.querySelector('.sekme[data-sekme="ulkeler"]').click();
  ulkeleriCiz();
  window.scrollTo(0, 0);
}

async function ulkeKaydet(ad) {
  if (!ad || ulkeler.some((u) => u.ad === ad)) return false;
  const u = { ad, olusturma: Date.now() };
  await yaz('ulkeler', u);
  ulkeler.push(u);
  return true;
}

function ulkeSecenekleriniGuncelle() {
  const secili = $('#ulkeFiltre').value;
  const sirali = ulkeSirali();
  $('#ulkeFiltre').innerHTML = '<option value="">Tüm ülkeler</option>' +
    sirali.map((u) => `<option value="${esc(u.ad)}">${esc(u.ad)}</option>`).join('') +
    `<option value="${ULKESIZ}">Ülkesi belirtilmemiş</option>`;
  $('#ulkeFiltre').value = [...$('#ulkeFiltre').options].some((o) => o.value === secili) ? secili : '';
  const oneriler = [...new Set([...sirali.map((u) => u.ad), ...Object.keys(ULKE_KOD)])];
  $('#ulkeOneri').innerHTML = oneriler.map((a) => `<option value="${esc(a)}">`).join('');
}

let bildirimZaman;
function bildir(yazi) {
  const el = $('#bildirim');
  el.textContent = yazi;
  el.hidden = false;
  clearTimeout(bildirimZaman);
  bildirimZaman = setTimeout(() => (el.hidden = true), 2600);
}

// ---------- Haftalık sekmesi ----------
function haftalikCiz() {
  const bas = gosterilenHafta;
  const son = gunEkle(bas, 6);
  const anahtar = ymd(bas);
  $('#haftaEtiket').textContent = `${trTarih(bas)} – ${trTarih(son, { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const haftadakiler = burslar.filter((b) => (b.haftalar || []).includes(anahtar)).sort(tarihSirala);
  liste($('#haftaListe'), haftadakiler, 'Bu haftaya henüz burs eklenmedi.', { haftadan: true });

  const basS = ymd(bas), sonS = ymd(son);
  const sonTarihli = burslar.filter((b) => b.sonTarih && b.sonTarih >= basS && b.sonTarih <= sonS).sort(tarihSirala);
  liste($('#haftaSonTarih'), sonTarihli, 'Bu hafta son tarihi dolan burs yok.');

  $('#haftayaEkleSec').innerHTML = '<option value="">Bu haftaya burs ekle…</option>' +
    burslar.filter((b) => !(b.haftalar || []).includes(anahtar))
      .map((b) => `<option value="${b.id}">${esc(b.ad)}</option>`).join('');
}

// ---------- Günlük sekmesi ----------
function gunlukCiz() {
  const gun = ymd(gosterilenGun);
  $('#gunSec').value = gun;
  const bugunMu = gun === ymd(new Date());
  const ogeler = gorevler.filter((g) => g.tarih === gun).sort((a, b) => a.tamam - b.tamam || a.olusturma - b.olusturma);
  const bitti = ogeler.filter((g) => g.tamam).length;

  $('#gorevListe').innerHTML = ogeler.length ? ogeler.map((g) => {
    const burs = burslar.find((b) => b.id === g.bursId);
    return `<li class="gorev ${g.tamam ? 'tamam' : ''}">
      <input type="checkbox" data-gorev="${g.id}" ${g.tamam ? 'checked' : ''}>
      <span class="metin">${esc(g.metin)}</span>
      ${burs ? `<span class="rozet">${esc(burs.ad)}</span>` : ''}
      <button class="sil" data-gorev-sil="${g.id}" title="Sil">×</button>
    </li>`;
  }).join('') : `<li class="bos">${bugunMu ? 'Bugün için görev yok.' : 'Bu gün için görev yok.'}</li>`;

  const yuzde = ogeler.length ? Math.round((bitti / ogeler.length) * 100) : 0;
  $('#ilerlemeCubuk').style.width = yuzde + '%';
  $('#ilerlemeYazi').textContent = ogeler.length ? `${bitti}/${ogeler.length} görev tamamlandı (%${yuzde})` : '';

  const dun = ymd(gunEkle(new Date(), -1));
  $('#tasi').hidden = !(bugunMu && gorevler.some((g) => g.tarih === dun && !g.tamam));

  $('#gorevBurs').innerHTML = '<option value="">Burs (isteğe bağlı)</option>' +
    [...burslar].sort((a, b) => a.ad.localeCompare(b.ad, 'tr')).map((b) => `<option value="${b.id}">${esc(b.ad)}</option>`).join('');

  const gununCumleleri = cumleler.filter((c) => c.tarih === gun).sort((a, b) => a.olusturma - b.olusturma);
  $('#cumleListe').innerHTML = gununCumleleri.length ? gununCumleleri.map((c) => `
    <li class="cumle">
      <span class="metin">${esc(c.metin)}</span>
      <small>${new Date(c.olusturma).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small>
      <button class="sil" data-cumle-sil="${c.id}" title="Sil">×</button>
    </li>`).join('') : `<li class="bos">${bugunMu ? 'Bugün henüz bir şey yazmadın.' : 'Bu güne cümle yazılmamış.'}</li>`;
}

// ---------- Sabah karşılama ----------
const SOZLER = [
  'Bugün attığın küçük adımlar, yarınki büyük kapıları açar.',
  'Her başvuru, hayaline bir adım daha yakın demek.',
  'Başarı, her gün tekrarlanan küçük çabaların toplamıdır.',
  'Sen yapabilirsin — bugün de elinden gelenin en iyisini yap.',
  'Bir mektup, bir belge, bir adım. Hepsi önemli.',
  'Hayallerin, bahanelerinden büyük olsun.',
  'Bugün yorulursan dinlen, ama vazgeçme.',
];

// Günün her bölümünde bir kez gösterilir
const SELAMLAR = [
  { bas: 5, son: 12, sinif: 'sabah', ikon: '☀️', baslik: 'Günaydın Tajoo!' },
  { bas: 12, son: 18, sinif: 'ogle', ikon: '🌤️', baslik: 'İyi günler Tajoo!' },
  { bas: 18, son: 24, sinif: 'aksam', ikon: '🌙', baslik: 'İyi akşamlar Tajoo!' },
  { bas: 0, son: 5, sinif: 'gece', ikon: '✨', baslik: 'Hâlâ uyanık mısın Tajoo?' },
];

function selamGoster() {
  const saat = new Date().getHours();
  const s = SELAMLAR.find((x) => saat >= x.bas && saat < x.son);
  const bugun = ymd(new Date());
  const anahtar = `${bugun}-${s.sinif}`;
  try {
    if (localStorage.getItem('sonSelam') === anahtar) return; // bu vakitte zaten gösterildi
    localStorage.setItem('sonSelam', anahtar);
  } catch {}

  $('#selam').className = `selam ${s.sinif}`;
  $('#selamIkon').textContent = s.ikon;
  $('#selamBaslik').textContent = s.baslik;

  $('#selamTarih').textContent = trTarih(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
  const kalan = gorevler.filter((g) => g.tarih === bugun && !g.tamam).length;
  const yaklasan = burslar.filter((b) => { const k = kalanGun(b.sonTarih); return k !== null && k >= 0 && k <= 3; }).length;
  const parcalar = [];
  if (kalan) parcalar.push(`bugün ${kalan} görevin var`);
  if (yaklasan) parcalar.push(`${yaklasan} bursun son tarihi 3 gün içinde`);
  const bosMesaj = { sabah: 'Harika bir gün olsun!', ogle: 'Günün nasıl gidiyor?', aksam: 'Bugün de çok çalıştın, biraz dinlen.', gece: 'Biraz uyu, yarın yine buradayız 💜' };
  $('#selamOzet').textContent = parcalar.length ? parcalar.join(', ').replace(/^./, (c) => c.toLocaleUpperCase('tr')) + '.' : bosMesaj[s.sinif];
  $('#selamSoz').textContent = `“${SOZLER[new Date().getDate() % SOZLER.length]}”`;
  $('#selam').hidden = false;
}

function selamKapat() {
  const el = $('#selam');
  el.classList.add('cikiyor');
  setTimeout(() => { el.hidden = true; el.classList.remove('cikiyor'); }, 400);
}
$('#selamKapat').addEventListener('click', selamKapat);
$('#selam').addEventListener('click', (e) => { if (e.target.id === 'selam') selamKapat(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#selam').hidden) selamKapat(); });

function hepsiniCiz() { ulkeSecenekleriniGuncelle(); ozetCiz(); yedekDurumCiz(); burslariCiz(); ulkeleriCiz(); haftalikCiz(); gunlukCiz(); }

// ---------- Fotoğraf küçültme ----------
function fotoKucult(dosya, max = 900) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const oran = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * oran);
      c.height = Math.round(img.height * oran);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(dosya);
  });
}

// ---------- Burs formu ----------
const dialog = $('#bursDialog');
const form = $('#bursForm');

function onizlemeGoster(src) {
  $('#fotoOnizleme').hidden = !src;
  $('#fotoKaldir').hidden = !src;
  $('#fotoIpucu').hidden = !!src;
  $('#fotoMesaj').textContent = '';
  if (src) $('#fotoOnizleme').src = src;
}

async function fotoAyarla(dosya) {
  try {
    bekleyenFoto = await fotoKucult(dosya);
    onizlemeGoster(bekleyenFoto);
  } catch {
    $('#fotoMesaj').textContent = 'Bu fotoğraf açılamadı, başka bir tane dene.';
  }
}

// Ctrl+V: pencere açıkken panodaki fotoğrafı al (yazı yapıştırılıyorsa karışma)
dialog.addEventListener('paste', (e) => {
  const oge = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (!oge) return;
  e.preventDefault();
  fotoAyarla(oge.getAsFile());
});

$('#fotoYapistir').addEventListener('click', async () => {
  try {
    for (const oge of await navigator.clipboard.read()) {
      const tur = oge.types.find((t) => t.startsWith('image/'));
      if (tur) return fotoAyarla(await oge.getType(tur));
    }
    $('#fotoMesaj').textContent = 'Panoda fotoğraf yok. Önce bir fotoğrafa sağ tıklayıp “Resmi kopyala” de.';
  } catch {
    $('#fotoMesaj').textContent = 'Tarayıcı panoya erişime izin vermedi — kutuya tıklayıp Ctrl+V ile yapıştır.';
  }
});

const birak = $('#fotoBirak');
birak.addEventListener('click', () => birak.focus());
birak.addEventListener('dragover', (e) => { e.preventDefault(); birak.classList.add('surukle'); });
birak.addEventListener('dragleave', () => birak.classList.remove('surukle'));
birak.addEventListener('drop', (e) => {
  e.preventDefault();
  birak.classList.remove('surukle');
  const dosya = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
  if (dosya) fotoAyarla(dosya);
  else $('#fotoMesaj').textContent = 'Bırakılan şey fotoğraf değil.';
});

function formAc(b = null, haftaya = false, ulke = '') {
  duzenlenenId = b?.id ?? null;
  bekleyenFoto = undefined;
  form.reset();
  $('#dialogBaslik').textContent = b ? 'Bursu Düzenle' : 'Burs Ekle';
  form.ad.value = b?.ad ?? '';
  form.ulke.value = b?.ulke ?? ulke;
  form.link.value = b?.link ?? '';
  form.aciklama.value = b?.aciklama ?? '';
  form.sonTarih.value = b?.sonTarih ?? '';
  form.durum.value = b?.durum ?? DURUMLAR[0];
  form.buHaftaya.checked = b ? (b.haftalar || []).includes(ymd(gosterilenHafta)) : haftaya;
  onizlemeGoster(b?.foto);
  dialog.showModal();
}

form.fotoDosya.addEventListener('change', async () => {
  const f = form.fotoDosya.files[0];
  if (f) fotoAyarla(f);
});
$('#fotoKaldir').addEventListener('click', () => { bekleyenFoto = null; form.fotoDosya.value = ''; onizlemeGoster(null); });
$('#iptal').addEventListener('click', () => dialog.close());

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const eski = burslar.find((b) => b.id === duzenlenenId);
  const hafta = ymd(gosterilenHafta);
  let haftalar = new Set(eski?.haftalar || []);
  form.buHaftaya.checked ? haftalar.add(hafta) : haftalar.delete(hafta);
  const ulke = ulkeNormalize(form.ulke.value);
  const yeniKlasor = await ulkeKaydet(ulke);
  const kayit = {
    id: eski?.id ?? yeniId(),
    olusturma: eski?.olusturma ?? Date.now(),
    ad: form.ad.value.trim(),
    ulke,
    link: form.link.value.trim(),
    aciklama: form.aciklama.value.trim(),
    sonTarih: form.sonTarih.value,
    durum: form.durum.value,
    foto: bekleyenFoto === undefined ? (eski?.foto ?? null) : bekleyenFoto,
    haftalar: [...haftalar],
  };
  await yaz('burslar', kayit);
  burslar = burslar.filter((b) => b.id !== kayit.id).concat(kayit);
  dialog.close();
  hepsiniCiz();
  if (ulke && ulke !== eski?.ulke) {
    bildir(yeniKlasor ? `“${ulke}” klasörü açıldı, burs içine eklendi 📁` : `Burs “${ulke}” klasörüne eklendi 📁`);
  }
});

// ---------- Kart butonları (tüm listeler) ----------
document.addEventListener('click', async (e) => {
  if (e.target.matches('.aciklama')) return e.target.classList.toggle('acik');
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.klasor) { acikUlke = t.dataset.klasor; ulkeleriCiz(); window.scrollTo(0, 0); }
  if (t.dataset.ulkeAc) ulkeAc(t.dataset.ulkeAc);
  if (t.dataset.duzenle) formAc(burslar.find((b) => b.id === t.dataset.duzenle));
  if (t.dataset.sil) {
    const b = burslar.find((x) => x.id === t.dataset.sil);
    if (!confirm(`"${b.ad}" silinsin mi?`)) return;
    await sil('burslar', b.id);
    burslar = burslar.filter((x) => x.id !== b.id);
    hepsiniCiz();
  }
  if (t.dataset.haftadanCikar) {
    const b = burslar.find((x) => x.id === t.dataset.haftadanCikar);
    b.haftalar = (b.haftalar || []).filter((h) => h !== ymd(gosterilenHafta));
    await yaz('burslar', b);
    hepsiniCiz();
  }
  if (t.dataset.cumleSil) {
    if (!confirm('Bu cümle silinsin mi?')) return;
    await sil('cumleler', t.dataset.cumleSil);
    cumleler = cumleler.filter((c) => c.id !== t.dataset.cumleSil);
    gunlukCiz();
  }
  if (t.dataset.gorevSil) {
    await sil('gorevler', t.dataset.gorevSil);
    gorevler = gorevler.filter((g) => g.id !== t.dataset.gorevSil);
    gunlukCiz();
  }
});

// ---------- Sekmeler ----------
document.querySelectorAll('.sekme').forEach((s) => s.addEventListener('click', () => {
  document.querySelectorAll('.sekme').forEach((x) => x.classList.toggle('aktif', x === s));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('aktif', p.id === s.dataset.sekme));
  try { localStorage.setItem('sekme', s.dataset.sekme); } catch {}
}));

// ---------- Burslar olayları ----------
$('#yeniBurs').addEventListener('click', () => formAc());
$('#ara').addEventListener('input', burslariCiz);
$('#durumFiltre').addEventListener('change', burslariCiz);
$('#ulkeFiltre').addEventListener('change', burslariCiz);

// ---------- Ülkeler olayları ----------
$('#ulkeGeri').addEventListener('click', () => { acikUlke = null; ulkeleriCiz(); });
$('#ulkeyeBurs').addEventListener('click', () => formAc(null, false, acikUlke && acikUlke !== ULKESIZ ? acikUlke : ''));
$('#yeniUlke').addEventListener('click', async () => {
  const ad = ulkeNormalize(prompt('Ülke adı:') || '');
  if (!ad) return;
  if (!(await ulkeKaydet(ad))) return bildir(`“${ad}” klasörü zaten var`);
  hepsiniCiz();
  bildir(`“${ad}” klasörü açıldı`);
});
$('#ulkeSil').addEventListener('click', async () => {
  const icindekiler = burslar.filter((b) => b.ulke === acikUlke);
  const soru = icindekiler.length
    ? `“${acikUlke}” klasörü silinsin mi? İçindeki ${icindekiler.length} burs silinmez, “Ülkesi belirtilmemiş” klasörüne geçer.`
    : `“${acikUlke}” klasörü silinsin mi?`;
  if (!confirm(soru)) return;
  for (const b of icindekiler) { b.ulke = ''; await yaz('burslar', b); }
  await sil('ulkeler', acikUlke);
  ulkeler = ulkeler.filter((u) => u.ad !== acikUlke);
  acikUlke = null;
  hepsiniCiz();
});

// ---------- Haftalık olayları ----------
$('#oncekiHafta').addEventListener('click', () => { gosterilenHafta = gunEkle(gosterilenHafta, -7); haftalikCiz(); });
$('#sonrakiHafta').addEventListener('click', () => { gosterilenHafta = gunEkle(gosterilenHafta, 7); haftalikCiz(); });
$('#buHafta').addEventListener('click', () => { gosterilenHafta = haftaBasi(new Date()); haftalikCiz(); });
$('#haftaYeniBurs').addEventListener('click', () => formAc(null, true));
$('#haftayaEkleBtn').addEventListener('click', async () => {
  const b = burslar.find((x) => x.id === $('#haftayaEkleSec').value);
  if (!b) return;
  b.haftalar = [...new Set([...(b.haftalar || []), ymd(gosterilenHafta)])];
  await yaz('burslar', b);
  hepsiniCiz();
});

// ---------- Günlük olayları ----------
$('#oncekiGun').addEventListener('click', () => { gosterilenGun = gunEkle(gosterilenGun, -1); gunlukCiz(); });
$('#sonrakiGun').addEventListener('click', () => { gosterilenGun = gunEkle(gosterilenGun, 1); gunlukCiz(); });
$('#bugun').addEventListener('click', () => { gosterilenGun = new Date(); gunlukCiz(); });
$('#gunSec').addEventListener('change', (e) => { if (e.target.value) { gosterilenGun = tarihOku(e.target.value); gunlukCiz(); } });

$('#gorevForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const metin = $('#gorevMetin').value.trim();
  if (!metin) return;
  const g = { id: yeniId(), tarih: ymd(gosterilenGun), metin, tamam: false, bursId: $('#gorevBurs').value || null, olusturma: Date.now() };
  await yaz('gorevler', g);
  gorevler.push(g);
  $('#gorevMetin').value = '';
  gunlukCiz();
});

$('#cumleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const metin = $('#cumleMetin').value.trim();
  if (!metin) return;
  const c = { id: yeniId(), tarih: ymd(gosterilenGun), metin, olusturma: Date.now() };
  await yaz('cumleler', c);
  cumleler.push(c);
  $('#cumleMetin').value = '';
  gunlukCiz();
});

$('#gorevListe').addEventListener('change', async (e) => {
  const g = gorevler.find((x) => x.id === e.target.dataset.gorev);
  if (!g) return;
  g.tamam = e.target.checked;
  await yaz('gorevler', g);
  gunlukCiz();
});

$('#tasi').addEventListener('click', async () => {
  const dun = ymd(gunEkle(new Date(), -1));
  const bugun = ymd(new Date());
  for (const g of gorevler.filter((x) => x.tarih === dun && !x.tamam)) {
    g.tarih = bugun;
    await yaz('gorevler', g);
  }
  gunlukCiz();
});

// ---------- Yedek ----------
$('#disaAktar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ surum: 3, burslar, gorevler, ulkeler, cumleler }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `burs-yedek-${ymd(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  try { localStorage.setItem('sonYedek', String(Date.now())); } catch {}
  yedekDurumCiz();
  bildir('Yedek indirildi — İndirilenler klasörüne bak');
});

$('#iceAktar').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const veri = JSON.parse(await f.text());
    if (!Array.isArray(veri.burslar) || !Array.isArray(veri.gorevler)) throw new Error();
    if (!confirm('Mevcut veriler yedektekiyle değiştirilecek. Devam edilsin mi?')) return;
    // Eski yedeklerde ülke listesi yok: burslardaki ülkelerden oluştur
    const yedekUlkeler = Array.isArray(veri.ulkeler) ? veri.ulkeler
      : [...new Set(veri.burslar.map((b) => b.ulke).filter(Boolean))].map((ad) => ({ ad, olusturma: Date.now() }));
    const yedekCumleler = Array.isArray(veri.cumleler) ? veri.cumleler : [];
    await temizle('burslar'); await temizle('gorevler'); await temizle('ulkeler'); await temizle('cumleler');
    for (const b of veri.burslar) await yaz('burslar', b);
    for (const g of veri.gorevler) await yaz('gorevler', g);
    for (const u of yedekUlkeler) await yaz('ulkeler', u);
    for (const c of yedekCumleler) await yaz('cumleler', c);
    burslar = veri.burslar; gorevler = veri.gorevler; ulkeler = yedekUlkeler; cumleler = yedekCumleler;
    acikUlke = null;
    hepsiniCiz();
  } catch {
    alert('Bu dosya geçerli bir yedek değil.');
  } finally {
    e.target.value = '';
  }
});

// ---------- Başlat ----------
(async () => {
  const durumSecenek = DURUMLAR.map((d) => `<option>${d}</option>`).join('');
  $('#durumFiltre').insertAdjacentHTML('beforeend', durumSecenek);
  form.durum.innerHTML = durumSecenek;

  try {
    const s = localStorage.getItem('sekme');
    if (s) document.querySelector(`.sekme[data-sekme="${s}"]`)?.click();
  } catch {}

  // Tarayıcıdan, yer darlığında bu verileri kendiliğinden silmemesini iste.
  // Beklenmiyor: bazı tarayıcılar izin sorar ve cevap gelene kadar site açılmazdı.
  navigator.storage?.persist?.().catch(() => {});

  db = await dbAc();
  [burslar, gorevler, ulkeler, cumleler] = await Promise.all([hepsi('burslar'), hepsi('gorevler'), hepsi('ulkeler'), hepsi('cumleler')]);
  hepsiniCiz();
  selamGoster();
})();

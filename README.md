# Kirli Dikdörtgen Tekniği — Canvas 2D

"Bütün Masayı Silmeye Gerek Yok: Canvas 2D'de Kirli Dikdörtgen Tekniği" makalesinin
çalışan kodu. Her karede `clearRect(0, 0, W, H)` yapmak yerine yalnızca değişmiş
bölgeleri temizler ve sadece o bölgelere değen nesneleri yeniden çizer.

`src/query.ts` içindeki `GridIndex`, `broad-phase-collision-spatial-hash` projesindeki
`SpatialHashGrid` ile aynı fikrin (uniform spatial hash) farklı amaçlı varyantıdır:
orada "çarpışma adayı çift üret", burada "bu dikdörtgene hangi nesneler değiyor".

## İçerik

- `src/rect.ts` — `Rect` + saf dikdörtgen matematiği: `rectIntersects` (yarı-açık
  aralık), `rectUnion`, `rectArea`, `rectIntersectionArea`, `expandRect` (anti-aliasing
  payı), `snapRect` (dışa yuvarlama), `clipRect`.
- `src/merge.ts` — `mergeWaste` + `mergeRects`: her turda en az israf eden çifti
  birleştirir, örtüşenler eşikten muaf. `mergeRectsRatio` ise ölçümde kaybeden ilk
  (oran eşikli) sürüm; sadece bench karşılaştırması için duruyor.
- `src/dirty.ts` — `DirtyTracker`: `markRect`, `markMoved` (eski + yeni konum),
  `markAll` kaçış kapısı, `regions()`, `pending()`.
- `src/query.ts` — `queryBrute` (referans doğru) + `GridIndex<T>` uzamsal indeks.
- `src/render.ts` — `drawRegion`: `save` → `clip` → `clearRect` → çiz → `restore`.
- `src/loop.ts` — `makeFrame`: güncelle+kirlet → indeksi tam doldur → bölgeleri çiz.
- `src/camera.ts`, `src/scroll.ts` — kamera kayınca tekniğin neden çöktüğü ve
  self-blit ile şerit kaydırma. Demoda kullanılmaz (yazı bu yolu önermiyor).
- `src/layers.ts` — katmanlı canvas alternatifi: `paintStatic` / `paintDynamic`.
- `src/bench.ts` + `src/bench-cli.ts` — tohumlu sahne (mulberry32) ve deterministik
  ölçüm; makaledeki tabloları üretir.
- `src/main.ts` + `index.html` — canlı demo, HUD ve kirli bölge görselleştirmesi.

## Kurulum

```bash
npm install
```

## Çalıştırma

> ⚠️ **`index.html`'i çift tıklayıp doğrudan açma.** Sayfa bir TypeScript modülü
> (`<script type="module" src="/src/main.ts">`) yükler; `file://` ile boş ekran
> görürsün. Vite dev sunucusu çalıştırmanın tek yolu.

### Canlı demo

```bash
npm run dev
```

`http://localhost:5173/` açılır. 2.000 nesnelik sahne, varsayılan 20 tanesi hareketli.
Kontroller:

- **mod** — `dirty-rect` / `full-redraw` / `layered`.
- **hareketli** — 0–400 hareketli nesne.
- **maxWaste** — birleştirmede göze alınan boş alan bütçesi (px²).
- **kirli bölgeleri çerçevele** — her kirli bölgeyi kırmızı çerçeveyle gösterir.
- **AA payı (1px)** — kirli dikdörtgeni 1px şişirir.

HUD'da mod, çizilen nesne / toplam, kirli alan yüzdesi, bölge sayısı ve son 30 karenin
ortalama kare süresi var.

Denemeye değer üç şey:

1. `dirty-rect` modunda 20 hareketli: çizilen ~260 / 2000, kirli alan ~%5.
   `full-redraw`'a geçince 2000 / 2000 ve %100.
2. **hareketli** kaydırıcısını 100'e çekin: dirty-rect tek tam-ekran bölgeye düşer,
   HUD %100 kirli gösterir. Sistem kendini kapatmıştır — makaledeki dürüstlük
   iddiasının görsel kanıtı.
3. **AA payı** kutusunu kapatın: kirli dikdörtgen tam geometrik sınıra kırpılır ve
   hareketli nesnelerin arkasında anti-aliasing artığı soluk bir iz kalır.

Not: çerçeveleme açıkken çizilen kırmızı kutular tuvale kalıcı piksel yazar; bu yüzden
bir sonraki karede `markRect` ile yeniden kirletilirler (yoksa ekranda birikirler).

### Testler

```bash
npm test
```

17 test, hepsi saf mantık — DOM ya da canvas gerekmez. En kritik ikisi: birleştirme
sonrası her girdi dikdörtgeninin bir çıktının **içinde tamamen** kalması (kirli piksel
kaçmaz) ve `GridIndex.query` sonucunun `queryBrute` ile **birebir** aynı olması.

### Ölçüm

```bash
npm run bench
```

Makaledeki üç tabloyu üretir (tohumlu, deterministik; makine hızından bağımsız —
tek makineye bağlı sütun `takip ms/kare`). Gerçek çıktı:

```
birleştirme kuralı (2000 nesne, 40 hareketli, 300 kare, 640x360)
  yok      →  34.8 bölge    %6.3 kirli   415.8 çizim
  oran 1.5 →  32.1 bölge    %8.4 kirli   446.5 çizim

maxWaste sweep (2000 nesne, 40 hareketli, 300 kare, 640x360)
  0        →  34.8 bölge    %6.3 kirli   415.8 çizim
  500      →  31.9 bölge    %6.7 kirli   414.7 çizim
  2000     →  20.9 bölge   %12.5 kirli   521.1 çizim
  8000     →  10.4 bölge   %31.1 kirli   885.5 çizim
  32000    →   1.4 bölge   %89.8 kirli  1899.5 çizim
  Infinity →   1.0 bölge   %94.1 kirli  1965.1 çizim

moving sweep (maxWaste 2000, maxRegions 24, 300 kare)
  5 (%0.25)  →   4.6 bölge    %1.0 kirli    52.7 çizim  tam çizime göre %3    takip 0.006 ms/kare
  20 (%1)    →  14.6 bölge    %5.2 kirli   260.2 çizim  tam çizime göre %13   takip 0.254 ms/kare
  40 (%2)    →  20.9 bölge   %12.5 kirli   521.1 çizim  tam çizime göre %26   takip 1.903 ms/kare
  100 (%5)   →   1.0 bölge  %100.0 kirli  2000.0 çizim  tam çizime göre %100  takip 0.015 ms/kare
  200 (%10)  →   1.0 bölge  %100.0 kirli  2000.0 çizim  tam çizime göre %100  takip 0.029 ms/kare
  400 (%20)  →   1.0 bölge  %100.0 kirli  2000.0 çizim  tam çizime göre %100  takip 0.058 ms/kare
  2000 (%100)→   1.0 bölge  %100.0 kirli  2000.0 çizim  tam çizime göre %100  takip 0.294 ms/kare
```

Okuma kılavuzu: hareketli oran %2'ye kadar dirty-rect net kazandırır. %5'te
`maxRegions` kaçış kapısı devreye girer ve teknik kendini kapatır; %100 hareketlide
dirty-rect **kaybeder** — tam çizimin yaptığı işin aynısını yapar, üstüne kare başına
0,29 ms takip maliyeti öder.

### Tip denetimi ve derleme

```bash
npm run typecheck   # tsc --noEmit, strict
npm run build       # tsc && vite build
```

## Lisans

MIT

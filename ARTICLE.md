# Bütün Masayı Silmeye Gerek Yok: Canvas 2D'de Kirli Dikdörtgen Tekniği

*Her karede `clearRect(0, 0, W, H)` demek yerine yalnızca değişen bölgeleri temizleyip o bölgeye değen nesneleri çiziyoruz. Bir de tekniğin kaydırmalı kamerayla neden kavga ettiğini konuşuyoruz — ölçümleriyle birlikte.*

*Tahmini okuma süresi: 16 dakika*

---

Bu seride yazdığım her canvas projesinin çizim fonksiyonu aynı satırla başlıyor:

```ts
// ÖNCE — serideki her demonun ilk satırı. Bu yazının karşı örneği;
// projede tam çizim modunda hâlâ var (src/main.ts), dirty-rect yolunda yok.
ctx.clearRect(0, 0, canvas.width, canvas.height);
```

Fizik motorunda böyleydi; falling game, tile oyunu, side-scroller derken hiç değişmedi. Refleks haline gelmiş: kareyi aç, her şeyi sil, her şeyi yeniden çiz. Kimse sorgulamıyor çünkü çalışıyor.

Geçen hafta bir envanter ekranı yazarken bu satırın önünde durdum. Ekranda 300 küsur eşya kutusu vardı, ikisi hariç hepsi kıpırdamıyordu. Fareyle sürüklediğim tek bir kutu için, kalan 298 kutuyu her karede yeniden çiziyordum.

Mutfakta bir damla kahve döküyorsunuz. Sonra bütün masayı, sandalyeleri, tezgahı ve dolap kapaklarını baştan siliyorsunuz. Her damla için. Saniyede altmış kez.

Bu yazıda o refleksi bozacağız. Sadece kirlenen yeri sileceğiz.

### Her Karede Her Şeyi Silmek

Önce faturayı çıkaralım, çünkü "gereksiz iş" bir his değil, bir sayı.

Tipik bir canvas 2D karesi iki maliyetten oluşur. Birincisi **piksel maliyeti**: `clearRect` ve her `fillRect`/`drawImage`, GPU'ya kompozit edilecek piksel yazar. 640×360'lık mütevazı bir tuval bile karede 230.400 piksel demektir; retina ekranda `devicePixelRatio = 2` ile bu dört katına çıkar.

İkincisi çağrı maliyeti: her nesne için yapılan `save`, `translate`, `beginPath`, `fill`, `restore` çağrıları. Canvas 2D'de çağrı başına sabit bir masraf vardır ve nesne sayısıyla doğrusal büyür.

Şimdi şu soruyu sorun: 2.000 nesnelik bir sahnede yalnızca 5 tanesi hareket ediyorsa, o 1.995 nesneyi yeniden çizmek ne kazandırıyor?

Hiçbir şey. Aynı pikselleri aynı yere tekrar yazıyoruz. Tuvalin içeriği zaten doğruydu, biz onu sildik ki tekrar doğru hale getirelim.

Canvas 2D'nin bize verdiği garanti şu: `clearRect` çağırmadıkça tuval **persistent** _(kalıcı)_. Bir şey çizdiyseniz orada durur, siz silene kadar. Bütün seri boyunca bu garantiyi kullanmadık; her kare temiz sayfa açtık. Dirty rectangle rendering _(kirli dikdörtgen tekniği)_ tam olarak bu garantiyi paraya çevirme işidir.

### Kirli Bölge Fikri

Fikir tek cümlede özetlenebilir: *bir kare içinde piksel değeri değişmiş olabilecek her bölgeyi işaretle, sadece o bölgeleri temizle, sadece o bölgelere değen nesneleri yeniden çiz.*

Masa metaforuna dönelim. Kahve nereye döküldü? Sol üst köşeye, on santimlik bir alana. Peki siz nereyi siliyorsunuz? O on santimi ve bir parmak payı çevresini. Masanın geri kalanı zaten temiz, ona dokunmuyorsunuz.

Buradaki "bir parmak payı" ayrıntısı önemli, birazdan ona geleceğiz.

İhtiyacımız olan ilk şey bir dikdörtgen tipi ve etrafındaki saf matematik. Bu dosya baştan sona test edilebilir, DOM'a hiç dokunmuyor:

```ts
// src/rect.ts
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Kenardan değmek kesişmek sayılmaz: yarı-açık aralık [x, x+w).
export function rectIntersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

// İkisini birden kapsayan en küçük dikdörtgen.
export function rectUnion(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y };
}

export function rectArea(r: Rect): number {
  return Math.max(0, r.w) * Math.max(0, r.h);
}

export function rectIntersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
```

Şimdi o parmak payı. Canvas 2D anti-aliasing (kenar yumuşatma) yapar: bir dairenin ya da eğik bir çizginin kenarındaki pikseller yarı saydam boyanır ve bu boyama, nesnenin geometrik sınırının **bir piksel dışına taşabilir**. Sınırı birebir temizlerseniz o yarım pikseller ekranda kalır ve nesne hareket ettikçe arkasında hayalet bir iz bırakır. Bunu ilk denememde tam olarak yaşadım: hareket eden karenin peşinde soluk gri bir kuyruk vardı, kirli bölgeyi görselleştirene kadar da nereden geldiğini anlayamadım.

Çözüm bir satır. Her kirli dikdörtgeni bir piksel şişir, sonra tam sayı sınırına yuvarla:

```ts
// src/rect.ts (devam)
export function expandRect(r: Rect, pad = 1): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

// Kesirli koordinatları dışa doğru tam sayıya yuvarla:
// yarım piksel bile dışarıda kalmasın.
export function snapRect(r: Rect): Rect {
  const x = Math.floor(r.x);
  const y = Math.floor(r.y);
  return { x, y, w: Math.ceil(r.x + r.w) - x, h: Math.ceil(r.y + r.h) - y };
}

// Tuvalin dışına taşan kısmı kırp.
export function clipRect(r: Rect, bounds: Rect): Rect {
  const x = Math.max(r.x, bounds.x);
  const y = Math.max(r.y, bounds.y);
  const right = Math.min(r.x + r.w, bounds.x + bounds.w);
  const bottom = Math.min(r.y + r.h, bounds.y + bounds.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}
```

Gölge (`shadowBlur`) ya da kalın `lineWidth` kullanıyorsanız 1 piksel yetmez; payı efektin yarıçapı kadar açmanız gerekir. Kural basit: pay, çizimin geometrik sınırdan dışarı taşabildiği en büyük mesafe kadar olmalı.

### Kirli Dikdörtgenleri Toplamak

Şimdi asıl inceliğe geldik ve bunu ilk yazan herkes bir kez yanlış yapar.

Bir kutu A noktasından B noktasına hareket etti. Hangi bölge kirlendi?

İçgüdü "B" diyor, çünkü kutu şimdi orada. Ama A'da bir kutu resmi duruyor ve onu kimse silmedi. Tuval kalıcı, unutmayın. B'yi temizleyip kutuyu oraya çizerseniz ekranda **iki** kutu olur: biri gerçek, biri hayalet.

Hareket eden nesne iki yeri birden kirletir: bıraktığı yeri ve gittiği yeri. Bardağı masanın bir ucundan öbürüne taşırken alttan damlıyorsa, hem eski halkayı hem yeni halkayı silersiniz.

`DirtyTracker` bu yüzden `markMoved` ile başlıyor:

```ts
// src/dirty.ts
import { type Rect, clipRect, expandRect, rectArea, snapRect } from "./rect";
import { mergeRects } from "./merge";

export interface DirtyOptions {
  pad?: number; // anti-aliasing payı (px)
  maxWaste?: number; // birleştirmede göze alınan boş alan (px²)
  maxRegions?: number;
}

export class DirtyTracker {
  private rects: Rect[] = [];
  private fullyDirty = false;
  private readonly pad: number;
  private readonly maxWaste: number;
  private readonly maxRegions: number;

  constructor(
    private readonly bounds: Rect,
    options: DirtyOptions = {},
  ) {
    this.pad = options.pad ?? 1;
    this.maxWaste = options.maxWaste ?? 2000;
    this.maxRegions = options.maxRegions ?? 24;
  }

  markRect(r: Rect): void {
    if (this.fullyDirty) return; // zaten her şey kirli, kayıt tutmanın anlamı yok
    const clipped = clipRect(snapRect(expandRect(r, this.pad)), this.bounds);
    if (rectArea(clipped) > 0) this.rects.push(clipped);
  }

  // Hareket eden nesne İKİ yeri birden kirletir: bıraktığını ve gittiğini.
  markMoved(prev: Rect, next: Rect): void {
    this.markRect(prev);
    this.markRect(next);
  }

  markAll(): void {
    this.fullyDirty = true;
    this.rects = [{ ...this.bounds }];
  }

  regions(): Rect[] {
    if (this.fullyDirty) return [{ ...this.bounds }];
    // Birleştirme çift-çift tarar: girdi kabarınca kendi maliyeti çizimden
    // pahalıya patlar. Tavanın dört katını aştıysak hiç uğraşma.
    if (this.rects.length > this.maxRegions * 4) return [{ ...this.bounds }];
    const merged = mergeRects(this.rects, this.maxWaste);
    // Çok fazla parçaya bölündüyse tek tam çizim daha ucuzdur.
    if (merged.length > this.maxRegions) return [{ ...this.bounds }];
    return merged;
  }

  clear(): void {
    this.rects.length = 0;
    this.fullyDirty = false;
  }

  get pendingCount(): number {
    return this.rects.length;
  }

  // Birleştirilmemiş ham kirli dikdörtgenler: ölçüm ve hata ayıklama için.
  pending(): Rect[] {
    return this.rects.map((r) => ({ ...r }));
  }
}
```

Bir nesnenin sadece konumu değil, görünümü de değişebilir: rengi, seçili durumu, animasyon karesi, opaklığı. Yerinden kıpırdamayan ama rengi değişen bir buton da kirlidir. Pratikte her nesneye küçük bir `dirty` bayrağı koyup, o bayrak kalktığında `markRect(obj.bounds)` çağırmak en temiz düzen. Konum değişimlerini `markMoved`, görünüm değişimlerini `markRect` üstlenir.

`markAll()` da kaçış kapısı. Pencere yeniden boyutlandı, tema değişti, sahne yeniden yüklendi: her şey kirli, tartışmaya gerek yok.

`regions()` içindeki ilk kontrol de sonradan eklendi ve bir ölçümün sonucu. Birleştirici çift-çift tarama yapıyor; girdi listesi kabardığında maliyeti sessizce patlıyor. 2.000 nesneli sahnemde 200 tanesi hareketliyken *sadece birleştirme* kare başına 44 ms yiyordu — çizime hiç sıra gelmeden bütçe bitmişti. Ham dikdörtgen sayısı bölge tavanının dört katını aştığında hiç uğraşmayıp doğrudan tam çizime düşünce aynı senaryo 0,03 ms'ye indi. Optimizasyonun kendi maliyetini ölçmezseniz optimizasyon yaptığınızı sanırsınız.

### Birleştirmek mi, Ayrı Çizmek mi

Kirli dikdörtgen listesi elimizde. Bunları olduğu gibi çizsek olur mu?

Olur, ama iki sorun var. Birincisi, örtüşen iki bölgeyi ayrı ayrı işlersek örtüşme alanını iki kez temizleyip iki kez çizeriz. İkincisi, her bölge için ödediğimiz `save`/`clip`/`restore` üçlüsünün sabit bir bedeli var; yüz tane minik bölge, tek bir orta boy bölgeden pahalıya patlayabilir.

Yan yana iki damla için paspası iki kez daldırmazsınız, tek hamlede ikisini birden silersiniz. Ama biri mutfakta biri salondaysa, aradaki koridoru silmek için tek hamleye zorlamak saçmadır.

Ölçüt şu: iki dikdörtgeni birleştirince ortaya çıkan **waste** _(boş alan israfı)_ ne kadar? Birleşimin alanı, iki dikdörtgenin gerçekten kapladığı alandan ne kadar fazlaysa, o kadar boşuna piksel temizliyoruz demektir.

```ts
// src/merge.ts
import {
  type Rect,
  rectArea,
  rectIntersectionArea,
  rectIntersects,
  rectUnion,
} from "./rect";

// Birleştirirsek kaç piksel boşuna temizlenir?
export function mergeWaste(a: Rect, b: Rect): number {
  const covered = rectArea(a) + rectArea(b) - rectIntersectionArea(a, b);
  return rectArea(rectUnion(a, b)) - covered;
}

export function mergeRects(rects: Rect[], maxWaste = 0): Rect[] {
  const out: Rect[] = rects.map((r) => ({ ...r }));

  let changed = true;
  while (changed) {
    changed = false;
    let bi = -1;
    let bj = -1;
    let best = Infinity;

    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        // Örtüşenler koşulsuz birleşir: iki kez temizlemenin anlamı yok.
        if (rectIntersects(out[i], out[j])) {
          bi = i;
          bj = j;
          best = -1;
          break;
        }
        const waste = mergeWaste(out[i], out[j]);
        if (waste <= maxWaste && waste < best) {
          best = waste;
          bi = i;
          bj = j;
        }
      }
      if (best === -1) break;
    }

    if (bi >= 0) {
      out[bi] = rectUnion(out[bi], out[bj]);
      out.splice(bj, 1);
      changed = true;
    }
  }
  return out;
}
```

Her turda **en az israf eden** çifti seçip birleştiriyoruz, birleşecek çift kalmayana kadar. Örtüşenler eşikten muaf, çünkü onları ayrı bırakmanın hiçbir faydası yok.

Şimdi hikayenin utandığım kısmı. Bu fonksiyonun ilk halinde eşiği oran olarak yazmıştım: "birleşimin alanı, ikisinin toplam alanının 1,5 katını geçmiyorsa birleştir." Kulağa makul geliyor. Karşılaştırabilmek için o sürümü repoda bıraktım:

```ts
// src/merge.ts (bench karşılaştırması için tutulan ilk sürüm)
export function mergeRectsRatio(rects: Rect[], maxGrowth = 1.5): Rect[] {
  const out: Rect[] = rects.map((r) => ({ ...r }));

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const union = rectUnion(out[i], out[j]);
        // Kartopu: birleşen dikdörtgen büyüdükçe bu eşik de büyür.
        if (
          rectArea(union) <=
          maxGrowth * (rectArea(out[i]) + rectArea(out[j]))
        ) {
          out[i] = union;
          out.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return out;
}
```

Sorun kartopu etkisi. Oran eşiği, birleşmiş dikdörtgen büyüdükçe **daha da cömert** davranıyor: alan büyüyünce 1,5 katı da büyüyor, böylece bir sonraki yutma daha kolay oluyor. 2.000 nesneli, 40'ı hareketli sahnemde 300 kare boyunca ölçtüm:

| Birleştirme kuralı | Bölge / kare | Kirli alan | Çizilen nesne / kare |
|---|---|---|---|
| Birleştirme yok (sadece örtüşenler) | 34,8 | %6,3 | 415,8 |
| Oran eşiği 1,5 | 32,1 | %8,4 | 446,5 |

Sayılar ilk bakışta ılımlı duruyor, ama tablonun söylediği şey acımasız: bölge sayısı neredeyse hiç düşmedi (34,8 → 32,1), buna karşılık kirli alan üçte bir arttı ve kare başına 30 nesne fazladan çizildi. Yani hiçbir şey kazanmadan ödeme yaptım. Nesneler benimkinden büyük olsaydı kartopu daha da hızlı yuvarlanacaktı; oran eşiğinin doğası bu.

Mutlak israf bütçesine (piksel kare cinsinden) geçince davranış öngörülebilir hale geldi, çünkü bu eşik büyüdükçe cömertleşmiyor:

| `maxWaste` (px²) | Bölge / kare | Kirli alan | Çizilen nesne / kare |
|---|---|---|---|
| 0 | 34,8 | %6,3 | 415,8 |
| 500 | 31,9 | %6,7 | 414,7 |
| 2.000 | 20,9 | %12,5 | 521,1 |
| 8.000 | 10,4 | %31,1 | 885,5 |
| 32.000 | 1,4 | %89,8 | 1.899,5 |
| ∞ (hepsi tek kutuda) | 1,0 | %94,1 | 1.965,1 |

(640×360 tuval, 2.000 nesne, 40 hareketli, tohumlu sahne, 300 kare ortalaması. `npm run bench` ile birebir üretilir; sayılar deterministik, makine hızından bağımsız.)

Tabloyu okumanın yolu şu: `maxWaste = 500` neredeyse bedava, bölge sayısını üç azaltıyor ve kirli alanı yarım puan artırıyor. 2.000'de takas görünür hale geliyor: bölge sayısı %40 düşüyor, karşılığında kirli alan ikiye katlanıyor — ama %12,5 hâlâ tuvalin sekizde biri, mutlak rakamla 29.000 piksel. 8.000'den sonra kirli alan patlıyor ve `clip` çağrılarından tasarruf ettiğiniz her mikrosaniyeyi piksel doldurmaya geri veriyorsunuz. Sonsuzda ise teknikten tamamen vazgeçmiş oluyorsunuz.

`DirtyTracker`'ın varsayılanı bu yüzden 2.000: bölge başına ödenen `save`/`clip`/`restore` üçlüsünü %40 azaltırken kirli alanı hâlâ küçük tutan satır. Nesneleriniz benimkinden büyükse ya da daha dağınıksa başka bir satır kazanır. Tabloyu kendi sahnenizde yeniden üretin.

### Clip ile Çizimi Sınırlamak

Bölgeler hazır. Sıra çizmeye geldi ve burada bir tuzak var.

Bölgeyi `clearRect` ile temizleyip nesneleri çizmek yetmez, çünkü kirli bölgeye **kısmen** taşan bir nesne, kendi tamamını çizmek isteyecektir. O nesnenin bölge dışında kalan kısmını yeniden boyamak zararsız gibi görünür, ama boyanın altında zaten doğru pikseller vardı ve alpha blending _(alfa harmanlaması)_ yapan bir nesne aynı yeri ikinci kez boyayınca rengi koyulaşır. Kenarlarda çirkin bir kirlenme oluşur.

Paspası temizlediğiniz karenin dışına taşırmıyorsunuz. `ctx.clip()` tam olarak budur: bu çağrıdan sonra yapılan hiçbir çizim, tanımladığınız yolun dışına piksel yazamaz.

Çizeceğimiz nesnenin tipi de basit; tek şartı bir AABB taşıması:

```ts
// src/scene.ts
import type { HasBounds } from "./query";

export interface Sprite extends HasBounds {
  id: number;
  vx: number;
  vy: number;
  color: string;
}
```

```ts
// src/render.ts
import type { Rect } from "./rect";
import type { Sprite } from "./scene";
import type { GridIndex } from "./query";

export function drawRegion(
  ctx: CanvasRenderingContext2D,
  region: Rect,
  index: GridIndex<Sprite>,
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
): number {
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.x, region.y, region.w, region.h);
  ctx.clip(); // dışarı taşma yok
  ctx.clearRect(region.x, region.y, region.w, region.h); // sadece bu kare temizlenir

  const touching = index.query(region);
  for (const sprite of touching) drawSprite(ctx, sprite);

  ctx.restore(); // clip'i geri al, bir sonraki bölge kendi kırpmasını kursun
  return touching.length; // ölçüm için: bu bölgede kaç nesne çizdik
}
```

`ctx.restore()` şart. `clip` geri alınamaz, sadece `save`/`restore` çiftiyle kapsam dışına çıkarılabilir. Bunu bir kez atlarsanız ikinci bölge, birinci bölgenin kırpmasıyla kesişerek çizilir ve ekranın yarısı sessizce kaybolur.

Peki `index.query(region)` ne yapıyor? Bu, serinin bir önceki halkasıyla doğrudan bağlantılı. Broad-phase yazısında dünyayı eşit hücrelere bölüp "hangi cisimler birbirine yakın?" diye sormuştuk. Burada sorduğumuz soru farklı ama mekanizma birebir aynı: "bu dikdörtgene hangi nesneler değiyor?"

İkisi de bir spatial query _(uzamsal sorgu)_. Amaç değişti, alet değişmedi.

```ts
// src/query.ts
import { type Rect, rectIntersects } from "./rect";

export interface HasBounds {
  bounds: Rect;
}

// Referans doğru: her nesneyi tek tek kontrol et. Testlerde ölçüt olarak kullanılır.
export function queryBrute<T extends HasBounds>(items: T[], region: Rect): T[] {
  return items.filter((it) => rectIntersects(it.bounds, region));
}

export class GridIndex<T extends HasBounds> {
  private cells = new Map<string, number[]>();
  private items: T[] = [];

  constructor(public readonly cellSize: number) {}

  clear(): void {
    this.cells.clear();
    this.items.length = 0;
  }

  private cellOf(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  insert(item: T): void {
    const id = this.items.length;
    this.items.push(item);
    const b = item.bounds;
    // Nesneyi AABB'sinin dokunduğu HER hücreye yaz.
    for (let cx = this.cellOf(b.x); cx <= this.cellOf(b.x + b.w); cx++) {
      for (let cy = this.cellOf(b.y); cy <= this.cellOf(b.y + b.h); cy++) {
        const key = cx + "," + cy;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(id);
      }
    }
  }

  query(region: Rect): T[] {
    const seen = new Set<number>();
    const out: T[] = [];
    for (
      let cx = this.cellOf(region.x);
      cx <= this.cellOf(region.x + region.w);
      cx++
    ) {
      for (
        let cy = this.cellOf(region.y);
        cy <= this.cellOf(region.y + region.h);
        cy++
      ) {
        const cell = this.cells.get(cx + "," + cy);
        if (!cell) continue;
        for (const id of cell) {
          if (seen.has(id)) continue; // aynı nesne birden çok hücrede olabilir
          seen.add(id);
          const item = this.items[id];
          if (rectIntersects(item.bounds, region)) out.push(item);
        }
      }
    }
    return out;
  }
}
```

Bir uyarı: çizim sırası. `query` nesneleri hücre sırasına göre döndürür, ekleme sırasına göre değil. Nesneleriniz üst üste biniyorsa (z-order önemliyse) sonucu çizim sırasına göre sıralamanız gerekir. Aksi halde kirli bölgenin içinde katman sırası bozulur ve arka plandaki bir kutu, önündeki kutunun üstüne çıkar. Bu bugu bulmak zordur, çünkü sadece nesnelerin çakıştığı bölgelerde ve sadece o bölge kirlendiğinde görünür.

Kareyi birleştirelim:

```ts
// src/loop.ts
import type { Rect } from "./rect";
import { DirtyTracker } from "./dirty";
import { GridIndex } from "./query";
import { drawRegion } from "./render";
import type { Sprite } from "./scene";

const CANVAS: Rect = { x: 0, y: 0, w: 640, h: 360 };

export function makeFrame(
  ctx: CanvasRenderingContext2D,
  sprites: Sprite[],
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
) {
  const tracker = new DirtyTracker(CANVAS, { pad: 1, maxWaste: 2000 });
  const index = new GridIndex<Sprite>(64);

  return function frame(dt: number) {
    tracker.clear();

    // 1. Güncelle ve kirlet
    for (const sprite of sprites) {
      if (sprite.vx === 0 && sprite.vy === 0) continue;
      const prev = { ...sprite.bounds };
      sprite.bounds = {
        ...sprite.bounds,
        x: sprite.bounds.x + sprite.vx * dt,
        y: sprite.bounds.y + sprite.vy * dt,
      };
      tracker.markMoved(prev, sprite.bounds);
    }

    // 2. Uzamsal indeksi tazele (hepsi, sadece hareketliler değil:
    //    durağan nesneler de kirli bölgeye değebilir)
    index.clear();
    for (const sprite of sprites) index.insert(sprite);

    // 3. Sadece kirli bölgeleri çiz
    let drawn = 0;
    let dirtyPixels = 0;
    for (const region of tracker.regions()) {
      drawn += drawRegion(ctx, region, index, drawSprite);
      dirtyPixels += region.w * region.h;
    }

    return { drawn, dirtyPixels, total: sprites.length };
  };
}
```

İkinci adımdaki yorumu atlamayın. İndekse **bütün** nesneleri koyuyoruz, sadece hareketlileri değil. Çünkü kirli bölge, hareket eden nesnenin altında duran durağan nesneyi de içerir ve o nesne silindiği için yeniden çizilmek zorundadır. Kutuyu masadan kaldırdığınızda altındaki masa örtüsü ortaya çıkar; onu da boyamanız gerekir.

### Kameranın Her Şeyi Bozduğu An

Buraya kadar her şey güzel. Şimdi tekniği öldüren senaryoyu konuşalım; bunu atlarsam size yarım bir alet vermiş olurum.

Side-scroller yazısında kamerayı şöyle kurmuştuk:

```ts
// Side-scroller yazısından alıntı — bu projede YOK (src/ içinde translate geçmez).
ctx.save();
ctx.translate(-camera.x, -camera.y);
drawWorld(ctx);
ctx.restore();
```

Oyuncu sağa yürüyor, `camera.x` her karede birkaç piksel artıyor. Peki ekranda hangi pikseller değişti?

Hepsi.

Kamera bir piksel kaydığında, tuvaldeki her nesne ekran uzayında bir piksel yer değiştirir. Zemin karoları, bulutlar, uzaktaki tepeler; hepsi kaydı. Kirli bölge listeniz bütün ekranı kapsar. `DirtyTracker` doğru çalışır, doğru cevabı verir ve o cevap "her şey kirli"dir.

Masayı sildiniz, sonra masayı kaldırıp iki metre öteye taşıdınız. Artık her yer yeniden kirli, üstelik bu sefer suç sizde.

Kamera kayarken dirty-rect size hiçbir şey kazandırmaz. Sıfır. Üstüne bir de takip maliyetini ödersiniz: `markMoved` çağrıları, `mergeRects` döngüsü, birleştirme mantığı. Hepsi çöpe giden iş. Bu yüzden kamera hareketini açıkça yakalayıp kaçış kapısını kullanmak gerekir:

```ts
// src/camera.ts
import type { DirtyTracker } from "./dirty";

export interface Camera {
  x: number;
  y: number;
}

export class CameraWatcher {
  private lastX: number;
  private lastY: number;

  constructor(camera: Camera) {
    this.lastX = camera.x;
    this.lastY = camera.y;
  }

  // Kamera kıpırdadıysa dirty-rect'in söyleyecek bir şeyi yok: hepsi kirli.
  sync(camera: Camera, tracker: DirtyTracker): boolean {
    const moved = camera.x !== this.lastX || camera.y !== this.lastY;
    this.lastX = camera.x;
    this.lastY = camera.y;
    if (moved) tracker.markAll();
    return moved;
  }
}
```

Yatay kaydırma için bilinen bir kurtarma yöntemi var: tuvali kendi üstüne kaydırarak kopyalamak ve yalnızca yeni açılan şeridi çizmek.

```ts
// src/scroll.ts
// Tuvali dx kadar kaydır, sadece açılan şeridi kirlet.
// Kesirli dx'te anti-aliasing hatası birikir; tam sayı şart.
export function scrollCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dx: number,
): { x: number; y: number; w: number; h: number } | null {
  if (dx === 0 || Math.abs(dx) >= width) return null;
  const shift = Math.trunc(dx);
  if (shift === 0) return null;

  ctx.save();
  ctx.globalCompositeOperation = "copy"; // harmanlama yok, birebir kopya
  ctx.drawImage(ctx.canvas, -shift, 0);
  ctx.restore();

  return shift > 0
    ? { x: width - shift, y: 0, w: shift, h: height } // sağdan yeni şerit
    : { x: 0, y: 0, w: -shift, h: height }; // soldan yeni şerit
}
```

Şunu baştan söyleyeyim: teoride şık, pratikte kırılgan. Kamera hızı tam sayı olmak zorunda, yoksa her karede yarım piksellik kaymalar birikir ve sahne bulanıklaşır. Dikey kaydırma varsa iki eksende birden yapmanız gerekir. Parallax katmanları farklı hızlarda kaydığı için tek bir `dx` yetmez. Zoom girdiği anda teknik tamamen çöker. Ben bunu bir platform oyununda denedim ve iki gün sonra söktüm; kazandığım performans, ödediğim kırılganlığa değmedi.

Kural olarak şunu benimsedim: kamera sürekli hareket ediyorsa dirty-rect'i hiç kurmayın. `clearRect(0, 0, W, H)` yapın ve enerjinizi frustum culling'e _(görünmeyeni elemeye)_ harcayın. Ekran dışındaki 1.900 nesneyi çizmemek, ekrandaki 100 nesneyi akıllıca çizmekten çok daha fazla kazandırır.

### Katmanlı Canvas: Ucuz Alternatif

Kirli dikdörtgen mantığının bütün karmaşasını yazmak istemiyorsanız, çoğu sahnede işi gören daha kaba ve daha basit bir yol var: sahneyi katmanlara ayırmak.

Masa örtüsünü her seferinde silmiyorsunuz, üstüne bir servis altlığı koyup sadece onu değiştiriyorsunuz.

Üst üste bindirilmiş iki `<canvas>` elementi kullanırsınız. Alttaki statik arka planı taşır ve **bir kez** çizilir. Üstteki şeffaftır, sadece hareketlileri taşır ve her karede tamamen temizlenir. Tarayıcı ikisini kompozit ederken GPU kullanır, bu bedava sayılır.

```html
<!-- index.html — yapı projedekiyle aynı; projede konumlandırma inline
     değil <style> bloğunda (.stage / .stage canvas) duruyor -->
<div class="stage" style="position: relative; width: 640px; height: 360px">
  <canvas
    id="bg"
    width="640"
    height="360"
    style="position: absolute; inset: 0"
  ></canvas>
  <canvas
    id="fg"
    width="640"
    height="360"
    style="position: absolute; inset: 0"
  ></canvas>
</div>
```

```ts
// src/layers.ts
import type { Sprite } from "./scene";

export interface Layers {
  bg: CanvasRenderingContext2D;
  fg: CanvasRenderingContext2D;
  width: number;
  height: number;
}

export function createLayers(
  bgCanvas: HTMLCanvasElement,
  fgCanvas: HTMLCanvasElement,
): Layers {
  const bg = bgCanvas.getContext("2d");
  const fg = fgCanvas.getContext("2d");
  if (!bg || !fg) throw new Error("2d context alınamadı");
  return { bg, fg, width: bgCanvas.width, height: bgCanvas.height };
}

// Statik katman: sahne kurulunca ve resize'da BİR KEZ çizilir.
export function paintStatic(
  layers: Layers,
  statics: Sprite[],
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
): void {
  layers.bg.clearRect(0, 0, layers.width, layers.height);
  for (const sprite of statics) drawSprite(layers.bg, sprite);
}

// Hareketli katman: her kare tamamen temizlenir, ama içinde sadece
// birkaç nesne var; 2.000 değil.
export function paintDynamic(
  layers: Layers,
  movers: Sprite[],
  drawSprite: (ctx: CanvasRenderingContext2D, s: Sprite) => void,
): void {
  layers.fg.clearRect(0, 0, layers.width, layers.height);
  for (const sprite of movers) drawSprite(layers.fg, sprite);
}
```

Karşılaştırmayı eksiksiz yapalım. Katmanlı yaklaşım piksel maliyetinden kurtulmaz: üst katmanı her kare baştan sona siliyorsunuz, bu 640×360 piksellik bir `clearRect` demek. Kurtardığı şey çağrı maliyeti: 2.000 nesne yerine 40 nesne çiziyorsunuz.

Dirty-rect ise ikisinden de tasarruf eder, ama karşılığında `markMoved` disiplinini, birleştirme mantığını ve z-order dikkatini talep eder.

Seçim kuralım şöyle:

- Sahne net biçimde "durağan arka plan + az sayıda hareketli" diye ayrılıyorsa: katmanlı canvas. Yirmi satır, sıfır bug riski.
- Hareketliler arka planın içine gömülüyse, z-order karışıyorsa ya da bir HUD'da yalnızca birkaç sayı değişiyorsa: dirty-rect.
- İkisi birden de olur. Statik arka planı alt katmana alın, üst katmanda dirty-rect uygulayın. En iyi sonuç genelde buradan çıkar.

### Testler: Kirli Bölge Yalan Söylüyor mu?

Bu tekniğin tek ölümcül günahı var: kirlenmiş bir bölgeyi kirli saymamak. O zaman ekranda hayalet kalır, kullanıcı "çizim bozuldu" der ve siz iki saat sprite kodunda hata ararsınız.

İyi haber: buradaki mantığın tamamı saf. `Rect` matematiği, birleştirme, takipçi, uzamsal sorgu. Hiçbiri canvas'a ihtiyaç duymuyor, hepsi headless vitest'te doğrulanabilir.

```ts
// test/dirty.test.ts
import { describe, it, expect } from "vitest";
import {
  type Rect,
  expandRect,
  rectArea,
  rectIntersectionArea,
  rectIntersects,
  rectUnion,
} from "../src/rect";
import { mergeRects } from "../src/merge";
import { DirtyTracker } from "../src/dirty";
import { GridIndex, queryBrute, type HasBounds } from "../src/query";

describe("rect matematiği", () => {
  it("kenardan değen dikdörtgenler kesişmiş sayılmaz", () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectIntersects(a, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectIntersects(a, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it("union her iki dikdörtgeni de kapsar", () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
    const b: Rect = { x: 20, y: 5, w: 10, h: 10 };
    expect(rectUnion(a, b)).toEqual({ x: 0, y: 0, w: 30, h: 15 });
    expect(rectArea(rectUnion(a, b))).toBeGreaterThanOrEqual(
      rectArea(a) + rectArea(b),
    );
  });

  it("expandRect anti-aliasing payı olarak her yöne 1px büyütür", () => {
    expect(expandRect({ x: 10, y: 10, w: 5, h: 5 }, 1)).toEqual({
      x: 9,
      y: 9,
      w: 7,
      h: 7,
    });
  });

  it("rectIntersectionArea kesişmeyen çiftte 0 döndürür", () => {
    const a: Rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectIntersectionArea(a, { x: 20, y: 0, w: 10, h: 10 })).toBe(0);
    expect(rectIntersectionArea(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(25);
  });
});

describe("mergeRects", () => {
  it("örtüşenleri tek dikdörtgende birleştirir", () => {
    const merged = mergeRects(
      [
        { x: 0, y: 0, w: 20, h: 20 },
        { x: 10, y: 10, w: 20, h: 20 },
      ],
      0,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ x: 0, y: 0, w: 30, h: 30 });
  });

  it("birbirinden uzak dikdörtgenleri ayrı bırakır", () => {
    const merged = mergeRects(
      [
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 500, y: 500, w: 10, h: 10 },
      ],
      2000,
    );
    expect(merged).toHaveLength(2);
    expect(merged.reduce((s, r) => s + rectArea(r), 0)).toBe(200);
  });

  it("birleşmiş bölgeler girdilerin tamamını kapsar", () => {
    const input: Rect[] = [
      { x: 0, y: 0, w: 12, h: 12 },
      { x: 8, y: 4, w: 12, h: 12 },
      { x: 300, y: 200, w: 30, h: 30 },
    ];
    const merged = mergeRects(input, 0);
    for (const r of input) {
      // Her girdi, bir çıktının İÇİNDE tamamen yer almalı: kirli piksel kaçmaz.
      expect(
        merged.some((m) => rectIntersectionArea(m, r) === rectArea(r)),
      ).toBe(true);
    }
  });

  it("israf bütçesi 0 olunca sadece örtüşenler birleşir", () => {
    const near: Rect[] = [
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 12, y: 0, w: 10, h: 10 }, // 2px boşluk → 20px² israf
    ];
    expect(mergeRects(near, 0)).toHaveLength(2);
    expect(mergeRects(near, 20)).toHaveLength(1);
  });
});

describe("DirtyTracker", () => {
  const bounds: Rect = { x: 0, y: 0, w: 640, h: 360 };

  it("markMoved eski ve yeni konumu birlikte kirletir", () => {
    const t = new DirtyTracker(bounds, { pad: 1, maxWaste: 0 });
    t.markMoved(
      { x: 10, y: 10, w: 20, h: 20 },
      { x: 300, y: 200, w: 20, h: 20 },
    );
    const regions = t.regions();
    expect(regions).toHaveLength(2);
    expect(
      regions.some((r) => rectIntersects(r, { x: 10, y: 10, w: 20, h: 20 })),
    ).toBe(true);
    expect(
      regions.some((r) => rectIntersects(r, { x: 300, y: 200, w: 20, h: 20 })),
    ).toBe(true);
  });

  it("küçük adımda eski ve yeni konum tek bölgede birleşir", () => {
    const t = new DirtyTracker(bounds, { pad: 1, maxWaste: 0 });
    t.markMoved(
      { x: 100, y: 100, w: 20, h: 20 },
      { x: 103, y: 100, w: 20, h: 20 },
    );
    expect(t.regions()).toHaveLength(1);
  });

  it("bölgeler canvas sınırlarının dışına taşmaz", () => {
    const t = new DirtyTracker(bounds, { maxWaste: 0 });
    t.markRect({ x: -50, y: -50, w: 100, h: 100 });
    const [r] = t.regions();
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.x + r.w).toBeLessThanOrEqual(640);
  });

  it("bölge sayısı tavanı aşılınca tam yeniden çizime düşer", () => {
    const t = new DirtyTracker(bounds, { pad: 0, maxWaste: 0, maxRegions: 3 });
    for (let i = 0; i < 8; i++)
      t.markRect({ x: i * 70, y: i * 40, w: 10, h: 10 });
    expect(t.regions()).toEqual([bounds]);
  });

  it("markAll her şeyi kirletir ve sonraki markRect'ler yutulur", () => {
    const t = new DirtyTracker(bounds, { maxWaste: 0 });
    t.markAll();
    t.markRect({ x: 5, y: 5, w: 5, h: 5 });
    expect(t.regions()).toEqual([bounds]);
    expect(t.pendingCount).toBe(1);
  });

  it("clear sonrası kirli bölge kalmaz", () => {
    const t = new DirtyTracker(bounds);
    t.markRect({ x: 5, y: 5, w: 5, h: 5 });
    t.clear();
    expect(t.regions()).toHaveLength(0);
  });
});

interface TestSprite extends HasBounds {
  id: number;
}

function scene(n: number, seed: number): TestSprite[] {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return Array.from({ length: n }, (_, id) => ({
    id,
    bounds: {
      x: rand() * 620,
      y: rand() * 340,
      w: 4 + rand() * 40,
      h: 4 + rand() * 40,
    },
  }));
}

describe("kirli bölgeye değen nesne sorgusu", () => {
  it("grid sorgusu brute-force ile birebir aynı kümeyi verir", () => {
    const items = scene(400, 9);
    const grid = new GridIndex<TestSprite>(64);
    for (const it of items) grid.insert(it);

    const regions: Rect[] = [
      { x: 0, y: 0, w: 50, h: 50 }, // köşe
      { x: 200, y: 120, w: 90, h: 40 }, // orta
      { x: 610, y: 330, w: 30, h: 30 }, // kenardan taşan
      { x: 0, y: 0, w: 640, h: 360 }, // tam ekran
    ];
    for (const region of regions) {
      const fromGrid = grid
        .query(region)
        .map((s) => s.id)
        .sort((a, b) => a - b);
      const brute = queryBrute(items, region)
        .map((s) => s.id)
        .sort((a, b) => a - b);
      expect(fromGrid).toEqual(brute);
    }
  });

  it("negatif koordinatlı bölgede de brute-force ile aynı sonucu verir", () => {
    const items = scene(300, 17);
    const grid = new GridIndex<TestSprite>(48);
    for (const it of items) grid.insert(it);
    const region: Rect = { x: -80, y: -40, w: 200, h: 150 };
    const fromGrid = grid
      .query(region)
      .map((s) => s.id)
      .sort((a, b) => a - b);
    const brute = queryBrute(items, region)
      .map((s) => s.id)
      .sort((a, b) => a - b);
    expect(fromGrid).toEqual(brute);
  });

  it("aynı nesneyi iki kez döndürmez", () => {
    const items = scene(200, 3);
    const grid = new GridIndex<TestSprite>(32);
    for (const it of items) grid.insert(it);
    const ids = grid.query({ x: 0, y: 0, w: 640, h: 360 }).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

En kritik iki test şunlar. Birincisi "birleşmiş bölgeler girdilerin tamamını kapsar": her kirli dikdörtgen, birleştirmeden sonra bir çıktının **içinde tamamen** yer almalı. Kesişim alanı, girdinin alanına eşitse girdi tümüyle kapsanmış demektir. Bu test kırmızı yanıyorsa ekranda hayalet kalıyor.

İkincisi brute-force karşılaştırması. Grid'in verdiği nesne kümesi, "hepsini tek tek kontrol et" yönteminin verdiğiyle **birebir** aynı olmalı. Broad-phase yazısındaki disiplinin aynısı: hızlı yöntemi, yavaş ve kesin yöntemle karşılaştır. Dört farklı bölgeyi denedim (köşe, orta, kenardan taşan, tam ekran) çünkü tuval sınırında kalan bölgede hücre hesabının kayması en olası hata.

Bu iki test yeşilse geri kalanı görsel ayardan ibaret.

### Ne Zaman Değer, Ne Zaman Değmez

Şimdi karar kuralı. Elimde ölçüm var, tahmin yürütmeye gerek yok.

Aynı 2.000 nesnelik sahnede hareketli nesne sayısını değiştirip 300 kare ortalaması aldım (`maxWaste = 2000`, `maxRegions = 24`):

| Hareketli nesne | Oran | Bölge / kare | Kirli alan | Çizilen nesne / kare | Tam çizime göre | Takip |
|---|---|---|---|---|---|---|
| 5 | %0,25 | 4,6 | %1,0 | 52,7 | %3 | 0,006 ms |
| 20 | %1 | 14,6 | %5,2 | 260,2 | %13 | 0,254 ms |
| 40 | %2 | 20,9 | %12,5 | 521,1 | %26 | 1,903 ms |
| 100 | %5 | 1,0 | %100,0 | 2.000,0 | %100 | 0,015 ms |
| 200 | %10 | 1,0 | %100,0 | 2.000,0 | %100 | 0,029 ms |
| 400 | %20 | 1,0 | %100,0 | 2.000,0 | %100 | 0,058 ms |
| 2.000 | %100 | 1,0 | %100,0 | 2.000,0 | %100 | 0,294 ms |

Son sütun kare başına takip maliyeti: kirletme artı birleştirme, çizim hariç (Apple M2 Pro, Node 22).

Grafiğin şekli beklediğimden sert çıktı. Beş hareketli nesnede iş yükünün yalnızca %3'ünü yapıyoruz, otuz kat kazanç. Yirmide %13, kırkta %26. Sonra uçurum: yüz hareketlide teknik kendini kapatıyor ve tam çizime dönüyor.

O uçurum bir hata değil, kaçış kapısının çalışması. Yüz hareketli nesne kare başına 200 ham kirli dikdörtgen üretiyor; bu, bölge tavanının dört katını aştığı için `regions()` daha birleştirmeye kalkışmadan "hepsi kirli" diyor. Sistem kendi kendine "bu sahnede benim yerim yok" diyor. Bu davranışı bilerek koydum, çünkü sessizce yavaşlayan bir optimizasyondan daha sinsi bir şey yok.

Son satır tekniğin dürüst sınırı: her nesne hareket ettiğinde dirty-rect **kaybediyor**. Tam çizimin yaptığı işin aynısını yapıyor (2.000 nesne, tuvalin %100'ü), üstüne kare başına 0,29 ms takip maliyetini ödüyor. 60 kare/saniyede bu, bütçenin %1,8'i; hiçbir karşılığı olmadan.

Dürüst karar kuralım:

- **Hareketli nesne oranı %1'in altındaysa** dirty-rect kesin kazandırır. Envanter, harita, tablo, düzenleyici, HUD ağırlıklı ekranlar bu kategoride.
- **%1 ile %2 arasında** hâlâ kazandırıyor ama takip maliyeti görünür hale geliyor (bende %2'de kare başına 1,9 ms). Ölçün.
- **%5'in üstünde** uğraşmayın. Zaten sistem sizin için kapatıyor. `clearRect(0, 0, W, H)` yapın ve çizimin kendisini hızlandırmaya bakın: sprite batching, offscreen önden render, nesne havuzu.
- **Kamera sürekli kayıyorsa** oran ne olursa olsun uğraşmayın. Bu tekniğin sınırı burası.
- **Sabit kameralı tile oyunu**: tam hedef kitle. Zemin karoları hiç değişmez, sadece karakterler ve efektler kirletir.

Ölçmeden karar vermeyin. Demo projede kirli bölgeleri çerçeveleyen bir görselleştirme modu var ve bunu tavsiye ediyorum: çerçeveleri ekranda görünce hangi nesnenin gereksiz yere kirlettiği bir saniyede anlaşılıyor. Demoda hareketli nesne kaydırıcısını 100'e çektiğinizde çerçevenin bütün ekranı sardığını görürsünüz: tablodaki %100 satırının görsel karşılığı budur.

### Özetle:

1. Canvas 2D tuvali kalıcıdır. `clearRect(0, 0, W, H)` bu garantiyi her karede çöpe atar; kirli dikdörtgen tekniği onu paraya çevirir.
2. Hareket eden nesne iki yeri birden kirletir: bıraktığı yeri ve gittiği yeri. `markMoved(prev, next)` bu yüzden var.
3. Anti-aliasing geometrik sınırın dışına taşar. Her kirli dikdörtgeni en az 1px şişirin ve tam sayı sınırına yuvarlayın, yoksa hayalet iz kalır.
4. Birleştirme eşiğini oran olarak yazmayın; kartopu gibi büyür ve hiçbir şey kazandırmadan kirli alanı büyütür. Mutlak israf bütçesi (px²) kullanın; benim sahnemde 500 ile 2.000 arası tatlı nokta çıktı.
5. Her bölge için `save` → `clip` → `clearRect` → çiz → `restore`. `restore` atlanırsa ikinci bölge birinci bölgenin kırpmasıyla kesişir ve ekran kaybolur.
6. "Kirli bölgeye değen nesneleri bul" bir uzamsal sorgudur; broad-phase yazısındaki grid burada da aynı işi görür. Sadece z-order için sonucu sıralamayı unutmayın.
7. Kaydırmalı kamera bu tekniği tamamen geçersiz kılar: kamera bir piksel kaysa bütün ekran kirlenir. Kabul edin, `markAll()` deyin ve enerjinizi culling'e harcayın.
8. Basit alternatif katmanlı canvas: statik arka plan alta bir kez, hareketliler üste her kare. Yirmi satır, sıfır bug riski, çoğu sahnede yeterli.
9. Karar kuralı hareketli nesne oranı: %1 altı kesin kazanç, %5 üstü kayıp — %100 hareketlide teknik tam çizimin yaptığı işi yapıp üstüne takip maliyeti ödetir. Ölçün, tahmin etmeyin.

Repoda üç komut var. `npm test` 17 testle `Rect` matematiğini, birleştiriciyi, takipçiyi ve uzamsal indeksi doğruluyor; `npm run bench` yukarıdaki üç tabloyu kendi makinenizde yeniden üretiyor (sayım sütunları deterministik, sadece takip süresi makinenize göre değişir); `npm run dev` ise kirli bölgeleri çerçeveleyen demoyu açıp tam çizimle dirty-rect arasındaki anahtarı elinize veriyor. Katmanlı canvas örneği de aynı repoda duruyor.

En çok zamanımı kod değil, o oran eşiğinin neden bozduğunu anlamak aldı. Ölçüm çıktısına ilk baktığımda "bölge sayısı düştü, demek ki iyi olmuş" diye sevinmiştim. Kirli alan sütununu fark etmem yarım saat sürdü — ve o yarım saat boyunca elimde, bozduğu şeyi bana göstermeyen bir tablo vardı. Optimizasyonda zor olan hızlı kod yazmak değilmiş; hangi sütuna bakacağını bilmekmiş.

Masada bir damla kahve varsa, silinecek yer bir damla kadardır. Gerisini rahat bırakın. 🧹💬

# 📚 Fihrist - Kütüphane Yönetim Sistemi

[![Lisans: MIT](https://img.shields.io/badge/Lisans-MIT-blue.svg)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-7.4%20%7C%208.x-777bb4.svg?logo=php&logoColor=white)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-5.7%20%7C%208.0-4479A1.svg?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini-orange.svg)]()

**Fihrist**, okullar, belediyeler, dernekler ve kişisel kitap koleksiyonları için tasarlanmış; **Google Gemini Yapay Zekası** ve **kamera ile barkod tarama** özelliklerine sahip, modern, hızlı ve web tabanlı bir Kütüphane Yönetim Sistemidir.

---

## ✨ Öne Çıkan Özellikler

- **🤖 Google Gemini AI ile Kitap Tanıma:**
  Kataloğa yeni bir kitap eklerken ISBN girildiğinde sistem; **Google Gemini Flash (`gemini-2.5-flash`, `gemini-1.5-flash`)** modellerini kullanarak kitabın başlığı, yazarı, yayınevi, basım yılı, sayfa sayısı ve kategorisini anında otomatik üretir.
- **📷 Kamera ile Barkod / QR Kod Okuyucu:**
  Dahili `html5-qrcode` tarayıcısı sayesinde telefon veya dizüstü bilgisayar kamerasını kullanarak fiziksel kitapların arkasındaki barkodu okutabilir ve tek tıkla arama/ödünç verebilirsiniz.
- **⚡ Çoklu API Agregasyonu:**
  Kitap bilgileri; ISBNdb, Google Gemini, OpenLibrary, Google Books ve Kitapyurdu kaynaklarından taranır ve en eksiksiz veri kümesi birleştirilir.
- **💾 Akıllı MySQL Önbellek (`isbn_cache`):**
  Sorgulanan tüm kitaplar yerel veritabanında 30 gün boyunca önbelleklenir. Kota ve API maliyeti en aza indirilir.
- **📊 Canlı İstatistikler & Grafikler:**
  Chart.js destekli gösterge paneli: Kategori dağılımları, aktif ödünçler, geciken kitaplar ve üye istatistikleri.
- **👤 Üye Girişi:** Yönetici tarafından oluşturulan kullanıcı adı/parola ile üyeler yalnızca kendi ödünç geçmişlerini ve iade tarihlerini görüntüler.
- **📤 Rapor ve Tam Yedek:** Yönetici CSV raporunu ve tek ZIP içinde veritabanının SQL + JSON dökümünü ve `/data` dosyalarını indirebilir. Tam yedek parola hashleri ve veritabanındaki API anahtarları gibi hassas bilgiler içerebildiğinden yalnızca yönetici oturumuna açıktır.
- **📚 Ödünç Güvenliği:** Stok ve üye başına ödünç limiti sunucu tarafında doğrulanır.
- **✏️ Kayıt Düzenleme:** Kitaplar, üyeler, yöneticiler, ödünç tarihleri ve sistem ayarları güncellenebilir.
- **🗑️ Geri Alınabilir Silme:** Kitap, üye, yönetici ve iade edilmiş ödünç kayıtları çöp kutusuna taşınır; kayıtlar yönetici ayarlarından geri yüklenebilir.
- **🎨 Modüler & Duyarlı Arayüz:**
  Tailwind CSS ve modern cam efekti (Glassmorphism), Koyu/Açık (Dark/Light) tema geçişi ve mobilde tam uyumlu düzen.

---

## 📁 Proje Dosya Yapısı

```
library-manager/
├── api.php             # RESTful API, oturum yönetimi, Gemini AI & ISBN arama servisleri
├── db.php              # PDO veritabanı bağlantısı, şema kurulumu (db_init)
├── config.php          # MySQL ve cPanel veritabanı bağlantı ayarları
├── migrate.php         # Eski JSON verilerini MySQL'e aktarma aracı (otomatik kilitli)
├── index.html          # Semantik ve modülerleştirilmiş ana HTML arayüzü
├── css/
│   └── style.css       # Özel animasyonlar, scrollbar ve glassmorphism stilleri
├── js/
│   └── app.js          # İstemci tarafı uygulama mantığı, grafikler, barkod tarayıcı
├── LICENSE             # MIT Açık Kaynak Lisansı
└── README.md           # Proje dokümantasyonu
```

---

## 🚀 Kurulum Rehberi

### 1. Dosyaları Sunucuya Yükleme
Projeyi sunucunuzun (cPanel `public_html`, Apache veya Nginx `www`) dizinine yükleyin.

### 2. Veritabanı Yapılandırması (`config.php`)
`config.php` dosyasını açarak MySQL bilgilerinizi tanımlayın:

```php
<?php
return [
  'host' => 'localhost',
  'port' => 3306,
  'name' => 'veritabani_adiniz',
  'user' => 'veritabani_kullaniciniz',
  'pass' => 'guclu_veritabani_sifreniz',
  'migrate_key' => 'guvenli_rastgele_anahtar_buraya',
];
```

> **Not:** Veritabanı tabloları ilk sayfa açılışında oluşturulur. Üye hesabı alanları eski kurulumlarda da otomatik olarak eklenir. Üye eklerken kullanıcı adı ve en az 10 karakterlik ilk parola belirlenir.

---

## 🔐 Güvenli İlk Kurulum

- **Varsayılan `admin / 1234` hesabı oluşturulmaz.** İlk yönetici hesabı için sunucu ortam değişkenine en az 16 karakterlik rastgele bir parola tanımlayın: `FIHRIST_INITIAL_ADMIN_PASSWORD`.
- Bu değişkeni web sunucusu/PHP-FPM ortamına güvenli biçimde ekleyin; parolayı kaynak koda, Git deposuna veya web üzerinden indirilebilir bir dosyaya yazmayın.
- İlk API isteği bu parola ile `admin` hesabını oluşturur. Ardından ortam değişkenini kaldırıp normal yönetici şifresini uygulama üzerinden değiştirin.
- `config.php` dosyasını web kök dizininin dışında tutun veya web sunucusunda doğrudan erişimi engelleyin.
- **API anahtarları:** Gemini/ISBN sağlayıcı anahtarlarını yalnızca yönetici oturumu üzerinden girin; hiçbir zaman istemci JavaScript'ine eklemeyin.

---

## 🔌 API Endpointleri (`api.php`)

| Metot | İstek (`?a=...`) | Açıklama |
| :--- | :--- | :--- |
| `POST` | `login` | Kullanıcı girişi ve güvenli oturum başlatma |
| `GET` | `logout` | Oturumu sonlandırma |
| `GET` | `get` | Tüm kitap, üye ve ödünç verilerini getirme (varsayılan şifre kontrolü ile) |
| `POST` | `book_add` | Yeni bir kitap kaydı ekleme |
| `POST` | `book_update` | Mevcut bir kitabı güncelleme |
| `POST` | `book_delete` | Kitabı silme (ödünçte değilse) |
| `POST` | `member_add` | Yeni üye ekleme |
| `POST` | `member_update` | Üye güncelleme |
| `POST` | `member_delete` | Üyeyi silme (üzerinde kitap yoksa) |
| `POST` | `loan_create` | Ödünç verme (stok kontrolü ile) |
| `POST` | `loan_return` | Kitabı iade alma |
| `GET` | `report` | Ödünç geçmişini CSV olarak indirme (yönetici) |
| `GET` | `backup` | JSON yedeği indirme (yönetici) |
| `GET` | `isbn` | ISBN numarasına göre AI ve katalog sorgulama |

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.

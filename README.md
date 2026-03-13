# Gözetmenlik Takip ve Atama Sistemi

Bu proje, kurum içi sınav gözetmenlik görevlerini adil bir şekilde dağıtmak ve takip etmek için geliştirilmiş web tabanlı bir sistemdir.

## Özellikler
- **Adil Dağılım:** Katsayı tabanlı puanlama sistemi (hafta sonu, akşam vb.) ile görevler otomatik ve dengeli dağıtılır.
- **Kısıt Yönetimi:** Personelin müsait olmadığı gün ve saatler tanımlanabilir.
- **Rol Tabanlı Erişim:** Admin (tam yetki) ve Misafir (okuma yetkisi) rolleri.
- **Dışa Aktarma:** Sınav programını Excel veya Resim (PNG) olarak indirebilme.
- **Çakışma Kontrolü:** Aynı saate gelen görevleri veya yer çakışmalarını otomatik tespit eder.

## Teknolojiler
- HTML5, CSS3, JavaScript (Vanilla ES6)
- XLSX (SheetJS) - Excel işlemleri için
- html2canvas - Görüntü kaydetme için

## Kurulum ve Kullanım
1. Projeyi bilgisayarınıza indirin.
2. `index.html` dosyasını herhangi bir modern tarayıcıda açın.
3. Veriler tarayıcınızın `Local Storage` alanında saklanır, bu yüzden verilerinizi kaybetmemek için düzenli olarak "Yedekle" butonunu kullanmanızı öneririz.

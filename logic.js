// Şifreler artık backend'de tutuluyor. Frontend'de şifre YOKTUR.
const DB_KEY = 'gozetmenlik_db_v25';

// Backend API Adresi
// const API_BASE_URL = "http://localhost:8082";
const API_BASE_URL = "https://gtumath.oguzhanselcuk.me"; // Cloudflare Tunnel ile açtığınızda bunu kullanın.

const KATSAYILAR = {
    HAFTA_ICI_MESAI: 1.0,
    HAFTA_ICI_AKSAM: 1.5,
    HAFTA_SONU_GUNDUZ: 2.0,
    HAFTA_SONU_AKSAM: 2.5
};

const GLOBAL_LIMITS = {
    MIN_TASKS: 3,
    MAX_TASKS: 7
};

let DB = {
    staff: [],
    exams: [],
    constraints: {}
};
function getKatsayi(date) {
    const day = date.getDay();
    const hour = date.getHours();
    const minutes = date.getMinutes();
    const currentTime = hour + minutes / 60;

    const isWeekend = (day === 0 || day === 6);
    
    if (isWeekend) {
        return (currentTime >= 8.5 && currentTime < 17.5) ? KATSAYILAR.HAFTA_SONU_GUNDUZ : KATSAYILAR.HAFTA_SONU_AKSAM;
    } else {
        return (currentTime >= 8.5 && currentTime < 17.5) ? KATSAYILAR.HAFTA_ICI_MESAI : KATSAYILAR.HAFTA_ICI_AKSAM;
    }
}

function calculateScore(date, duration) {
    return duration * getKatsayi(date);
}

function timeToMins(timeStr) {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function isAvailable(staffName, dateStr, timeStr, duration) {
    const constraints = DB.constraints && DB.constraints[staffName] ? DB.constraints[staffName] : [];
    if (constraints.length === 0) return true;

    const examDate = new Date(dateStr);
    const dayOfWeek = examDate.getDay();
    const mm = String(examDate.getMonth() + 1).padStart(2, '0');
    const dd = String(examDate.getDate()).padStart(2, '0');
    const matchDateStr = `${mm}-${dd}`;

    const examStart = timeToMins(timeStr);
    const examEnd = examStart + duration;

    for (const c of constraints) {
        let isDayMatch = (c.day !== undefined && parseInt(c.day) === dayOfWeek);
        let isDateMatch = (c.date !== undefined && c.date === matchDateStr);
        
        if (isDayMatch || isDateMatch) {
            const constraintStart = timeToMins(c.start);
            const constraintEnd = Math.min(timeToMins(c.end), timeToMins("17:30"));
            
            // Çakışma kontrolü
            if (examStart < constraintEnd && examEnd > constraintStart) {
                return false; 
            }
        }
    }
    return true;
}

/**
 * Bir gözetmenin o saatte hem kısıt hem de mevcut sınavlar açısından gerçekten boş olup olmadığını kontrol et
 */
function isProctorTrulyFree(staffId, date, time, duration, ignoreExamId = null) {
    const staff = DB.staff.find(s => s.id === staffId);
    if (!staff) return false;

    // 1. Kısıt kontrolü
    if (!isAvailable(staff.name, date, time, duration)) return false;

    // 2. Mevcut sınavlarla çakışma kontrolü (15 dk buffer)
    const start = new Date(`${date}T${time}`);
    const end = new Date(start.getTime() + (duration + 15) * 60000);

    const hasConflict = DB.exams.some(ex => {
        if (ex.id === ignoreExamId) return false;
        if (ex.proctorId !== staffId) return false;
        if (ex.date !== date) return false;

        const exStart = new Date(`${ex.date}T${ex.time}`);
        const exEnd = new Date(exStart.getTime() + (ex.duration + 15) * 60000);
        return (start < exEnd && end > exStart);
    });

    return !hasConflict;
}

/**
 * En adil gözetmen atamasını yap (hem kısıt hem sınav çakışması kontrolü ile)
 */
function findBestProctor(dateStr, timeStr, duration, ignoreExamId = null) {
    if (DB.staff.length === 0) return null;

    let available = DB.staff.filter(s =>
        isProctorTrulyFree(s.id, dateStr, timeStr, duration, ignoreExamId) &&
        (s.taskCount || 0) < GLOBAL_LIMITS.MAX_TASKS
    );

    // Eğer MAX_TASKS (7) sınırına herkes ulaştığı için müsait kimse kalmadıysa, bu sınırı esnet. 
    // Böylece test ortamında veya yoğun haftalarda "müsait gözetmen bulunamadı" hatası almayız.
    if (available.length === 0) {
        available = DB.staff.filter(s =>
            isProctorTrulyFree(s.id, dateStr, timeStr, duration, ignoreExamId)
        );
    }

    if (available.length === 0) return null;

    // SIRALAMA STRATEJİSİ: 
    // 1. Önce minimum görev sayısına (3) ulaşmamış olanlara öncelik ver
    // 2. Kendi aralarında en düşük puanlı olanı seç
    return available.sort((a, b) => {
        const aMinReached = (a.taskCount || 0) >= GLOBAL_LIMITS.MIN_TASKS;
        const bMinReached = (b.taskCount || 0) >= GLOBAL_LIMITS.MIN_TASKS;

        if (aMinReached !== bMinReached) {
            return aMinReached ? 1 : -1; // Ulaşmayan öne (üstte)
        }
        return a.totalScore - b.totalScore;
    })[0];
}

/**
 * Tüm çakışmaları otomatik çöz
 * - Hem zaman çakışması olan, hem de kısıt ihlali olan sınavlar için yeni gözetmen atar
 */
function autoResolveConflicts() {
    let resolvedCount = 0;
    let skippedCount = 0;

    // Adım 1: Kısıt ihlali olan sınavları bul
    const violationExamIds = new Set();
    DB.exams.forEach(ex => {
        const proctorStaff = DB.staff.find(s => s.id === ex.proctorId);
        if (!proctorStaff) return;
        if (!isAvailable(proctorStaff.name, ex.date, ex.time, ex.duration)) {
            violationExamIds.add(ex.id);
        }
    });

    // Adım 2: Zaman çakışması olan sınavları bul
    const conflictIds = getConflicts();

    // Adım 3: Hepsini birleştir
    const allProblematicIds = new Set([...violationExamIds, ...conflictIds]);

    if (allProblematicIds.size === 0) {
        return { resolved: 0, skipped: 0, message: "Zaten çakışma yok!" };
    }

    // Adım 4: Her sorunlu sınavı düzelt
    allProblematicIds.forEach(examId => {
        const exam = DB.exams.find(e => e.id === examId);
        if (!exam) return;

        // Eski gözetmenin puanını düş
        const oldStaff = DB.staff.find(s => s.id === exam.proctorId);
        if (oldStaff) {
            oldStaff.totalScore = Math.max(0, oldStaff.totalScore - exam.score);
            oldStaff.taskCount = Math.max(0, oldStaff.taskCount - 1);
        }

        // Yeni uygun gözetmeni bul (mevcut sınav hariç)
        const newProctor = findBestProctor(exam.date, exam.time, exam.duration, exam.id);

        if (newProctor) {
            // Yeni gözetmeni ata
            exam.proctorId = newProctor.id;
            exam.proctorName = newProctor.name;
            newProctor.totalScore = parseFloat((newProctor.totalScore + exam.score).toFixed(2));
            newProctor.taskCount += 1;
            resolvedCount++;
        } else {
            // Eski gözetmeni geri al (yetersiz yedek)
            if (oldStaff) {
                oldStaff.totalScore += exam.score;
                oldStaff.taskCount += 1;
            }
            skippedCount++;
        }
    });

    saveToLocalStorage();
    return { resolved: resolvedCount, skipped: skippedCount };
}


function addExam(examData) {
    let proctor = null;
    
    // Eğer kullanıcı manuel bir gözetmen seçtiyse onu al
    if (examData.proctorId) {
        proctor = DB.staff.find(s => s.id === examData.proctorId);
    }
    
    // Manuel seçim yoksa veya seçilen hoca bulunamadıysa algoritmaya bırak
    if (!proctor) {
        proctor = findBestProctor(examData.date, examData.time, examData.duration);
    }

    if (!proctor) {
        alert("Bu tarih ve saatte müsait bir gözetmen bulunamadı!");
        return;
    }

    const score = calculateScore(new Date(`${examData.date}T${examData.time}`), examData.duration);
    
    const newExam = {
        ...examData,
        id: Date.now(),
        location: examData.location || "Belirtilmedi",
        proctorId: proctor.id,
        proctorName: proctor.name,
        score: score,
        katsayi: getKatsayi(new Date(`${examData.date}T${examData.time}`))
    };

    DB.exams.push(newExam);
    
    // Personel puanını güncelle
    const staffMember = DB.staff.find(s => s.id === proctor.id);
    staffMember.totalScore += score;
    staffMember.taskCount += 1;

    saveToLocalStorage();
    return newExam;
}

function updateExam(id, newData) {
    const exIndex = DB.exams.findIndex(e => e.id === id);
    if (exIndex === -1) return;

    const oldExam = DB.exams[exIndex];
    
    // Yükü eski gözetmenden düş
    const oldStaff = DB.staff.find(s => s.id === oldExam.proctorId);
    if (oldStaff) {
        oldStaff.totalScore -= oldExam.score;
        oldStaff.taskCount -= 1;
    }

    // Yeni puan hesapla ve Gözetmeni bul
    const newScore = calculateScore(new Date(`${newData.date}T${newData.time}`), newData.duration);
    const newStaff = DB.staff.find(s => s.id === newData.proctorId);

    if (newStaff) {
        newStaff.totalScore += newScore;
        newStaff.taskCount += 1;
        
        // Sınavı güncelle
        DB.exams[exIndex] = {
            ...oldExam,
            name: newData.name,
            location: newData.location || "Belirtilmedi",
            date: newData.date,
            time: newData.time,
            duration: newData.duration,
            proctorId: newStaff.id,
            proctorName: newStaff.name,
            score: newScore,
            katsayi: getKatsayi(new Date(`${newData.date}T${newData.time}`))
        };
        
        saveToLocalStorage();
    }
}

const API_URL = API_BASE_URL + "/api/data";

async function saveToBackend() {
    console.log("Sunucuya kaydediliyor...", API_URL);
    try {
        const payload = JSON.stringify(DB);
        const secret = sessionStorage.getItem('userPassword') || '';
        
        // Header değerleri sadece ISO-8859-1 (latin1) karakterleri içerebilir.
        // Şifre Türkçe karakter içeriyorsa fetch hata verir. Bu yüzden Base64 ile gönderiyoruz.
        const encodedSecret = btoa(unescape(encodeURIComponent(secret)));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-secret': encodedSecret
            },
            body: payload
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: "Sunucu geçerli bir JSON dönmedi" }));
            throw new Error(err.error || `Sunucu hatası: ${response.status}`);
        }
        console.log("Sunucuya başarıyla kaydedildi.");
    } catch (e) {
        console.error("Backend kayit hatasi DETAY:", {
            error: e,
            message: e.message,
            stack: e.stack,
            apiUrl: API_URL
        });
        alert("🚨 Veriler sunucuya kaydedilemedi!\n" + e.message);
    }
}

function saveToLocalStorage() {
    // Halen local'e de kopyasını (cache) atıyoruz, çökmelerde vs. kullanmak için
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    
    // Eğer şifreyi giren kişi "Guest" değil "Admin" ise sunucuya yaz
    if (sessionStorage.getItem('isAdmin') === 'true') {
        saveToBackend();
    }
}

async function loadFromDataJSON() {
    try {
        console.log("Veriler sunucudan yükleniyor...", API_URL);
        const response = await fetch(API_URL + '?t=' + new Date().getTime());
        if (!response.ok) throw new Error(`Ağ hatası: ${response.status}`);
        const data = await response.json();
        
        if (data && typeof data === 'object' && Array.isArray(data.staff)) {
            DB = data;
            // Veriyi lokal hafızaya (cache) alalım
            localStorage.setItem(DB_KEY, JSON.stringify(DB));
            console.log("Veriler başarıyla yüklendi.");
        } else {
            console.error("Sunucudan gelen veri geçersiz formatta!", data);
            throw new Error("Geçersiz veri formatı");
        }
    } catch (e) {
        console.warn("API başarıyla okunamadı, localStorage kullanılarak deneniyor...", e);
        const saved = localStorage.getItem(DB_KEY);
        if (saved) {
            try {
                DB = JSON.parse(saved);
            } catch (parseError) {
                console.error("LocalStorage verisi bozuk!", parseError);
            }
        } else {
            console.error("Hiçbir veri bulunamadı! Lütfen backendin çalıştığından emin olun.");
        }
    }
}

/**
 * Görev Çakışmalarını Tespit Et
 * @returns {Set<number>} Çakışan sınav ID'leri
 */
function getConflicts() {
    const conflicts = new Set();
    const sortedExams = [...DB.exams].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    for (let i = 0; i < sortedExams.length; i++) {
        const examA = sortedExams[i];
        const startA = new Date(`${examA.date}T${examA.time}`);
        const endA = new Date(startA.getTime() + (examA.duration + 15) * 60000); // 15 dk geçiş süresi

        for (let j = i + 1; j < sortedExams.length; j++) {
            const examB = sortedExams[j];
            
            // Farklı günlerse bakmaya gerek yok (sıralı olduğu için sonraki de farklıdır)
            if (examA.date !== examB.date) break;
            
            // Aynı gözetmen mi?
            if (examA.proctorId === examB.proctorId) {
                const startB = new Date(`${examB.date}T${examB.time}`);
                
                // Zaman çakışması kontrolü (A bitmeden B başlıyorsa)
                if (startB < endA) {
                    conflicts.add(examA.id);
                    conflicts.add(examB.id);
                }
            }
        }
    }
    return conflicts;
}

/**
 * Derslik Çakışmalarını Tespit Et
 * @returns {Set<number>} Çakışan sınav ID'leri
 */
function getLocationConflicts() {
    const conflicts = new Set();
    const sortedExams = [...DB.exams].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    for (let i = 0; i < sortedExams.length; i++) {
        const examA = sortedExams[i];
        if (!examA.location || examA.location === "-") continue;

        const startA = new Date(`${examA.date}T${examA.time}`);
        const endA = new Date(startA.getTime() + examA.duration * 60000);

        for (let j = i + 1; j < sortedExams.length; j++) {
            const examB = sortedExams[j];
            if (examA.date !== examB.date) break;
            if (!examB.location || examB.location === "-") continue;

            const startB = new Date(`${examB.date}T${examB.time}`);

            // Aynı yer ve zaman kesişmesi mi?
            if (examA.location.trim() === examB.location.trim()) {
                // Eğer sınav adı, tarihi ve saati aynıysa, aynı sınavdır, çakışma değildir
                if (examA.name === examB.name && examA.date === examB.date && examA.time === examB.time) {
                    continue;
                }
                if (startB < endA) {
                    conflicts.add(examA.id);
                    conflicts.add(examB.id);
                }
            }
        }
    }
    return conflicts;
}

/**
 * Akıllı Öneri: Müsait ve en düşük puanlı personelleri getir
 * @param {string} date 'YYYY-MM-DD'
 * @param {string} time 'HH:mm'
 * @param {number} duration dk
 * @param {number|null} currentExamId Düzenleme işlemiysek mevcut sınavı yoksaymak için
 * @returns {Array} En iyi 3 aday
 */
function getRecommendedProctors(date, time, duration, currentExamId = null) {
    if (!date || !time) return [];

    // 1. Müsait olanları filtrele
    const availableStaff = DB.staff.filter(s => {
        // Genel müsaitlik kontrolü (Kendi kısıtları + Çakışma)
        const ok = isAvailable(s.name, date, time, duration);
        if (!ok) return false;

        // Mevcut sınavlar arasındaki çakışma kontrolü (Kendi ID'si hariç)
        const start = new Date(`${date}T${time}`);
        const end = new Date(start.getTime() + (duration + 15) * 60000);

        const hasConflict = DB.exams.some(ex => {
            if (ex.id === currentExamId) return false; // Düzenlediğimiz sınavı sayma
            if (ex.proctorId !== s.id) return false;
            if (ex.date !== date) return false;

            const exStart = new Date(`${ex.date}T${ex.time}`);
            const exEnd = new Date(exStart.getTime() + (ex.duration + 15) * 60000);

            return (start < exEnd && end > exStart);
        });

        return !hasConflict;
    });

    // 2. Puana göre sırala ve ilk 3'ü dön
    return availableStaff
        .sort((a, b) => a.totalScore - b.totalScore)
        .slice(0, 3);
}



/**
 * Sınav Programını Sıfırla ama Puanları Koru
 */
function resetExamsButKeepScores() {
    DB.exams = [];
    DB.staff.forEach(s => {
        s.taskCount = 0;
    });
    saveToLocalStorage();
}

// loadFromLocalStorage(); // Artık app.js içinden asenkron olarak çağrılıyor

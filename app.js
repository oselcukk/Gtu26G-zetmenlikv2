/**
 * Gözetmenlik UI Kontrolcü
 */

let scoreChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginOverlay = document.getElementById('login-overlay');
    const appWrapper = document.getElementById('app-wrapper');
    const loginPassInput = document.getElementById('login-password');
    const btnLogin = document.getElementById('btn-login');
    const btnGuestLogin = document.getElementById('btn-guest-login');
    const loginError = document.getElementById('login-error');

    const finishLogin = async (isAdmin) => {
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');
        
        if (!isAdmin) document.body.classList.add('guest-mode');
        else document.body.classList.remove('guest-mode');
        
        loginOverlay.classList.add('hidden');
        appWrapper.style.display = 'block';
        await initApp();
    };

    // Oturum Kontrolü
    if (sessionStorage.getItem('isLoggedIn') === 'true') {
        finishLogin(sessionStorage.getItem('isAdmin') === 'true');
    } else {
        loginOverlay.classList.remove('hidden');
        appWrapper.style.display = 'none';
    }

    const handleLogin = async () => {
        const password = loginPassInput.value;
        try {
            const response = await fetch(API_BASE_URL + '/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const result = await response.json();

            if (result.success) {
                // Şifreyi sessionStorage'a kaydet (Sadece bu oturumda, backend'e yazma işlemlerinde kullanılacak)
                sessionStorage.setItem('userPassword', password);
                finishLogin(result.role === 'admin');
            } else {
                loginError.classList.remove('hidden');
                loginPassInput.value = '';
                loginPassInput.focus();
            }
        } catch (e) {
            alert('Sunucuya bağlanılamadı! Backend çalışıyor mu?');
            console.error('Login hatası:', e);
        }
    };

    if (btnLogin) btnLogin.addEventListener('click', handleLogin);
    
    if (loginPassInput) {
        loginPassInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }
});

async function initApp() {
    // Sitenin en güncel veriyi Backend API'den asenkron olarak okumasını bekliyoruz
    await loadFromDataJSON();

    // Tüm eski yamalar (v2-v20) kaldırıldı. Veriler artık backend'deki data.json'dan geliyor.
    // Eski yama kodları gereksizdir çünkü data.json zaten tüm düzeltmeleri içermektedir.

    initUI();
    renderDashboard();
    loadStaffSelects(); // Personel seçim dropdownlarını yükle
}


const navButtons = {
    dashboard: document.getElementById('btn-dashboard'),
    schedule: document.getElementById('btn-schedule'),
    exams: document.getElementById('btn-exams'),
    staff: document.getElementById('btn-staff'),
    availability: document.getElementById('btn-availability'),
    constraints: document.getElementById('btn-constraints')
};

const sections = {
    dashboard: document.getElementById('section-dashboard'),
    schedule: document.getElementById('section-schedule'),
    exams: document.getElementById('section-exams'),
    staff: document.getElementById('section-staff'),
    availability: document.getElementById('section-availability'),
    constraints: document.getElementById('section-constraints')
};

// Navigation
Object.entries(navButtons).forEach(([key, btn]) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
        // Update Buttons
        Object.values(navButtons).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update Sections
        Object.values(sections).forEach(s => s.classList.add('hidden'));
        if (sections[key]) sections[key].classList.remove('hidden');

        if (key === 'dashboard') renderDashboard();
        if (key === 'schedule') renderSchedule();
        if (key === 'exams') renderExams();
        if (key === 'staff') renderStaff();
        if (key === 'availability') renderAvailability();
        if (key === 'constraints') renderConstraintsPage();
    });
});

let currentSort = { key: 'date', dir: 'asc' };

function initUI() {
    document.getElementById('btn-add-exam').addEventListener('click', showAddExamModal);
    document.getElementById('btn-add-staff').addEventListener('click', showAddStaffModal);
    document.getElementById('btn-modal-cancel').addEventListener('click', hideModal);
    document.getElementById('btn-close-exam-detail')?.addEventListener('click', () => {
        document.getElementById('modal-exam-detail').classList.add('hidden');
    });
    document.getElementById('modal-exam-detail')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-exam-detail')) {
            document.getElementById('modal-exam-detail').classList.add('hidden');
        }
    });

    // Kısıt Yönetimi Form Olayları
    const constraintStaffSelect = document.getElementById('constraint-staff-select');
    if (constraintStaffSelect) {
        constraintStaffSelect.addEventListener('change', () => {
            renderConstraintsList(constraintStaffSelect.value);
        });
    }

    const constraintTypeSelect = document.getElementById('constraint-type');
    if (constraintTypeSelect) {
        constraintTypeSelect.addEventListener('change', () => {
            const isDay = constraintTypeSelect.value === 'day';
            document.getElementById('constraint-day-group').classList.toggle('hidden', !isDay);
            document.getElementById('constraint-date-group').classList.toggle('hidden', isDay);
        });
    }

    const formAddConstraint = document.getElementById('form-add-constraint');
    if (formAddConstraint) {
        formAddConstraint.addEventListener('submit', (e) => {
            e.preventDefault();
            addConstraint();
        });
    }

    // Tablo sıralama dinleyicileri
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.getAttribute('data-sort');
            if (currentSort.key === sortKey) {
                currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.key = sortKey;
                currentSort.dir = 'asc';
            }
            renderExams();
        });
    });

    // İndirme (Export) Butonları Dinleyicileri
    const btnExportScheduleExcel = document.getElementById('btn-export-schedule-excel');
    if (btnExportScheduleExcel) {
        btnExportScheduleExcel.addEventListener('click', () => {
             exportTableToExcel('table-schedule', 'Sinav_Programi.xlsx');
        });
    }

    const btnExportSchedule = document.getElementById('btn-export-schedule');
    if (btnExportSchedule) {
        btnExportSchedule.addEventListener('click', () => {
             exportElementAsImage(document.querySelector('#section-schedule .table-container'), 'Sinav_Programi.png');
        });
    }

    const btnResolveConflicts = document.getElementById('btn-resolve-conflicts');
    if (btnResolveConflicts) {
        btnResolveConflicts.addEventListener('click', () => {
            const result = autoResolveConflicts();
            if (result.message) {
                alert(`✅ ${result.message}`);
            } else {
                let msg = `✅ ${result.resolved} çakışma başarıyla giderildi!`;
                if (result.skipped > 0) {
                    msg += `\n⚠️ ${result.skipped} çakışma için uygun yedek gözetmen bulunamadı. Bu sınavları lütfen manuel olarak düzenleyin.`;
                }
                alert(msg);
            }
            renderExams();
            renderSchedule();
            renderDashboard();
            renderStaff();
        });
    }

    // Yedekleme ve Geri Yükleme (JSON)
    const btnBackup = document.getElementById('btn-backup-system');
    if (btnBackup) {
        btnBackup.addEventListener('click', () => {
            const dataStr = JSON.stringify(DB, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `data.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        });
    }

    const btnResetExams = document.getElementById('btn-reset-exams');
    if (btnResetExams) {
        btnResetExams.addEventListener('click', () => {
            if (confirm("DİKKAT: Mevcut tüm sınav programı silinecek!\n\nAncak hocaların birikmiş puanları ve görev sayıları KORUNACAKTIR. Bu işlem vize sonu, final öncesi temizlik için kullanılır. Devam etmek istiyor musunuz?")) {
                resetExamsButKeepScores();
                renderExams();
                renderSchedule();
                renderDashboard();
                renderStaff();
                alert("✓ Sınav programı başarıyla sıfırlandı. Puanlar korundu.");
            }
        });
    }

    const btnRestore = document.getElementById('id-restore-system');
    if (btnRestore) {
        btnRestore.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const importedDB = JSON.parse(event.target.result);
                        if (importedDB && importedDB.staff && importedDB.exams) {
                            if (confirm("Mevcut tüm veriler silinecek ve seçilen yedeğe dönülecek. Onaylıyor musunuz?")) {
                                DB = importedDB;
                                saveToLocalStorage();
                                
                                // Admin girişi ise reload öncesi sunucuya yazmayı BEKLE (reload işlemi fetch'i iptal etmesin diye)
                                if (sessionStorage.getItem('isAdmin') === 'true') {
                                    try {
                                        await saveToBackend();
                                    } catch(e) {
                                        console.error("Yedek sunucuya gönderilirken hata oluştu:", e);
                                    }
                                }
                                
                                location.reload();
                            }
                        } else {
                            alert("Hata: Geçersiz yedek dosyası!");
                        }
                    } catch (err) {
                        alert("Hata: Dosya okunamadı!");
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        });
    }

    const btnExportDashboard = document.getElementById('btn-export-dashboard');
    if (btnExportDashboard) {
        btnExportDashboard.addEventListener('click', () => {
             exportElementAsImage(document.getElementById('dashboard-export-container'), 'Gozetmenlik_Analiz.png');
        });
    }

    const btnGitHubSync = document.getElementById('btn-github-sync');
    if (btnGitHubSync) {
        btnGitHubSync.addEventListener('click', showGitHubSyncModal);
    }

    const btnCopySyncCode = document.getElementById('btn-copy-sync-code');
    if (btnCopySyncCode) {
        btnCopySyncCode.addEventListener('click', () => {
            const textarea = document.getElementById('github-sync-code');
            textarea.select();
            document.execCommand('copy');
            btnCopySyncCode.textContent = "✅ Kopyalandı!";
            setTimeout(() => { btnCopySyncCode.textContent = "📋 Kodu Kopyala"; }, 2000);
        });
    }

    const btnExportExams = document.getElementById('btn-export-exams');
    if (btnExportExams) {
        btnExportExams.addEventListener('click', () => {
             exportElementAsImage(document.querySelector('#section-exams .table-container'), 'Sinavlar_Listesi.png');
        });
    }

    const btnExportStaff = document.getElementById('btn-export-staff');
    if (btnExportStaff) {
        btnExportStaff.addEventListener('click', () => {
             exportElementAsImage(document.querySelector('#section-staff .table-container'), 'Personel_Listesi.png');
        });
    }

    const btnExportIndividual = document.getElementById('btn-export-individual-schedule');
    if (btnExportIndividual) {
        btnExportIndividual.addEventListener('click', () => {
            const name = document.getElementById('individual-proctor-name').textContent;
            exportElementAsImage(document.getElementById('individual-schedule-card'), `Program_${name}.png`);
        });
    }

    const btnCloseIndividual = document.getElementById('btn-close-individual-modal');
    if (btnCloseIndividual) {
        btnCloseIndividual.addEventListener('click', hideIndividualModal);
    }

    const availDateInput = document.getElementById('availability-date');
    if (availDateInput) {
        availDateInput.addEventListener('change', renderAvailability);
    }

    // ----------- Excel Import -----------
    const btnImport = document.getElementById('btn-import-excel');
    if (btnImport) {
        btnImport.addEventListener('click', () => {
            document.getElementById('import-preview').innerHTML = '';
            document.getElementById('import-file-input').value = '';
            document.getElementById('btn-confirm-import').disabled = true;
            document.getElementById('modal-import').classList.remove('hidden');
        });
    }

    const btnImportExamsAlt = document.getElementById('btn-import-auto-assign');
    if (btnImportExamsAlt) {
        btnImportExamsAlt.addEventListener('click', () => {
            document.getElementById('import-preview').innerHTML = '';
            document.getElementById('import-file-input').value = '';
            document.getElementById('btn-confirm-import').disabled = true;
            document.getElementById('modal-import').classList.remove('hidden');
        });
    }

    // Şablon İndir - Personel
    const btnTplStaff = document.getElementById('btn-download-staff-template');
    if (btnTplStaff) {
        btnTplStaff.addEventListener('click', () => {
            const data = [['İsim Soyisim']];
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Personel');
            XLSX.writeFile(wb, 'Personel_Sablonu.xlsx');
        });
    }

    // Şablon İndir - Sınav
    const btnTplExam = document.getElementById('btn-download-exam-template');
    if (btnTplExam) {
        btnTplExam.addEventListener('click', () => {
            const data = [
                ['Ders Adı', 'Derslik / Yer', 'Tarih (YYYY-MM-DD)', 'Saat (HH:MM)', 'Süre (dk)', 'Gözetmen Adı'],
                ['MATH 101', 'Amfi 1', '2025-03-20', '09:00', '90', 'Gülay Mert']
            ];
            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sınavlar');
            XLSX.writeFile(wb, 'Sinav_Sablonu.xlsx');
        });
    }

    // Dosya Yükleme - Önizleme
    const fileInput = document.getElementById('import-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const wb = XLSX.read(evt.target.result, { type: 'binary' });
                    const sheetName = wb.SheetNames[0];
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

                    if (rows.length < 2) {
                        document.getElementById('import-preview').innerHTML = '<p style="color:#ef4444;">Dosyada yeterli veri yok.</p>';
                        return;
                    }

                    // Önizleme tablosu
                    let html = '<p style="color:#10b981; margin-bottom:.5rem;">✓ ' + (rows.length - 1) + ' satır bulundu. İçerik önizlemesi:</p>';
                    html += '<div style="overflow-x:auto; max-height:200px;"><table style="width:100%; font-size:0.75rem; border-collapse:collapse;">';
                    // Başlık
                    html += '<thead><tr>' + rows[0].map(h => `<th style="padding:6px 8px; border-bottom:1px solid #334155; color:#94a3b8; text-align:left;">${h}</th>`).join('') + '</tr></thead>';
                    // İlk 5 satır önizleme
                    html += '<tbody>';
                    rows.slice(1, 6).forEach(r => {
                        html += '<tr>' + rows[0].map((_, i) => `<td style="padding:5px 8px; border-bottom:1px solid rgba(255,255,255,0.05); color:#f1f5f9;">${r[i] || ''}</td>`).join('') + '</tr>';
                    });
                    if (rows.length > 6) html += `<tr><td colspan="${rows[0].length}" style="padding:5px 8px; color:#94a3b8; font-style:italic;">... ve ${rows.length - 6} satır daha</td></tr>`;
                    html += '</tbody></table></div>';

                    document.getElementById('import-preview').innerHTML = html;
                    document.getElementById('btn-confirm-import').disabled = false;

                    // Satırları button'a aktar
                    document.getElementById('btn-confirm-import')._importData = { rows, sheetName };
                } catch(err) {
                    document.getElementById('import-preview').innerHTML = '<p style="color:#ef4444;">Dosya okunamadı: ' + err.message + '</p>';
                }
            };
            reader.readAsBinaryString(file);
        });
    }

    // Aktarmayı Onayla
    const btnConfirm = document.getElementById('btn-confirm-import');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            const { rows } = btnConfirm._importData || {};
            if (!rows || rows.length < 2) return;
            const headers = rows[0].map(h => String(h).toLowerCase().trim());

            // Personel mi Sınav mı? (Daha esnek kontrol)
            const isStaff = headers.some(h => h.includes('isim') || h.includes('ad') && !h.includes('ders'));
            const isExam = headers.some(h => h.includes('ders') || h.includes('sinav') || h.includes('sınav'));

            let added = 0;

            if (isStaff) {
                rows.slice(1).forEach(r => {
                    const name = String(r[0] || '').trim();
                    if (!name) return;
                    if (DB.staff.find(s => s.name === name)) return; // Zaten var
                    DB.staff.push({ id: Date.now() + Math.random(), name, totalScore: 0, taskCount: 0 });
                    added++;
                });
                saveToLocalStorage();
                document.getElementById('modal-import').classList.add('hidden');
                alert(`✓ ${added} yeni personel sisteme eklendi.`);
                renderStaff();
                renderDashboard();
            } else if (isExam) {
                // Sütun indekslerini bul
                // Sütun indekslerini bul (Öncelikli eşleşme ile daha akıllı takip)
                const nameIdx = headers.findIndex(h => h === 'ders adı' || h === 'ders' || (h.includes('ders') && !h.includes('lik') && !h.includes('yer')));
                const locIdx = headers.findIndex(h => h === 'derslik' || h === 'yer' || h.includes('derslik') || h.includes('konum'));
                const dateIdx = headers.findIndex(h => h === 'tarih' || h.includes('tarih'));
                const timeIdx = headers.findIndex(h => h === 'saat' || h.includes('saat') || h.includes('vakit'));
                const durIdx = headers.findIndex(h => h === 'süre' || h.includes('süre') || h.includes('sure') || h.includes('dakika'));
                const procIdx = headers.findIndex(h => h === 'gözetmen' || h.includes('gözetmen') || h.includes('gozetmen') || h.includes('hoca'));

                rows.slice(1).forEach(r => {
                    const examName = String(r[nameIdx] || '').trim();
                    const date = String(r[dateIdx] || '').trim();
                    const time = String(r[timeIdx] || '').trim();
                    if (!examName || !date || !time) return;

                    const proctorName = String(r[procIdx] || '').trim();
                    let proctor = DB.staff.find(s => s.name === proctorName);
                    
                    // SINIR KONTROLÜ: Eğer hoca ismi olsa bile sınırı aşmışsa, otomatik atamaya devret
                    if (proctor && (proctor.taskCount || 0) >= GLOBAL_LIMITS.MAX_TASKS) {
                        proctor = null;
                    }

                    // OTOMATİK ATAMA MANTIĞI: Eğer hoca ismi yoksa veya sınırı aşmış biriyse
                    if (!proctor) {
                        const duration = parseInt(r[durIdx]) || 60;
                        proctor = findBestProctor(date, time, duration);
                    }

                    if (!proctor) { return; } // Hiç müsait kimse yoksa atla

                    const duration = parseInt(r[durIdx]) || 60;
                    const dateObj = new Date(`${date}T${time}`);
                    const k = getKatsayi(dateObj);
                    const score = parseFloat((k * duration).toFixed(2));

                    DB.exams.push({
                        id: Date.now() + Math.random(),
                        name: examName,
                        location: String(r[locIdx] || '').trim(),
                        date, time, duration,
                        katsayi: k, score,
                        proctorId: proctor.id,
                        proctorName: proctor.name
                    });
                    proctor.totalScore = parseFloat((proctor.totalScore + score).toFixed(2));
                    proctor.taskCount = (proctor.taskCount || 0) + 1;
                    added++;
                });
                saveToLocalStorage();
                document.getElementById('modal-import').classList.add('hidden');
                alert(`✓ ${added} yeni sınav sisteme aktarıldı.`);
                renderExams();
                renderSchedule();
                renderDashboard();
            } else {
                alert('Dosya formatı tanınamadı. Lütfen şablonu kullanın.');
            }
        });
    }
}


function exportElementAsImage(element, filename) {
    if (!element) return;
    try {
        html2canvas(element, { scale: 2, backgroundColor: '#0f172a' }).then(canvas => {
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        });
    } catch(err) {
        console.error("Resim çıkartılamadı: ", err);
        alert("Resim olarak indirilemedi, eklenti yükleniyor olabilir.");
    }
}

function exportTableToExcel(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    try {
        const wb = XLSX.utils.table_to_book(table, { sheet: "Sınav Programı" });
        XLSX.writeFile(wb, filename);
    } catch (err) {
        console.error("Excel çıkartılamadı: ", err);
        alert("Excel indirelemedi, eklenti yükleniyor olabilir.");
    }
}

function renderDashboard() {
    const tbody = document.querySelector('#table-ranking tbody');
    tbody.innerHTML = '';

    // Sıralama (Puanı en çoktan aza, şeffaflık için)
    const sortedStaff = [...DB.staff].sort((a, b) => b.totalScore - a.totalScore);

    sortedStaff.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td><span class="clickable-name" onclick="showStaffSchedule('${s.name}')">${s.name}</span></td>
            <td>${s.totalScore.toFixed(1)}</td>
            <td>${s.taskCount}</td>
            <td><span class="badge ${s.totalScore === 0 ? 'idle' : 'active'}">${s.totalScore === 0 ? 'Beklemede' : 'Görevli'}</span></td>
        `;
        tbody.appendChild(tr);
    });

    // Stats
    document.getElementById('stat-total-exams').textContent = DB.exams.length;
    document.getElementById('stat-total-staff').textContent = DB.staff.length;
    const avg = DB.staff.length ? DB.staff.reduce((a, b) => a + b.totalScore, 0) / DB.staff.length : 0;
    document.getElementById('stat-avg-score').textContent = avg.toFixed(1);

    // Grafigi Guncelle
    updateScoreChart();
}

/**
 * KISIT YÖNETİMİ MANTIĞI
 */

function loadStaffSelects() {
    const selects = ['constraint-staff-select', 'edit-exam-proctor'];
    const staffOptions = DB.staff.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = staffOptions;
    });
}

function renderConstraintsPage() {
    const staffSelect = document.getElementById('constraint-staff-select');
    if (staffSelect && staffSelect.value) {
        renderConstraintsList(staffSelect.value);
    }
}

function renderConstraintsList(staffName) {
    const tbody = document.querySelector('#table-constraints tbody');
    const title = document.getElementById('current-constraints-title');
    title.textContent = `${staffName} - Mevcut Kısıtlar`;
    tbody.innerHTML = '';

    const constraints = DB.constraints[staffName] || [];

    if (constraints.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:2rem;">Bu gözetmen için henüz kısıt eklenmemiş.</td></tr>';
        return;
    }

    const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

    constraints.forEach((c, idx) => {
        const tr = document.createElement('tr');
        let timeLabel = "";
        if (c.day !== undefined) {
             timeLabel = `📅 Her ${dayNames[c.day]}`;
        } else {
             timeLabel = `🗓️ ${c.date}`;
        }

        tr.innerHTML = `
            <td>${timeLabel}</td>
            <td>${c.start} - ${c.end}</td>
            <td style="text-align: right;">
                <button class="btn-icon" style="color:#ef4444;" onclick="deleteConstraint('${staffName}', ${idx})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function addConstraint() {
    const staffName = document.getElementById('constraint-staff-select').value;
    const type = document.getElementById('constraint-type').value;
    const start = document.getElementById('constraint-start').value;
    const end = document.getElementById('constraint-end').value;

    let newConstraint = { start, end };

    if (type === 'day') {
        newConstraint.day = parseInt(document.getElementById('constraint-day').value);
    } else {
        newConstraint.date = document.getElementById('constraint-date').value;
        if (!newConstraint.date) { alert("Lütfen bir tarih seçin!"); return; }
        // YYYY-MM-DD -> MM-DD formatına çevir (logic.js böyle bekliyor)
        const parts = newConstraint.date.split('-');
        newConstraint.date = `${parts[1]}-${parts[2]}`;
    }

    if (!DB.constraints[staffName]) DB.constraints[staffName] = [];
    DB.constraints[staffName].push(newConstraint);

    saveToLocalStorage();
    renderConstraintsList(staffName);
    alert("✓ Kısıt başarıyla eklendi.");
}

window.deleteConstraint = function(staffName, index) {
    if (confirm("Bu kısıtlamayı silmek istediğinize emin misiniz?")) {
        DB.constraints[staffName].splice(index, 1);
        saveToLocalStorage();
        renderConstraintsList(staffName);
    }
}

window.showExamDetail = function(examName, date, time, location) {
    const modal = document.getElementById('modal-exam-detail');
    const title = document.getElementById('exam-detail-title');
    const infoGrid = document.getElementById('exam-detail-info');
    const tbody = document.querySelector('#table-exam-proctors tbody');

    // Bu sinavla ilgili tum gozetmenleri bul
    const relatedExams = DB.exams.filter(e =>
        e.name === examName && e.date === date && e.time === time
    );

    title.textContent = examName;

    const formatDate = date.split('-').reverse().join('.');
    const duration = relatedExams.length > 0 ? relatedExams[0].duration : '-';
    const loc = location || (relatedExams.length > 0 ? relatedExams[0].location : '-');

    infoGrid.innerHTML = `
        <div style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); border-radius: 12px; padding: 1rem; text-align:center;">
            <div style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Tarih</div>
            <div style="font-weight:700; font-size:1.1rem;">${formatDate}</div>
        </div>
        <div style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); border-radius: 12px; padding: 1rem; text-align:center;">
            <div style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Saat / Süre</div>
            <div style="font-weight:700; font-size:1.1rem;">${time} &bull; ${duration} dk</div>
        </div>
        <div style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.3); border-radius: 12px; padding: 1rem; text-align:center;">
            <div style="color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">Derslik</div>
            <div style="font-weight:700; font-size:1.1rem;">${loc || '-'}</div>
        </div>
    `;

    tbody.innerHTML = '';
    if (relatedExams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1.5rem;">Gözetmen atanmamış.</td></tr>';
    } else {
        relatedExams.forEach((ex, idx) => {
            const staff = DB.staff.find(s => s.id === ex.proctorId);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><span class="clickable-name" onclick="showStaffSchedule('${ex.proctorName}')">${ex.proctorName}</span></td>
                <td>${staff ? staff.totalScore.toFixed(1) : '-'}</td>
                <td>${staff ? staff.taskCount : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    modal.classList.remove('hidden');
};

function renderExams() {
    const tbody = document.querySelector('#table-exams tbody');
    tbody.innerHTML = '';

    // Sıralama oklarını güncelle
    document.querySelectorAll('.sortable').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (icon) {
            if (th.getAttribute('data-sort') === currentSort.key) {
                icon.textContent = currentSort.dir === 'asc' ? ' ▲' : ' ▼';
            } else {
                icon.textContent = '';
            }
        }
    });

    // DB'den sınavları kopya alıp sırala
    const sortedExams = [...DB.exams].sort((a, b) => {
        let valA = a[currentSort.key];
        let valB = b[currentSort.key];

        if (typeof valA === 'string' && typeof valB === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return currentSort.dir === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    const conflicts = getConflicts();
    const locConflicts = getLocationConflicts();

    sortedExams.forEach(ex => {
        const tr = document.createElement('tr');
        if (conflicts.has(ex.id)) {
            tr.classList.add('conflict-row');
        }
        
        const isLocConflict = locConflicts.has(ex.id);

        const dateObj = new Date(ex.date.replace(/-/g, "/"));
        const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
        const dayName = dayNames[dateObj.getDay()];
        const displayDate = ex.date.split("-").reverse().join(".") + " " + dayName;

        tr.innerHTML = `
            <td>
                <span class="clickable-name" onclick="showExamDetail('${ex.name}', '${ex.date}', '${ex.time}', '${ex.location || ''}')"><strong>${ex.name}</strong></span>
                ${conflicts.has(ex.id) ? '<span class="conflict-warning">⚠️ Zaman Çakışması!</span>' : ''}
            </td>
            <td class="${isLocConflict ? 'location-conflict' : ''}">
                ${ex.location || '-'}
                ${isLocConflict ? '<span class="location-warning">⚠️ Derslik Dolu!</span>' : ''}
            </td>
            <td>${displayDate}</td>
            <td>${ex.time}</td>
            <td>${ex.duration}</td>
            <td>x${ex.katsayi.toFixed(1)}</td>
            <td>${ex.score.toFixed(1)}</td>
            <td><span class="clickable-name" onclick="showStaffSchedule('${ex.proctorName}')">${ex.proctorName}</span></td>
            <td>
                <button class="btn-secondary admin-only" onclick="showEditExamModal(${ex.id})" style="padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8rem; margin-right: 0.5rem; border-color: var(--primary); color: var(--primary);">Düzenle</button>
                <button class="btn-delete admin-only" onclick="deleteExam(${ex.id})">Sil</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSchedule() {
    const tbody = document.querySelector('#table-schedule tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const groups = {};
    DB.exams.forEach(ex => {
        const key = `${ex.name}_${ex.date}_${ex.time}_${ex.location}`;
        if (!groups[key]) {
            groups[key] = {
                id: ex.id, // ilk sınavın IDsini referans alıyoruz
                name: ex.name,
                date: ex.date,
                time: ex.time,
                duration: ex.duration,
                location: ex.location || "-",
                proctors: []
            };
        }
        groups[key].proctors.push(ex.proctorName);
    });

    const scheduleList = Object.values(groups);
    const conflicts = getConflicts();
    const locConflicts = getLocationConflicts();

    function getYear(name) {
        const match = name.match(/\b(1|2|3|4)\d{2}\b/);
        if (match) return parseInt(match[1]);
        if (name.includes("101") || name.includes("102") || name.includes("106") || name.includes("112") || name.includes("114")) return 1;
        return 0;
    }

    scheduleList.sort((a, b) => {
        const ya = getYear(a.name);
        const yb = getYear(b.name);
        if (ya !== yb) return ya - yb;
        return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
    });

    let currentYear = -1;

    scheduleList.forEach(ex => {
        const y = getYear(ex.name);
        
        if (y > 0 && y !== currentYear) {
            currentYear = y;
            const trHead = document.createElement('tr');
            trHead.className = 'year-header';
            trHead.innerHTML = `<td colspan="5">${y}. YIL</td>`;
            tbody.appendChild(trHead);
        }

        const tr = document.createElement('tr');
        if (y > 0) tr.classList.add(`row-year-${y}`);
        
        // Bu gruptaki herhangi bir sınav çakışıyor mu?
        const isConflict = DB.exams.some(e => 
            e.name === ex.name && e.date === ex.date && e.time === ex.time && conflicts.has(e.id)
        );
        if (isConflict) tr.classList.add('conflict-row');

        const isLocConflict = DB.exams.some(e => 
            e.name === ex.name && e.date === ex.date && e.time === ex.time && locConflicts.has(e.id)
        );

        const dateObj = new Date(ex.date.replace(/-/g, "/"));
        const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
        const dayName = dayNames[dateObj.getDay()];
        const formatString = ex.date.split("-").reverse().join(".") + " " + dayName; 

        tr.innerHTML = `
            <td>
                <span class="clickable-name" onclick="showExamDetail('${ex.name}', '${ex.date}', '${ex.time}', '${ex.location}')"><strong>${ex.name}</strong></span>
                ${isConflict ? '<span class="conflict-warning">⚠️ Gözetmen Çakışması!</span>' : ''}
            </td>
            <td class="${isLocConflict ? 'location-conflict' : ''}">
                ${ex.location}
                ${isLocConflict ? '<span class="location-warning">⚠️ Derslik Çakışması!</span>' : ''}
            </td>
            <td>${formatString}</td>
            <td>${ex.time}</td>
            <td>${ex.duration} dk</td>
            <td class="proctor-list">${ex.proctors.join(', ')}</td>
            <td>
                 <button class="btn-secondary admin-only" onclick="showEditScheduleModal('${ex.name}', '${ex.date}', '${ex.time}', '${ex.location}')" style="padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.8rem; border-color: var(--primary); color: var(--primary);">Program/Yer Düzenle</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showAddExamModal() {
    const modal = document.getElementById('modal');
    const fields = document.getElementById('form-fields');
    document.getElementById('modal-title').textContent = "Yeni Sınav Ekle";
    
    // Eski seçimleri temizle
    window.selectedProctorId = null;
    
    fields.innerHTML = `
        <div class="form-group">
            <label>Sınav Tarihi</label>
            <input type="date" id="exam-date" required>
        </div>
        <div class="form-group">
            <label>Başlangıç Saati</label>
            <input type="time" id="exam-time" required>
        </div>
        <div class="form-group">
            <label>Süre (Dakika)</label>
            <input type="number" id="exam-duration" value="60" required>
        </div>
        <div class="form-group">
            <label>Ders Adı</label>
            <input type="text" id="exam-name" placeholder="Örn: Matematik-I" required>
        </div>
        <div class="form-group">
            <label>Derslik / Mevcut</label>
            <input type="text" id="exam-location" placeholder="Örn: Amfi 2">
        </div>
        <div id="add-suggestions" class="suggestion-area hidden">
            <h4>🤖 Akıllı Öneriler</h4>
            <div id="add-suggestion-list" class="suggestion-list"></div>
        </div>
    `;
    modal.classList.remove('hidden');

    const updateAddSuggestions = () => {
        const d = document.getElementById('exam-date').value;
        const t = document.getElementById('exam-time').value;
        const dur = parseInt(document.getElementById('exam-duration').value) || 60;
        updateSuggestionsUI(d, t, dur, 'add-suggestions', 'add-suggestion-list', null);
    };

    document.getElementById('exam-date').addEventListener('change', updateAddSuggestions);
    document.getElementById('exam-time').addEventListener('change', updateAddSuggestions);
    document.getElementById('exam-duration').addEventListener('input', updateAddSuggestions);

    document.getElementById('modal-form').onsubmit = (e) => {
        e.preventDefault();
        const data = {
            date: document.getElementById('exam-date').value,
            time: document.getElementById('exam-time').value,
            duration: parseInt(document.getElementById('exam-duration').value),
            name: document.getElementById('exam-name').value,
            location: document.getElementById('exam-location').value,
            proctorId: window.selectedProctorId // Kullanıcının seçtiği ID'yi ekle
        };
        addExam(data);
        
        // Atama sonrası seçimi tekrar temizle
        window.selectedProctorId = null;
        
        hideModal();
        renderExams();
        renderSchedule();
        renderDashboard();
    };
}

function hideModal() {
    document.getElementById('modal').classList.add('hidden');
}

window.deleteExam = (id) => {
    const exIndex = DB.exams.findIndex(e => e.id === id);
    if (exIndex > -1) {
        const ex = DB.exams[exIndex];
        const staff = DB.staff.find(s => s.id === ex.proctorId);
        if (staff) {
            staff.totalScore -= ex.score;
            staff.taskCount -= 1;
        }
        DB.exams.splice(exIndex, 1);
        saveToLocalStorage();
        renderExams();
        renderSchedule();
        renderDashboard(); // Update dashboard scores
    }
};

window.showEditExamModal = (id) => {
    const ex = DB.exams.find(e => e.id === id);
    if (!ex) return;

    document.getElementById('edit-exam-id').value = ex.id;
    document.getElementById('edit-exam-name').value = ex.name;
    document.getElementById('edit-exam-location').value = ex.location || '';
    document.getElementById('edit-exam-date').value = ex.date;
    document.getElementById('edit-exam-time').value = ex.time;
    document.getElementById('edit-exam-duration').value = ex.duration;

    const proctorSelect = document.getElementById('edit-exam-proctor');
    proctorSelect.innerHTML = DB.staff.map(s => 
        `<option value="${s.id}" ${s.id === ex.proctorId ? 'selected' : ''}>${s.name}</option>`
    ).join('');

    const updateEditSuggestions = () => {
        const d = document.getElementById('edit-exam-date').value;
        const t = document.getElementById('edit-exam-time').value;
        const dur = parseInt(document.getElementById('edit-exam-duration').value) || 60;
        updateSuggestionsUI(d, t, dur, 'edit-suggestions', 'edit-suggestion-list', ex.id, 'edit-exam-proctor');
    };

    // İlk açılışta ve değişimlerde önerileri güncelle
    updateEditSuggestions();

    document.getElementById('edit-exam-date').addEventListener('change', updateEditSuggestions);
    document.getElementById('edit-exam-time').addEventListener('change', updateEditSuggestions);
    document.getElementById('edit-exam-duration').addEventListener('input', updateEditSuggestions);

    document.getElementById('edit-modal').classList.remove('hidden');
};

document.getElementById('edit-modal-form').onsubmit = (e) => {
    e.preventDefault();
    const id = parseFloat(document.getElementById('edit-exam-id').value);
    const data = {
        name: document.getElementById('edit-exam-name').value,
        location: document.getElementById('edit-exam-location').value,
        date: document.getElementById('edit-exam-date').value,
        time: document.getElementById('edit-exam-time').value,
        duration: parseInt(document.getElementById('edit-exam-duration').value),
        proctorId: parseInt(document.getElementById('edit-exam-proctor').value)
    };
    
    // Müsaitlik kontrolü
    const targetProctor = DB.staff.find(s => s.id === data.proctorId);
    if (targetProctor && !isAvailable(targetProctor.name, data.date, data.time, data.duration)) {
        alert(`${targetProctor.name} bu tarihte ve saatte müsait değil! Lütfen başka birini seçin veya saati değiştirin.`);
        return; // İşlemi durdur
    }

    updateExam(id, data);
    document.getElementById('edit-modal').classList.add('hidden');
    renderExams();
    renderSchedule();
    renderDashboard();
};

window.showEditScheduleModal = (name, date, time, location) => {
    // Sınav Programı listesindeki öğeyi düzenlerken aynı saate/isime sahip TÜM sınavları bul
    const groupExams = DB.exams.filter(e => e.name === name && e.date === date && e.time === time);
    if(groupExams.length === 0) return;

    // Herhangi birini baz alarak form verilerini doldur
    const baseEx = groupExams[0];
    
    // Düzenleme alanını normal edit modal üzerinden yürütelim ancak proctor seçimi olmadan, genel değişiklik.
    const modal = document.getElementById('modal');
    const fields = document.getElementById('form-fields');
    document.getElementById('modal-title').textContent = "Program/Yer Düzenle (" + baseEx.name + ")";
    
    fields.innerHTML = `
        <div class="form-group">
            <label>Ders Adı</label>
            <input type="text" id="sch-exam-name" value="${baseEx.name}" required>
        </div>
        <div class="form-group">
            <label>Derslik / Yer</label>
            <input type="text" id="sch-exam-location" value="${baseEx.location || ''}">
        </div>
        <div class="form-group">
            <label>Tarih</label>
            <input type="date" id="sch-exam-date" value="${baseEx.date}" required>
        </div>
        <div class="form-group">
            <label>Saat</label>
            <input type="time" id="sch-exam-time" value="${baseEx.time}" required>
        </div>
    `;
    modal.classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = (e) => {
        e.preventDefault();
        
        const newName = document.getElementById('sch-exam-name').value;
        const newLocation = document.getElementById('sch-exam-location').value;
        const newDate = document.getElementById('sch-exam-date').value;
        const newTime = document.getElementById('sch-exam-time').value;

        // O gruba ait tüm kayıtları güncelle
        groupExams.forEach(ex => {
            const exIndex = DB.exams.findIndex(e => e.id === ex.id);
            if(exIndex > -1){
                DB.exams[exIndex].name = newName;
                DB.exams[exIndex].location = newLocation;
                DB.exams[exIndex].date = newDate;
                DB.exams[exIndex].time = newTime;
                
                // puan katsayısını tarihe/saate göre tekrar güncelle
                DB.exams[exIndex].katsayi = getKatsayi(new Date(`${newDate}T${newTime}`));
                // (Gözetmen vs silmiyoruz, sadece bilgileri güncelliyoruz)
            }
        });

        saveToLocalStorage();
        hideModal();
        renderExams();
        renderSchedule();
        renderDashboard();
    };
};

function renderStaff() {
    const tbody = document.querySelector('#table-staff tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    DB.staff.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="clickable-name" onclick="showStaffSchedule('${s.name}')">${s.name}</span></td>
            <td>${s.totalScore.toFixed(1)}</td>
            <td>${s.taskCount}</td>
            <td class="admin-only"><button class="btn-delete" onclick="deleteStaff(${s.id})">Sil</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function showAddStaffModal() {
    const modal = document.getElementById('modal');
    const fields = document.getElementById('form-fields');
    document.getElementById('modal-title').textContent = "Yeni Personel Ekle";
    
    fields.innerHTML = `
        <div class="form-group">
            <label>Personel Adı Soyadı</label>
            <input type="text" id="staff-name" placeholder="Örn: Dr. Can Berk" required>
        </div>
    `;
    modal.classList.remove('hidden');

    document.getElementById('modal-form').onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('staff-name').value;
        const newStaff = {
            id: Date.now(),
            name: name,
            totalScore: 0,
            taskCount: 0
        };
        DB.staff.push(newStaff);
        saveToLocalStorage();
        hideModal();
        renderStaff();
    };
}

window.deleteStaff = (id) => {
    if (confirm('Bu personeli silmek istediğinize emin misiniz?')) {
        DB.staff = DB.staff.filter(s => s.id !== id);
        saveToLocalStorage();
        renderStaff();
    }
};

window.showStaffSchedule = (staffName) => {
    const modal = document.getElementById('modal-staff-schedule');
    const title = document.getElementById('staff-name-title');
    const nameHeader = document.getElementById('individual-proctor-name');
    const tbody = document.querySelector('#table-individual-schedule tbody');
    
    title.textContent = `${staffName} - Bireysel Program`;
    nameHeader.textContent = staffName;
    tbody.innerHTML = '';
    
    // Filtrele ve tarihe göre sırala
    const individualExams = DB.exams
        .filter(ex => ex.proctorName === staffName)
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        
    individualExams.forEach(ex => {
        const tr = document.createElement('tr');
        const dateStr = ex.date.split("-").reverse().join(".");
        tr.innerHTML = `
            <td><strong>${ex.name}</strong></td>
            <td>${ex.location || '-'}</td>
            <td>${dateStr}</td>
            <td>${ex.time}</td>
            <td>${ex.duration} dk</td>
        `;
        tbody.appendChild(tr);
    });
    
    modal.classList.remove('hidden');
};

function hideIndividualModal() {
    document.getElementById('modal-staff-schedule').classList.add('hidden');
}

/**
 * UI Öneri Listesini Güncelle
 */
function updateSuggestionsUI(date, time, duration, areaId, listId, currentExamId, selectId = null) {
    const area = document.getElementById(areaId);
    const list = document.getElementById(listId);
    if (!area || !list) return;

    if (!date || !time) {
        area.classList.add('hidden');
        return;
    }

    const recs = getRecommendedProctors(date, time, duration, currentExamId);
    
    if (recs.length === 0) {
        area.classList.add('hidden');
        return;
    }

    area.classList.remove('hidden');
    list.innerHTML = recs.map(s => `
        <div class="suggestion-item" onclick="selectSuggestedProctor('${areaId}', '${selectId}', ${s.id})">
            <strong>${s.name}</strong>
            <span class="staff-score">${s.totalScore.toFixed(1)} Puan</span>
        </div>
    `).join('');
}

window.selectSuggestedProctor = (areaId, selectId, staffId) => {
    // Eğer düzenleme modalındaysak selectId bellidir, ekleme modalındaysak select yoktur (Çünkü henüz eklenmedi)
    // Ekleme modalında proctor seçimi için logic.js içindeki atama mantığını kullanıyoruz, 
    // ancak kullanıcı deneyimi için ekleme modalında da bir select olsaydı iyi olurdu.
    // Şimdilik ekleme modalında öneriye tıklayınca hoca adını saklayıp form submit'te kullanabiliriz veya ekleme modalına da select ekleyebiliriz.
    
    if (selectId && selectId !== 'null') {
        const select = document.getElementById(selectId);
        if (select) {
            select.value = staffId;
            // Görsel geribildirim için alanı gizle
            document.getElementById(areaId).classList.add('hidden');
        }
    } else {
        // Ekleme modalında "proctor" seçimi yok, algoritmaya bırakılıyor. 
        // Ancak kullanıcı "Ben bunu istiyorum" diyorsa, bir hoca ismi seçtirip Manuel atama gibi davranabiliriz.
        // Basitlik adına ekleme modalında öneriye tıklayınca otomatik atama yapacak bir gizli alan ekleyelim.
        window.selectedProctorId = staffId;
        alert(`${DB.staff.find(s=>s.id === staffId).name} seçildi. Kaydet'e bastığınızda bu hoca atanacaktır.`);
        document.getElementById(areaId).classList.add('hidden');
    }
};

function renderAvailability() {
    const dateInput = document.getElementById('availability-date');
    const grid = document.getElementById('availability-grid');
    if (!grid) return;

    const selectedDate = dateInput ? dateInput.value : '';

    if (!selectedDate) {
        grid.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Bir tarih seçin...</p>';
        return;
    }

    // Seçilen günde sınav saatlerini topla (benzersiz saatler)
    const dayExams = DB.exams.filter(e => e.date === selectedDate);
    const timeSlots = [...new Set(dayExams.map(e => e.time))].sort();

    if (timeSlots.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); text-align: center;">Bu tarihte kayıtlı sınav bulunmuyor.</p>';
        return;
    }

    // Tarih için gün numarası (kısıt kontrolü)
    const dateObj = new Date(`${selectedDate}T08:00`);
    const dayOfWeek = dateObj.getDay(); // 0=Paz, 6=Cts

    // Tablo oluştur
    let html = '<div style="overflow-x:auto"><table class="avail-table"><thead><tr>';
    html += '<th class="staff-col">Gözetmen</th>';
    timeSlots.forEach(t => {
        // Bitiş saatini de hesapla
        const relatedExams = dayExams.filter(e => e.time === t);
        const dur = relatedExams.length > 0 ? relatedExams[0].duration : 60;
        const [hh, mm] = t.split(':').map(Number);
        const endMin = hh * 60 + mm + dur;
        const endTime = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
        html += `<th>${t}<br><span style="font-weight:300">${endTime}</span></th>`;
    });
    html += '</tr></thead><tbody>';

    DB.staff.forEach(s => {
        html += `<tr><td class="staff-col"><span class="clickable-name" onclick="showStaffSchedule('${s.name}')">${s.name}</span></td>`;

        timeSlots.forEach(t => {
            // Bu saatte bu personelin sınavı var mı?
            const busyExam = dayExams.find(e => e.time === t && e.proctorId === s.id);

            if (busyExam) {
                html += `<td class="avail-cell-busy" title="${busyExam.name}">📋 ${busyExam.name}</td>`;
            } else {
                // Kısıt kontrolü
                const isRestricted = !isAvailable(s.name, selectedDate, t, 60);
                if (isRestricted) {
                    html += '<td class="avail-cell-restricted" title="Kısıtlı">⚠️</td>';
                } else {
                    html += '<td class="avail-cell-free">✓</td>';
                }
            }
        });

        html += '</tr>';
    });

    html += '</tbody></table></div>';
    grid.innerHTML = html;
}

function updateScoreChart() {
    const ctx = document.getElementById('scoreChart');
    if (!ctx) return;

    const labels = DB.staff.map(s => s.name);
    const data = DB.staff.map(s => s.totalScore);

    if (scoreChartInstance) {
        scoreChartInstance.destroy();
    }

    scoreChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Toplam Puan',
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.5)',
                borderColor: '#6366f1',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function showGitHubSyncModal() {
    const modal = document.getElementById('modal-github-sync');
    const textarea = document.getElementById('github-sync-code');
    
    // DB objesini logic.js formatında metne dönüştür
    const dbCode = `let DB = ${JSON.stringify(DB, null, 4)};`;
    
    textarea.value = dbCode;
    modal.classList.remove('hidden');
}

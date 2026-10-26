
    // Boş başlangıç durumu (veriler sunucuda data/ klasöründe tutulur)
    const emptyData = { books: [], members: [], loans: [], settings: {} };
    let appState = JSON.parse(JSON.stringify(emptyData));
    const J = { method: 'POST', headers: { 'Content-Type': 'application/json' } };

    function normalize() {
      const t = new Date().toISOString().slice(0, 10);
      appState.books = appState.books.map(b => {
        let cat = String(b.category || 'Genel');
        if (cat.includes('Arborist') || cat.includes('Merchandising') || cat.startsWith('series:') || cat.startsWith('person:') || cat.startsWith('place:') || cat.startsWith('subject:')) {
          cat = 'Genel';
        }
        return { title: '', author: '', category: cat, isbn: '', totalStock: 1, currentStock: 1, color: '#0070f3', year: '', pages: 0, publisher: '', ...b, category: cat, pages: parseInt(b.pages) || 0, isbn: String(b.isbn ?? b.code ?? '') };
      });
      appState.members = appState.members.map(m => ({ name: '', email: '', phone: '', role: 'Genel Okuyucu', activeLoans: 0, avatar: '', ...m }));
      appState.loans.forEach(l => { if (l.status === 'ACTIVE' && l.dueDate < t) l.status = 'OVERDUE'; });
    }

    // View Settings
    let bookViewMode = 'grid'; // 'grid' | 'table'
    let activeLoanFilter = 'ALL';

    // Save State (sunucuya yazar)
    function saveState() {
      updateMetrics();
      fillCats();
      refreshCharts();
      fetch('api.php?a=save', { ...J, body: JSON.stringify({ u: appState.members, b: appState.books, l: appState.loans, s: appState.settings, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' }) })
        .then(x => { if (x.status === 401) showLogin(); else if (!x.ok) throw 0; })
        .catch(() => showToast('Kayıt başarısız! Bağlantıyı kontrol edin.', 'error'));
    }

    // Tab Navigation Switcher
    function switchTab(tabId) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('nav-item-active'));

      const targetSection = document.getElementById(`section-${tabId}`);
      const targetNav = document.getElementById(`nav-${tabId}`);

      if (targetSection) targetSection.classList.remove('hidden');
      if (targetNav) targetNav.classList.add('nav-item-active');

      // Close mobile sidebar on select
      closeSidebar();

      // Refresh Chart canvases if tab changed
      if (tabId === 'analytics') { renderAnalyticsCharts(); refreshCharts(); }
    }

    let loanTrendChart, categoryPieChart, analyticsCategoryChart, analyticsReturnRateChart;

    function initCharts() {
      // 1. Dashboard Loan Trend Chart
      const ctxTrend = document.getElementById('loanTrendChart')?.getContext('2d');
      if (ctxTrend) {
        loanTrendChart = new Chart(ctxTrend, {
          type: 'line',
          data: {
            labels: ['Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim'],
            datasets: [{
              label: 'Aylık Ödünç Verilen',
              data: [42, 58, 65, 80, 94, 112],
              borderColor: '#0070f3',
              backgroundColor: 'rgba(0, 112, 243, 0.08)',
              fill: true,
              tension: 0.4,
              borderWidth: 3,
              pointBackgroundColor: '#0070f3',
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: 'rgba(156, 163, 175, 0.1)' } },
              x: { grid: { display: false } }
            }
          }
        });
      }

      // 2. Dashboard Category Pie
      const ctxPie = document.getElementById('categoryPieChart')?.getContext('2d');
      if (ctxPie) {
        categoryPieChart = new Chart(ctxPie, {
          type: 'doughnut',
          data: {
            labels: ['Roman', 'Tarih', 'Yazılım', 'Bilim', 'Klasik'],
            datasets: [{
              data: [35, 25, 15, 15, 10],
              backgroundColor: ['#0070f3', '#ea580c', '#10b981', '#06b6d4', '#ef4444'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { font: { size: 11 } } }
            },
            cutout: '70%'
          }
        });
      }
    }

    function renderAnalyticsCharts() {
      // Detailed Analytics Page Charts
      const ctxCat = document.getElementById('analyticsCategoryChart')?.getContext('2d');
      if (ctxCat && !analyticsCategoryChart) {
        analyticsCategoryChart = new Chart(ctxCat, {
          type: 'bar',
          data: {
            labels: ['Roman', 'Tarih', 'Yazılım', 'Bilim', 'Klasik', 'Felsefe'],
            datasets: [{
              label: 'Okunma Sayısı',
              data: [180, 120, 95, 70, 60, 45],
              backgroundColor: '#369eff',
              borderRadius: 8
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
          }
        });
      }

      const ctxReturn = document.getElementById('analyticsReturnRateChart')?.getContext('2d');
      if (ctxReturn && !analyticsReturnRateChart) {
        analyticsReturnRateChart = new Chart(ctxReturn, {
          type: 'doughnut',
          data: {
            labels: ['Zamanında İade (%82)', 'Geciken İade (%18)'],
            datasets: [{
              data: [82, 18],
              backgroundColor: ['#10b981', '#f43f5e'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%'
          }
        });
      }
    }

    function refreshCharts() {
      const L = appState.loans, Bk = appState.books;
      const mn = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
      const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const ms = [5,4,3,2,1,0].map(n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d; });
      const pal = ['#0070f3','#ea580c','#10b981','#06b6d4','#ef4444','#a855f7','#eab308','#64748b'];
      const cats = [...new Set(Bk.map(b => b.category))];
      const catOf = id => (Bk.find(b => b.id === id) || {}).category;
      const upd = (c, labels, data, colors) => { if (!c) return; c.data.labels = labels; c.data.datasets[0].data = data; if (colors) c.data.datasets[0].backgroundColor = colors; c.update(); };
      upd(loanTrendChart, ms.map(d => mn[d.getMonth()]), ms.map(d => L.filter(l => (l.issueDate || '').slice(0, 7) === key(d)).length));
      upd(categoryPieChart, cats, cats.map(c => Bk.filter(b => b.category === c).length), cats.map((c, i) => pal[i % pal.length]));
      upd(analyticsCategoryChart, cats, cats.map(c => L.filter(l => catOf(l.bookId) === c).length));
      const ret = L.filter(l => l.returnDate), ok = ret.filter(l => l.returnDate <= l.dueDate).length, late = ret.length - ok;
      const pc = n => ret.length ? Math.round(n * 100 / ret.length) : 0;
      upd(analyticsReturnRateChart, ['Zamanında İade (%' + pc(ok) + ')', 'Geciken İade (%' + pc(late) + ')'], [ok, late]);
    }

    // Book Catalog Render Logic
    function renderBooks() {
      const grid = document.getElementById('booksGridContainer');
      const tableBody = document.getElementById('booksTableBody');
      const search = document.getElementById('bookSearchInput').value.toLowerCase();
      const cat = document.getElementById('bookCategoryFilter').value;
      const status = document.getElementById('bookStatusFilter').value;

      const filtered = appState.books.filter(b => {
        const matchesSearch = b.title.toLowerCase().includes(search) || b.author.toLowerCase().includes(search) || b.isbn.includes(search);
        const matchesCat = cat === 'ALL' || b.category === cat;
        const matchesStatus = status === 'ALL' || (status === 'AVAILABLE' && b.currentStock > 0) || (status === 'OUT_OF_STOCK' && b.currentStock === 0);
        return matchesSearch && matchesCat && matchesStatus;
      });

      // Render Cards Grid
      grid.innerHTML = filtered.map(b => `
        <div class="glass-card rounded-2xl overflow-hidden shadow-soft hover:-translate-y-1 transition duration-300 flex flex-col justify-between group">
          <div>
            <!-- Book Cover Hero Header -->
            <div class="h-32 p-4 flex flex-col justify-between relative overflow-hidden" style="background: linear-gradient(135deg, ${b.color}22 0%, ${b.color}88 100%);">
              <div class="flex items-center justify-between z-10">
                <span class="px-2.5 py-1 text-[10px] font-bold uppercase rounded-lg bg-white/80 dark:bg-dark-card/80 text-slate-800 dark:text-white backdrop-blur-sm shadow-sm">
                  ${b.category}
                </span>
                <span class="text-xs font-semibold px-2.5 py-1 rounded-full ${b.currentStock > 0 ? 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300' : 'bg-rose-500/20 text-rose-800 dark:text-rose-300'} backdrop-blur-sm">
                  ${b.currentStock > 0 ? `${b.currentStock}/${b.totalStock} Stok` : 'Tümü Ödünçte'}
                </span>
              </div>
              <div class="z-10">
                <p class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">ISBN: ${b.isbn}</p>
              </div>
              <i class="fa-solid fa-book-open absolute -right-3 -bottom-3 text-7xl opacity-10 text-slate-900 group-hover:scale-110 transition duration-300"></i>
            </div>

            <!-- Content -->
            <div class="p-5">
              <h3 class="font-bold text-slate-900 dark:text-white text-base leading-snug line-clamp-1" title="${b.title}">${b.title}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">${b.author}${b.publisher ? ' · ' + b.publisher : ''}</p>
              <div class="flex items-center gap-3 text-[11px] text-slate-400 mt-1.5 font-medium">
                <span><i class="fa-solid fa-file-lines text-emerald-500 mr-1"></i>${b.pages ? b.pages + ' sayfa' : 'Sayfa belirtilmemiş'}</span>
                ${b.year ? `<span>· Yıl: ${b.year}</span>` : ''}
              </div>
            </div>
          </div>

          <!-- Card Actions -->
          <div class="p-4 pt-0 border-t border-slate-100 dark:border-dark-border/50 flex items-center justify-between gap-2 mt-2">
            <button onclick="quickIssueLoan(${b.id})" ${b.currentStock === 0 ? 'disabled' : ''} class="flex-1 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-brand-500 hover:text-white text-slate-700 dark:text-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 transition">
              <i class="fa-solid fa-handshake mr-1"></i> Ödünç Ver
            </button>
            <button onclick="openBarcodeModal(${b.id})" class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition" title="Raf Etiketi & Barkod Bas">
              <i class="fa-solid fa-barcode text-xs"></i>
            </button>
            <button onclick="deleteBook(${b.id})" class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition" title="Kitabı Sil">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </div>
      `).join('');

      // Render Table View
      tableBody.innerHTML = filtered.map(b => `
        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
          <td class="py-3.5 px-6 font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div class="w-3 h-3 rounded-full shrink-0" style="background-color: ${b.color}"></div>
            <span>${b.title}</span>
          </td>
          <td class="py-3.5 px-6 text-slate-600 dark:text-slate-300">
            <div class="font-medium">${b.author}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">${b.publisher ? b.publisher : ''}${b.publisher && b.pages ? ' · ' : ''}${b.pages ? b.pages + ' sf.' : ''}</div>
          </td>
          <td class="py-3.5 px-6">
            <span class="px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              ${b.category}
            </span>
          </td>
          <td class="py-3.5 px-6 font-mono text-xs text-slate-500">${b.isbn}</td>
          <td class="py-3.5 px-6">
            <span class="px-2.5 py-1 text-xs font-semibold rounded-full ${b.currentStock > 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600'}">
              ${b.currentStock > 0 ? `${b.currentStock} / ${b.totalStock} Adet Mevcut` : 'Tümü Ödünçte'}
            </span>
          </td>
          <td class="py-3.5 px-6 text-right">
            <button onclick="quickIssueLoan(${b.id})" ${b.currentStock === 0 ? 'disabled' : ''} class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition mr-2">
              Ödünç Ver
            </button>
            <button onclick="openBarcodeModal(${b.id})" class="text-slate-400 hover:text-indigo-500 transition mr-2" title="Raf Etiketi & Barkod Bas">
              <i class="fa-solid fa-barcode"></i>
            </button>
            <button onclick="deleteBook(${b.id})" class="text-slate-400 hover:text-rose-500 transition" title="Sil">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }

    function setBookViewMode(mode) {
      bookViewMode = mode;
      const gridBtn = document.getElementById('viewModeGrid');
      const tableBtn = document.getElementById('viewModeTable');
      const gridContainer = document.getElementById('booksGridContainer');
      const tableContainer = document.getElementById('booksTableContainer');

      if (mode === 'grid') {
        gridContainer.classList.remove('hidden');
        tableContainer.classList.add('hidden');
        gridBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-dark-card text-brand-500 shadow-sm";
        tableBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white";
      } else {
        gridContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');
        tableBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-dark-card text-brand-500 shadow-sm";
        gridBtn.className = "px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white";
      }
    }

    function filterBooks() {
      renderBooks();
    }

    // Loans Tracking Logic
    function renderLoansTable() {
      const tbody = document.getElementById('loansTableBody');
      const search = document.getElementById('loanSearchInput')?.value.toLowerCase() || '';

      const filtered = appState.loans.filter(l => {
        const book = appState.books.find(b => b.id === l.bookId);
        const member = appState.members.find(m => m.id === l.memberId);
        
        const matchesStatus = activeLoanFilter === 'ALL' || l.status === activeLoanFilter;
        const matchesSearch = (book && book.title.toLowerCase().includes(search)) || (member && member.name.toLowerCase().includes(search));
        
        return matchesStatus && matchesSearch;
      });

      tbody.innerHTML = filtered.map(l => {
        const book = appState.books.find(b => b.id === l.bookId) || { title: 'Bilinmeyen Kitap' };
        const member = appState.members.find(m => m.id === l.memberId) || { name: 'Bilinmeyen Üye' };

        let statusBadge = '';
        if (l.status === 'ACTIVE') {
          statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">Aktif Devam Ediyor</span>`;
        } else if (l.status === 'OVERDUE') {
          statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 animate-pulse-subtle">⚠️ Gecikmede</span>`;
        } else {
          statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Tamamlandı (İade)</span>`;
        }

        return `
          <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
            <td class="py-3.5 px-6 font-mono text-xs text-slate-400 font-semibold">${l.id}</td>
            <td class="py-3.5 px-6 font-bold text-slate-900 dark:text-white">${book.title}</td>
            <td class="py-3.5 px-6 text-slate-600 dark:text-slate-300 font-medium">${member.name}</td>
            <td class="py-3.5 px-6 text-slate-500 text-xs">${l.issueDate}</td>
            <td class="py-3.5 px-6 font-semibold text-xs ${l.status === 'OVERDUE' ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}">${l.dueDate}</td>
            <td class="py-3.5 px-6">${statusBadge}</td>
            <td class="py-3.5 px-6 text-right">
              ${l.status !== 'RETURNED' ? `
                <button onclick="returnBookLoan('${l.id}')" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition mr-2">
                  <i class="fa-solid fa-rotate-left mr-1"></i> İade Al
                </button>
                <button onclick="extendLoanDate('${l.id}')" class="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 transition" title="7 Gün Süre Uzat">
                  +7 Gün
                </button>
              ` : `<span class="text-xs text-slate-400 italic">İade Edildi: ${l.returnDate}</span>`}
            </td>
          </tr>
        `;
      }).join('');

      renderDashboardRecentLoans();
    }

    function renderDashboardRecentLoans() {
      const tbody = document.getElementById('dashboardRecentLoansTable');
      if (!tbody) return;

      const recent = appState.loans.slice(0, 5);
      tbody.innerHTML = recent.map(l => {
        const book = appState.books.find(b => b.id === l.bookId) || { title: 'Kitap' };
        const member = appState.members.find(m => m.id === l.memberId) || { name: 'Üye' };

        return `
          <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
            <td class="py-3.5 px-6 font-bold text-slate-900 dark:text-white">${book.title}</td>
            <td class="py-3.5 px-6 text-slate-600 dark:text-slate-300 font-medium">${member.name}</td>
            <td class="py-3.5 px-6 text-slate-500 text-xs">${l.issueDate}</td>
            <td class="py-3.5 px-6 font-semibold text-xs ${l.status === 'OVERDUE' ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}">${l.dueDate}</td>
            <td class="py-3.5 px-6">
              <span class="px-2 py-0.5 text-[11px] font-semibold rounded-full ${l.status === 'ACTIVE' ? 'bg-brand-50 text-brand-600' : l.status === 'OVERDUE' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}">
                ${l.status === 'ACTIVE' ? 'Aktif' : l.status === 'OVERDUE' ? 'Gecikmede' : 'Teslim Alındı'}
              </span>
            </td>
            <td class="py-3.5 px-6 text-right">
              ${l.status !== 'RETURNED' ? `
                <button onclick="returnBookLoan('${l.id}')" class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition">İade Al</button>
              ` : '<span class="text-xs text-slate-400">--</span>'}
            </td>
          </tr>
        `;
      }).join('');
    }

    function filterLoans(status) {
      activeLoanFilter = status;
      document.querySelectorAll('.loan-tab-btn').forEach(btn => {
        btn.classList.remove('text-brand-500', 'border-b-2', 'border-brand-500');
        btn.classList.add('text-slate-400');
      });

      const activeBtn = document.getElementById(`loanTab-${status}`);
      if (activeBtn) {
        activeBtn.classList.add('text-brand-500', 'border-b-2', 'border-brand-500');
        activeBtn.classList.remove('text-slate-400');
      }

      renderLoansTable();
    }

    async function returnBookLoan(loanId) {
      const loan = appState.loans.find(l => l.id === loanId);
      if (!loan) return;
      try {
        const result = await api('loan_return', { id: loanId });
        if (!result.ok) { showToast(result.j.err || 'İade işlemi tamamlanamadı.', 'error'); return; }
      } catch (err) { showToast('İade işlemi sunucuya kaydedilemedi.', 'error'); return; }

      loan.status = 'RETURNED';
      loan.returnDate = new Date().toISOString().split('T')[0];

      // Restore book stock
      const book = appState.books.find(b => b.id === loan.bookId);
      if (book) book.currentStock = Math.min(book.totalStock, book.currentStock + 1);

      // Restore member limit
      const member = appState.members.find(m => m.id === loan.memberId);
      if (member) member.activeLoans = Math.max(0, member.activeLoans - 1);

      saveState();
      renderLoansTable();
      renderBooks();
      showToast('Kitap başarıyla teslim alındı ve stok güncellendi.', 'success');
    }

    function extendLoanDate(loanId) {
      const loan = appState.loans.find(l => l.id === loanId);
      if (!loan) return;

      const current = new Date(loan.dueDate);
      current.setDate(current.getDate() + 7);
      loan.dueDate = current.toISOString().split('T')[0];

      if (loan.status === 'OVERDUE') loan.status = 'ACTIVE';

      saveState();
      renderLoansTable();
      showToast('Teslim tarihi 7 gün süreyle uzatıldı.', 'info');
    }

    // Members Directory Render Logic
    function renderMembers() {
      const grid = document.getElementById('membersGrid');
      const search = document.getElementById('memberSearchInput')?.value.toLowerCase() || '';

      const filtered = appState.members.filter(m => 
        m.name.toLowerCase().includes(search) || m.email.toLowerCase().includes(search) || m.phone.includes(search)
      );

      document.getElementById('memberCountText').innerText = filtered.length;

      grid.innerHTML = filtered.map(m => {
        const returnedLoans = appState.loans.filter(l => l.memberId === m.id && l.status === 'RETURNED');
        const readPages = returnedLoans.reduce((sum, l) => {
          const b = appState.books.find(x => x.id === l.bookId);
          return sum + (b ? (parseInt(b.pages) || 0) : 0);
        }, 0);
        const readBooksCount = returnedLoans.length;

        return `
          <div class="glass-card p-5 rounded-2xl shadow-soft flex items-start gap-4 hover:-translate-y-0.5 transition duration-300">
            <img class="w-12 h-12 rounded-full object-cover ring-2 ring-brand-500/20 shrink-0" src="${m.avatar}" alt="${m.name}">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <h3 class="font-bold text-slate-900 dark:text-white text-sm truncate">${m.name}</h3>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  ${m.role}
                </span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate"><i class="fa-regular fa-envelope mr-1.5"></i>${m.email}</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5"><i class="fa-solid fa-phone mr-1.5"></i>${m.phone}</p>
              
              <div class="mt-3 pt-3 border-t border-slate-100 dark:border-dark-border flex items-center justify-between text-xs">
                <div>
                  <span class="text-slate-500 dark:text-slate-400">Okuma Başarısı:</span>
                  <p class="font-bold text-emerald-600 dark:text-emerald-400">${readPages.toLocaleString('tr-TR')} Sayfa <span class="font-normal text-[11px] text-slate-400">(${readBooksCount} kitap)</span></p>
                </div>
                <div class="text-right">
                  <span class="text-slate-500 dark:text-slate-400">Aktif Elinde:</span>
                  <p class="font-bold text-brand-500">${m.activeLoans} Kitap</p>
                </div>
              </div>

              <div class="mt-3 pt-2 flex items-center justify-between gap-2">
                <button onclick="openKarneModal(${m.id})" class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold transition">
                  <i class="fa-solid fa-graduation-cap text-amber-500"></i> Okuma Karnesi
                </button>
                <button onclick="deleteMember(${m.id})" class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-xs transition" title="Sil">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Modal Helpers
    function openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;

      if (modalId === 'modalLoanBook') populateLoanModalDropdowns();
      if (modalId === 'modalAddBook') resetAddBook();

      modal.classList.remove('hidden');
    }

    function closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.add('hidden');
    }

    function populateLoanModalDropdowns() {
      const memberSelect = document.getElementById('loanMemberSelect');
      const bookSelect = document.getElementById('loanBookSelect');

      memberSelect.innerHTML = appState.members.map(m => `
        <option value="${m.id}">${m.name} (${m.role}) - Aktif: ${m.activeLoans}/${maxLimit()}</option>
      `).join('');

      const availableBooks = appState.books.filter(b => b.currentStock > 0);
      bookSelect.innerHTML = availableBooks.map(b => `
        <option value="${b.id}">${b.title} - (Stok: ${b.currentStock})</option>
      `).join('');

      // Set default dates
      const today = new Date().toISOString().split('T')[0];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (parseInt(document.getElementById('settingLoanDays').value) || 14));

      document.getElementById('loanStartDate').value = today;
      document.getElementById('loanDueDate').value = dueDate.toISOString().split('T')[0];
    }

    function quickIssueLoan(bookId) {
      openModal('modalLoanBook');
      setTimeout(() => {
        const bookSelect = document.getElementById('loanBookSelect');
        if (bookSelect) bookSelect.value = bookId;
      }, 50);
    }

    // ===== ISBN ile kitap ekleme =====
    let isbnDone = null;
    const cleanIsbn = () => document.getElementById('bookIsbn').value.replace(/[^0-9Xx]/g, '').toUpperCase();
    const bookPal = ['#0070f3','#ea580c','#10b981','#06b6d4','#ef4444','#a855f7','#eab308','#64748b','#ec4899','#14b8a6'];
    function resetAddBook() {
      document.getElementById('formAddBook').reset();
      document.getElementById('bookDetails').classList.add('hidden');
      document.getElementById('isbnMsg').innerText = '';
      isbnDone = null;
      setTimeout(() => document.getElementById('bookIsbn').focus(), 60);
    }
    function isbnKey(e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = cleanIsbn();
      if (v && isbnDone === v) handleSaveBook(e); else lookupIsbn();
    }
    // ISBN → sunucu (Kitapyurdu / D&R / İdefix kazıma, isteğe bağlı ISBNdb). Sonuç: kitap | null (bulunamadı) | 'ERR' (kaynak hatası)
    const lastTrace = {}, lastPartial = {};
    async function fetchIsbn(isbn) {
      try {
        const x = await fetch('api.php?a=isbn&isbn=' + isbn);
        if (x.status === 401) { showLogin(); return 'ERR'; }
        const j = await x.json().catch(() => ({}));
        if (x.ok && j.book && j.book.title) { const b = j.book; return { title: b.title, author: b.author || '', category: b.category || '', pages: b.pages || 0, year: b.year || '', publisher: b.publisher || '' }; }
        lastTrace[isbn] = j.trace || [];
        if (x.ok && j.partial && j.book) { lastPartial[isbn] = j.book; return null; }
        if (j.code === 'NOT_FOUND') return null;
        return 'ERR';
      } catch (e) { return 'ERR'; }
    }

    // ---------- Yayınevinden Toplu Ekle ve Arama ----------
    const PUBS = [
      { id: 'camlica', label: 'Çamlıca Yayınları', q: 'Çamlıca' },
      { id: 'hasbahce', label: 'Hasbahçe Yayınları', q: 'Hasbahçe' },
      { id: 'yedikita', label: 'Yedi Kıta', q: 'Yedi Kıta' },
      { id: 'insanvehayat', label: 'İnsan ve Hayat', q: 'İnsan ve Hayat' },
      { id: 'fazilet', label: 'Fazilet Neşriyat', q: 'Fazilet' },
      { id: 'semerkand', label: 'Semerkand Yayınları', q: 'Semerkand' },
      { id: 'tubitak', label: 'TÜBİTAK Yayınları', q: 'TÜBİTAK' },
      { id: 'diyanet', label: 'Diyanet İşleri', q: 'Diyanet' },
      { id: 'timas', label: 'Timaş Yayınları', q: 'Timaş' }
    ];
    const fold = t => String(t || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    let pubBooks = [], pubSel = new Set(), pubBusy = false;

    let hasGeminiKey = false, hasIsbndbKey = false;
    async function saveGeminiKey() {
      const k = document.getElementById('geminiKey').value.trim();
      const r = await api('gemini_key', { key: k });
      document.getElementById('geminiKey').value = '';
      hasGeminiKey = !!(r.j && r.j.hasKey);
      document.getElementById('geminiKeyMsg').innerText = hasGeminiKey ? '✓ Gemini API Anahtarı kaydedildi ve aktif.' : 'Anahtar silindi.';
      showToast(hasGeminiKey ? 'Gemini API anahtarı kaydedildi.' : 'Gemini API anahtarı silindi.', 'info');
    }
    async function saveIsbndbKey() {
      const k = document.getElementById('isbndbKey').value.trim();
      const r = await api('isbndb_key', { key: k });
      document.getElementById('isbndbKey').value = '';
      hasIsbndbKey = !!(r.j && r.j.hasKey);
      document.getElementById('isbndbKeyMsg').innerText = hasIsbndbKey ? '✓ ISBNdb Anahtarı kaydedildi ve aktif.' : 'Anahtar silindi.';
    }

    function openPub() {
      const pc = document.getElementById('pubChips');
      if (pc) {
        pc.innerHTML = PUBS.map(p => `<label class="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition"><input type="checkbox" class="pubChip" value="${p.q}" ${p.id==='camlica'||p.id==='hasbahce'?'checked':''}> ${p.label}</label>`).join('');
      }
      const msg = document.getElementById('pubMsg');
      if (msg) msg.innerText = 'Çamlıca, Hasbahçe ve diğer yayınevlerinden kitap çekmek için yayınevi seçin veya özel ad yazın.';
      openModal('modalPub');
    }
    async function getJ(url) {
      const x = await fetch(url);
      if (x.status === 401) { showLogin(); throw new Error('login'); }
      const j = await x.json().catch(() => ({}));
      if (!x.ok) throw new Error(j.err || 'Hata ' + x.status);
      return j;
    }

    async function pubSearch() {
      if (pubBusy) return;
      const checkedChips = [...document.querySelectorAll('.pubChip:checked')].map(c => c.value);
      const customQuery = (document.getElementById('pubCustomSearch')?.value || '').trim();
      const targets = [...checkedChips];
      if (customQuery && !targets.includes(customQuery)) targets.push(customQuery);
      if (!targets.length) { showToast('En az bir yayınevi seçin veya yayınevi adı yazın.', 'error'); return; }

      pubBusy = true; pubBooks = []; pubSel = new Set();
      const msg = document.getElementById('pubMsg'), btn = document.getElementById('pubGo');
      if (btn) btn.disabled = true;
      pubRender();

      const seen = new Set();
      try {
        for (const target of targets) {
          if (msg) msg.innerText = `“${target}” yayınları aranıyor ve getiriliyor…`;
          const j = await getJ('api.php?a=pubbooks&name=' + encodeURIComponent(target));
          if (j && j.books) {
            j.books.forEach(b => {
              const k = b.isbn || b.title;
              if (!seen.has(k)) {
                seen.add(k);
                b.pub = target;
                b.pubName = b.publisher || target;
                pubBooks.push(b);
                if (b.isbn) pubSel.add(b.isbn);
              }
            });
            pubRender();
          }
        }
        if (msg) msg.innerText = pubBooks.length ? `Toplam ${pubBooks.length} adet kitap bulundu. İstediğiniz kitapları seçip kataloğa ekleyebilirsiniz.` : 'Kitap bulunamadı.';
      } catch (e) {
        if (e.message !== 'login' && msg) msg.innerText = 'Arama hatası: ' + (e.message || e);
      }
      pubBusy = false;
      if (btn) btn.disabled = false;
    }
    function pubVisible() {
      const q = fold(document.getElementById('pubFilter').value);
      return pubBooks.filter(b => !q || fold(b.title + ' ' + b.author + ' ' + b.isbn).includes(q));
    }
    function pubRender() {
      const v = pubVisible(), have = new Set(appState.books.map(b => b.isbn));
      document.getElementById('pubTools').classList.toggle('hidden', !pubBooks.length);
      document.getElementById('pubCount').innerText = `${v.length} görünen · ${pubSel.size} seçili`;
      const esc = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      document.getElementById('pubList').innerHTML = v.slice(0, 500).map(b => `<label class="flex items-start gap-3 px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs cursor-pointer"><input type="checkbox" class="mt-0.5" ${pubSel.has(b.isbn) ? 'checked' : ''} onchange="pubTick('${b.isbn}',this.checked)"><span class="flex-1 min-w-0"><span class="font-semibold text-slate-900 dark:text-white">${esc(b.title) || '(başlıksız)'}</span><br><span class="text-slate-500 dark:text-slate-400">${esc(b.author)}${b.author ? ' · ' : ''}${esc(b.pubName)}${b.pages ? ' · ' + b.pages + ' sf.' : ''}${b.year ? ' · ' + esc(b.year) : ''} · ${b.isbn}${have.has(b.isbn) ? ' · <b class="text-amber-500">katalogda var</b>' : ''}</span></span></label>`).join('') + (v.length > 500 ? `<p class="text-xs text-slate-500 px-3 py-2">İlk 500 gösteriliyor, aramayı daraltın.</p>` : '');
    }
    function pubTick(isbn, on) { on ? pubSel.add(isbn) : pubSel.delete(isbn); document.getElementById('pubCount').innerText = `${pubVisible().length} görünen · ${pubSel.size} seçili`; }
    function pubToggleAll(on) { pubVisible().forEach(b => on ? pubSel.add(b.isbn) : pubSel.delete(b.isbn)); pubRender(); }
    function pubImport() {
      let added = 0, dup = 0;
      pubBooks.filter(b => pubSel.has(b.isbn)).forEach(b => {
        if (appState.books.some(x => x.isbn === b.isbn)) { dup++; return; }
        appState.books.unshift({ id: Date.now() + added, title: b.title || b.isbn, author: b.author || '', category: b.category || 'Genel', isbn: b.isbn, totalStock: 1, currentStock: 1, color: bookPal[Math.floor(Math.random() * bookPal.length)], year: b.year || '', pages: parseInt(b.pages) || 0, publisher: b.publisher || b.pubName || '' });
        added++;
      });
      if (!added && !dup) { showToast('Önce kitap seçin.', 'error'); return; }
      saveState(); renderBooks(); pubSel = new Set(); pubRender();
      showToast(`${added} kitap eklendi${dup ? `, ${dup} tanesi zaten vardı` : ''}.`, 'success');
      closeModal('modalPub');
    }

    // ---------- Barkod & Etiket Bastırma ----------
    let currentBarcodeBook = null;
    function openBarcodeModal(bookId) {
      let b = appState.books.find(x => x.id === bookId);
      if (!b && appState.books.length) b = appState.books[0];
      if (!b) { showToast('Etiket basılacak kitap bulunamadı.', 'error'); return; }
      currentBarcodeBook = b;
      document.getElementById('lblTitle').innerText = b.title || '(Başlıksız)';
      document.getElementById('lblAuthor').innerText = 'Yazar: ' + (b.author || 'Bilinmiyor');
      document.getElementById('lblPub').innerText = 'Yayınevi: ' + (b.publisher || 'Bilinmiyor') + (b.year ? ' (' + b.year + ')' : '');
      document.getElementById('lblIsbnText').innerText = b.isbn || 'ISBN-YOK';
      document.getElementById('lblCat').innerText = 'Kategori: ' + (b.category || 'Genel');
      document.getElementById('lblShelfCode').innerText = (b.category ? b.category.slice(0, 3).toUpperCase() : 'RAF') + '-' + String(b.id).slice(-4);
      
      const barsContainer = document.getElementById('lblBarcodeBars');
      if (barsContainer) {
        const str = (b.isbn || '9780000000000').replace(/[^0-9]/g, '');
        let html = '<div class="w-1 h-full bg-black"></div><div class="w-0.5 h-full bg-white"></div>';
        for (let i = 0; i < str.length; i++) {
          const w = (parseInt(str[i]) % 3) + 1;
          html += `<div class="w-${w===1?'0.5':w===2?'1':'1.5'} h-full bg-black"></div><div class="w-0.5 h-full bg-white"></div>`;
        }
        barsContainer.innerHTML = html;
      }
      openModal('modalBarcode');
    }

    function printBookLabel() {
      const printContents = document.getElementById('barcodePrintArea').innerHTML;
      const win = window.open('', '', 'height=500,width=700');
      win.document.write('<html><head><title>Raf Etiketi</title>');
      win.document.write('<style>body{font-family:sans-serif;padding:30px;text-align:center;}.h-14{height:50px;display:flex;align-items:flex-end;justify-content:center;}.bg-black{background:#000;}.bg-white{background:#fff;}.w-0\\.5{width:2px;}.w-1{width:4px;}.w-1\\.5{width:6px;}</style>');
      win.document.write('</head><body>' + printContents + '</body></html>');
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 250);
    }

    // ---------- Excel / CSV Dışa Aktarma ----------
    function exportBooksCSV() {
      if (!appState.books.length) { showToast('Katalogda indirilecek kitap yok.', 'error'); return; }
      let csv = '\uFEFF"Başlık","Yazar","Kategori","Yayınevi","Yayın Yılı","Sayfa Sayısı","ISBN","Toplam Stok","Mevcut Stok"\n';
      appState.books.forEach(b => {
        const q = v => '"' + String(v || '').replace(/"/g, '""') + '"';
        csv += `${q(b.title)},${q(b.author)},${q(b.category)},${q(b.publisher)},${q(b.year)},${b.pages||0},${q(b.isbn)},${b.totalStock||1},${b.currentStock||1}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `kutuphane_katalogu_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      showToast('Katalog Excel/CSV dosyası olarak indirildi.', 'success');
    }

    // ---------- Okuma Karnesi & Başarı Belgesi ----------
    function openKarneModal(memberId) {
      const member = appState.members.find(m => m.id === memberId);
      if (!member) { showToast('Üye bulunamadı.', 'error'); return; }

      const returnedLoans = appState.loans.filter(l => l.memberId === memberId && l.status === 'RETURNED');
      const activeLoans = appState.loans.filter(l => l.memberId === memberId && l.status !== 'RETURNED');

      let totalPages = 0;
      const booksList = returnedLoans.map(l => {
        const book = appState.books.find(b => b.id === l.bookId) || { title: 'Bilinmeyen Kitap', author: '-', publisher: '-', pages: 0 };
        const pages = parseInt(book.pages) || 0;
        totalPages += pages;
        return {
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          pages: pages,
          returnDate: l.returnDate || l.dueDate
        };
      });

      document.getElementById('karneName').innerText = member.name;
      document.getElementById('karneRole').innerText = 'Üye Türü / Sınıf: ' + (member.role || 'Standart');
      document.getElementById('karneContact').innerText = (member.email ? member.email + ' · ' : '') + (member.phone || '');
      document.getElementById('karneAvatar').innerHTML = `<img src="${member.avatar}" class="w-full h-full object-cover">`;

      document.getElementById('karneTotalPages').innerText = totalPages.toLocaleString('tr-TR');
      document.getElementById('karneTotalBooks').innerText = booksList.length;
      document.getElementById('karneActiveLoans').innerText = activeLoans.length;

      let badgeHtml = '<i class="fa-solid fa-award"></i> Okuyucu';
      if (totalPages >= 2500) {
        badgeHtml = '<i class="fa-solid fa-crown"></i> 👑 Şampiyon Okuyucu (2500+ Sayfa)';
      } else if (totalPages >= 1000) {
        badgeHtml = '<i class="fa-solid fa-medal"></i> 🥇 Altın Okuyucu (1000+ Sayfa)';
      } else if (totalPages >= 400) {
        badgeHtml = '<i class="fa-solid fa-medal"></i> 🥈 Gümüş Okuyucu (400+ Sayfa)';
      } else if (totalPages > 0) {
        badgeHtml = '<i class="fa-solid fa-award"></i> 🥉 Bronz Okuyucu';
      } else {
        badgeHtml = '<i class="fa-solid fa-book"></i> Yeni Okuyucu';
      }
      document.getElementById('karneBadge').innerHTML = badgeHtml;

      const tbody = document.getElementById('karneBooksTable');
      if (booksList.length > 0) {
        tbody.innerHTML = booksList.map(b => `
          <tr>
            <td class="py-2.5 px-4 font-bold text-slate-900 dark:text-white">${esc(b.title)}</td>
            <td class="py-2.5 px-4 text-slate-500">${esc(b.author)} ${b.publisher ? '· ' + esc(b.publisher) : ''}</td>
            <td class="py-2.5 px-4 text-center font-semibold text-emerald-600 dark:text-emerald-400">${b.pages ? b.pages + ' sayfa' : '-'}</td>
            <td class="py-2.5 px-4 text-right text-slate-400 font-mono text-[11px]">${b.returnDate}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-slate-400 italic">Henüz tamamlanan kitap kaydı yok.</td></tr>`;
      }

      openModal('modalKarne');
    }

    function printKarne() {
      const name = document.getElementById('karneName').innerText;
      const printContents = document.getElementById('karnePrintArea').innerHTML;
      const win = window.open('', '', 'height=750,width=950');
      win.document.write('<html><head><title>Okuma Karnesi - ' + name + '</title>');
      win.document.write('<style>body{font-family:sans-serif;padding:30px;color:#1e293b;}.text-2xl{font-size:24px;}.font-bold{font-weight:bold;}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;}.p-4,.p-5{padding:15px;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:15px;}table{width:100%;border-collapse:collapse;margin-top:15px;}th,td{padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;}th{background:#f8fafc;}</style>');
      win.document.write('</head><body><h1 style="text-align:center;margin-bottom:20px;">🎓 KÜTÜPHANE OKUMA KARNESİ & BAŞARI BELGESİ</h1>' + printContents + '</body></html>');
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); win.close(); }, 250);
    }

    // ---------- Telefon Kamera Barkod Okuma ----------
    let html5QrcodeScanner = null;
    let cameraTargetInputId = null;
    let currentCameraFacing = 'environment';

    async function startCameraScanner(targetInputId) {
      cameraTargetInputId = targetInputId;
      const statusMsg = document.getElementById('cameraStatusMsg');
      if (statusMsg) statusMsg.innerText = 'Kamera başlatılıyor…';
      openModal('modalCameraScanner');

      if (!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5Qrcode("cameraReader");
      }

      try {
        const config = { fps: 15, qrbox: { width: 250, height: 180 } };
        await html5QrcodeScanner.start(
          { facingMode: currentCameraFacing },
          config,
          (decodedText, decodedResult) => {
            const cleanBarcode = decodedText.replace(/[^0-9Xx]/g, '').toUpperCase();
            if (cleanBarcode) {
              if (statusMsg) statusMsg.innerText = '✅ Barkod Okundu: ' + cleanBarcode;
              if (window.navigator.vibrate) window.navigator.vibrate(100);
              
              if (cameraTargetInputId) {
                const targetInput = document.getElementById(cameraTargetInputId);
                if (targetInput) {
                  targetInput.value = cleanBarcode;
                  if (cameraTargetInputId === 'bookIsbn') {
                    lookupIsbn();
                  } else if (cameraTargetInputId === 'globalSearchInput') {
                    switchTab('books');
                    const bInput = document.getElementById('bookSearchInput');
                    if (bInput) bInput.value = cleanBarcode;
                    renderBooks();
                  }
                }
              }
              setTimeout(() => {
                stopCameraScanner();
                showToast(`Barkod okundu: ${cleanBarcode}`, 'success');
              }, 400);
            }
          },
          (errorMessage) => {}
        );
        if (statusMsg) statusMsg.innerText = 'Kamera aktif. Barkodu kırmızı çizgiye hizalayın.';
      } catch (err) {
        console.error("Camera start error:", err);
        if (statusMsg) statusMsg.innerText = 'Kamera açılamadı! İzin verildiğinden ve HTTPS/localhost bağlantısı kullanıldığından emin olun.';
      }
    }

    async function stopCameraScanner() {
      if (html5QrcodeScanner) {
        try {
          await html5QrcodeScanner.stop();
        } catch (e) {}
      }
      closeModal('modalCameraScanner');
    }

    async function switchCameraFacing() {
      currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
      if (html5QrcodeScanner) {
        try { await html5QrcodeScanner.stop(); } catch(e){}
      }
      startCameraScanner(cameraTargetInputId);
    }


    // ---------- Toplu ISBN ekleme ----------
    let bulkFailed = [], bulkBusy = false;
    const bulkClean = v => String(v || '').replace(/[^0-9Xx]/g, '').toUpperCase();
    function openBulk() {
      bulkFailed = []; bulkBusy = false;
      document.getElementById('bulkRows').innerHTML = '';
      document.getElementById('bulkStep1').classList.remove('hidden');
      document.getElementById('bulkStep2').classList.add('hidden');
      document.getElementById('bulkStep2').innerHTML = '';
      document.getElementById('bulkMsg').innerText = '';
      const g = document.getElementById('bulkGo'); g.disabled = false; g.innerText = 'Ekle ve Ara'; g.onclick = bulkRun;
      const f = bulkAddRow(''); openModal('modalBulk'); setTimeout(() => f.focus(), 60);
    }
    function bulkAddRow(v, after) {
      const wrap = document.getElementById('bulkRows');
      const i = document.createElement('input');
      i.type = 'text'; i.inputMode = 'text'; i.enterKeyHint = 'next'; i.autocomplete = 'off'; i.autocapitalize = 'off'; i.className = 'bulkIn w-full px-3.5 py-2.5 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 select-text';
      i.placeholder = 'ISBN'; i.value = v || '';
      i.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
          e.preventDefault();
          if (i.value.trim()) { bulkNext(i); }
          else if (Date.now() - bulkAdv > 120) bulkRun(); // boş satırda Enter = hepsini ara (barkod okuyucunun Enter'ı sayılmaz)
        }
        else if (e.key === 'Backspace' && !i.value && wrap.children.length > 1) { e.preventDefault(); const pv = i.previousElementSibling || i.nextElementSibling; i.remove(); pv.focus(); bulkCount(); }
      });
      i.addEventListener('input', () => {
        bulkCount();
        // 13 hane dolunca beklemeden yeni satıra geç
        if (bulkClean(i.value).length === 13) { if (!i.dataset.adv) { i.dataset.adv = '1'; bulkNext(i); } } else delete i.dataset.adv;
      });
      i.addEventListener('paste', e => {
        const t = (e.clipboardData || window.clipboardData).getData('text');
        if (!/[\r\n]/.test(t)) return;
        e.preventDefault();
        const parts = t.split(/[\r\n]+/).map(x => x.trim()).filter(Boolean);
        i.value = parts[0] || ''; let last = i;
        parts.slice(1).forEach(x => { last = bulkAddRow(x, last); });
        last.focus(); bulkCount();
      });
      if (after && after.nextSibling) wrap.insertBefore(i, after.nextSibling); else wrap.appendChild(i);
      bulkCount(); return i;
    }
    let bulkAdv = 0;
    function bulkNext(i) { if (i.nextElementSibling && !i.nextElementSibling.value) { i.nextElementSibling.focus(); } else { bulkAdd = bulkAddRow('', i); bulkAdd.focus(); } bulkAdv = Date.now(); }
    let bulkAdd = null;
    function bulkValues() { return [...document.querySelectorAll('.bulkIn')].map(i => bulkClean(i.value)).filter(Boolean); }
    function bulkCount() { const v = bulkValues(); document.getElementById('bulkCount').innerText = v.length ? `${v.length} satır` : ''; }
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    async function bulkRun() {
      if (bulkBusy) return;
      const vals = bulkValues();
      if (!vals.length) { showToast('En az bir ISBN girin.', 'error'); return; }
      const map = new Map(); vals.forEach(v => map.set(v, (map.get(v) || 0) + 1));
      bulkBusy = true;
      const btn = document.getElementById('bulkGo'), msg = document.getElementById('bulkMsg');
      btn.disabled = true; document.querySelectorAll('.bulkIn').forEach(i => i.disabled = true);
      let added = 0, bumped = 0; const adds = [], bumpedList = []; bulkFailed = [];
      let k = 0;
      for (const [isbn, n] of map) {
        k++; msg.innerText = `${k}/${map.size} · aranıyor: ${isbn}`;
        const old = appState.books.find(b => b.isbn === isbn) || adds.find(b => b.isbn === isbn);
        if (old) { old.totalStock += n; old.currentStock += n; bumped++; bumpedList.push(old.title + ' (' + isbn + ')'); continue; }
        if (isbn.length !== 10 && isbn.length !== 13) { bulkFailed.push({ isbn, n, why: 'Geçersiz ISBN uzunluğu' }); continue; }
        const d = await fetchIsbn(isbn);
        if (d && d !== 'ERR') {
          adds.push({ id: Date.now() + k, title: d.title, author: d.author, category: d.category || 'Genel', isbn, totalStock: n, currentStock: n, color: bookPal[Math.floor(Math.random() * bookPal.length)], year: d.year, pages: d.pages || 0, publisher: d.publisher || '' });
          added++;
        } else { const pt = lastPartial[isbn]; bulkFailed.push({ isbn, n, why: d === 'ERR' ? 'Kaynaklara ulaşılamadı veya ISBN geçersiz' : (pt ? 'Kitap adı bulunamadı, yazın (yazar, yayınevi, yıl alındı)' : 'Kitap bulunamadı'), trace: lastTrace[isbn] || [], meta: pt ? { publisher: pt.publisher || '', pages: pt.pages || 0, year: pt.year || '', category: pt.category || '' } : null, author: pt ? (pt.author || '') : '' }); }
        await sleep(1000);
      }
      adds.reverse().forEach(b => appState.books.unshift(b));
      if (added || bumped) { saveState(); renderBooks(); }
      bulkBusy = false;
      msg.innerText = `${added} kitap eklendi${bumped ? `, ${bumped} kitap zaten katalogdaydı, adedi artırıldı: ${bumpedList.join('; ')}` : ''}${bulkFailed.length ? `, ${bulkFailed.length} ISBN bulunamadı.` : '.'}`;
      if (!bulkFailed.length) { showToast(msg.innerText, 'success'); closeModal('modalBulk'); return; }
      bulkShowFailed();
    }

    function bulkShowFailed() {
      document.getElementById('bulkStep1').classList.add('hidden');
      const box = document.getElementById('bulkStep2'); box.classList.remove('hidden');
      const cls = 'w-full px-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 select-text';
      box.innerHTML = '<p class="text-xs text-slate-500 dark:text-slate-400">Bulunamayanlar için kitap adını yazıp “Kitap adıyla bul”a basın (Enter de çalışır), listeden doğru kitabı seçin. İsterseniz elle de doldurabilirsiniz. Kitap adı boş satır eklenmez.</p>' +
        bulkFailed.map((f, i) => `<div class="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
          <div class="flex items-center justify-between text-xs"><span class="font-semibold text-slate-900 dark:text-white">${f.isbn}${f.n > 1 ? ' × ' + f.n : ''}</span><a href="https://isbnsearch.org/isbn/${f.isbn}" target="_blank" rel="noopener" class="text-brand-500 hover:underline">isbnsearch.org'da aç</a></div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">${f.why}</p>${f.trace && f.trace.length ? `<details class="text-[11px] text-slate-500 dark:text-slate-400"><summary class="cursor-pointer">Neden bulunamadı?</summary><ul class="list-disc pl-4 mt-1 space-y-0.5">${f.trace.map(t => `<li>${String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('')}</ul></details>` : ''}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2"><input type="text" id="bf-t-${i}" placeholder="Kitap adı" onkeydown="if(event.key==='Enter'){event.preventDefault();bulkByTitle(${i});}" class="${cls}"><input type="text" id="bf-a-${i}" placeholder="Yazar" class="${cls}"></div>
          <div class="flex items-center gap-2"><button type="button" id="bf-b-${i}" onclick="bulkByTitle(${i})" class="px-3 py-1.5 rounded-lg border border-brand-500 text-brand-500 hover:bg-brand-500/10 text-[11px] font-semibold">Kitap adıyla bul</button><span id="bf-s-${i}" class="text-[11px] text-slate-500 dark:text-slate-400"></span></div>
          <div id="bf-c-${i}" class="space-y-1"></div></div>`).join('');
      const g = document.getElementById('bulkGo'); g.disabled = false; g.innerText = 'Doldurulanları Ekle'; g.onclick = bulkSaveFailed;
      bulkFailed.forEach((f, i) => { if (f.author) document.getElementById('bf-a-' + i).value = f.author; });
      document.getElementById('bf-t-0').focus();
    }

    async function bulkByTitle(i) {
      const t = document.getElementById('bf-t-' + i).value.trim(), st = document.getElementById('bf-s-' + i), box = document.getElementById('bf-c-' + i);
      if (t.length < 2) { st.innerText = 'Önce kitap adını yazın.'; return; }
      st.innerText = 'Aranıyor…'; box.innerHTML = '';
      try {
        const x = await fetch('api.php?a=title&q=' + encodeURIComponent(t));
        if (x.status === 401) { showLogin(); return; }
        const j = await x.json().catch(() => ({}));
        const l = (j.books || []);
        if (!x.ok) { st.innerText = j.err || 'Arama başarısız.'; return; }
        if (!l.length) { st.innerText = 'Bu adla sonuç bulunamadı.' + (j.trace && j.trace.length ? ' (' + j.trace.join('; ') + ')' : ''); return; }
        st.innerText = l.length + ' sonuç, doğru olanı seçin:';
        const esc = v => String(v || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        box.innerHTML = l.map((b, k) => `<button type="button" onclick="bulkPick(${i},${k})" class="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px]"><span class="font-semibold text-slate-900 dark:text-white">${esc(b.title)}</span><br><span class="text-slate-500 dark:text-slate-400">${esc(b.author)}${b.publisher ? ' · ' + esc(b.publisher) : ''}${b.year ? ' · ' + esc(b.year) : ''}${b.pages ? ' · ' + b.pages + ' sf.' : ''}</span></button>`).join('');
        bulkFailed[i].cands = l;
      } catch (e) { st.innerText = 'Sunucuya ulaşılamadı.'; }
    }
    function bulkPick(i, k) {
      const b = bulkFailed[i].cands[k];
      document.getElementById('bf-t-' + i).value = b.title; document.getElementById('bf-a-' + i).value = b.author || '';
      bulkFailed[i].meta = { publisher: b.publisher || '', pages: b.pages || 0, year: b.year || '', category: b.category || '' };
      document.getElementById('bf-c-' + i).innerHTML = ''; document.getElementById('bf-s-' + i).innerText = 'Seçildi ✓';
    }
    function bulkSaveFailed() {
      let n = 0, skipped = 0;
      bulkFailed.forEach((f, i) => {
        const t = document.getElementById('bf-t-' + i).value.trim();
        if (!t) { skipped++; return; }
        appState.books.unshift({ id: Date.now() + i, title: t, author: document.getElementById('bf-a-' + i).value.trim(), category: (f.meta && f.meta.category) || 'Genel', isbn: f.isbn, totalStock: f.n, currentStock: f.n, color: bookPal[Math.floor(Math.random() * bookPal.length)], year: (f.meta && f.meta.year) || '', pages: (f.meta && f.meta.pages) || 0, publisher: (f.meta && f.meta.publisher) || '' });
        n++;
      });
      if (n) { saveState(); renderBooks(); }
      showToast(`${n} kitap elle eklendi${skipped ? `, ${skipped} tanesi boş bırakıldı` : ''}.`, n ? 'success' : 'info');
      closeModal('modalBulk');
    }

    async function lookupIsbn() {
      const isbn = cleanIsbn(), msg = document.getElementById('isbnMsg');
      if (isbn.length !== 10 && isbn.length !== 13) { msg.innerText = 'Geçerli bir ISBN girin (10 veya 13 hane).'; return; }
      msg.innerText = 'Aranıyor…';
      const d = await fetchIsbn(isbn);
      isbnDone = isbn;
      const nf = d === 'ERR' ? 'Kaynak sitelere ulaşılamadı, bilgileri elle girin.' : 'Kitap bulunamadı, kitap adı ve yazarı elle girin.';
      document.getElementById('bookDetails').classList.remove('hidden');
      const set = (id, v) => document.getElementById(id).value = v;
      if (d && d !== 'ERR') {
        set('bookTitle', d.title); set('bookAuthor', d.author); set('bookCategory', d.category); set('bookPages', d.pages); set('bookYear', d.year); set('bookPublisher', d.publisher || '');
        msg.innerText = 'Bilgiler bulundu. Kontrol edip kaydedin.';
        document.getElementById('bookSaveBtn').focus();
      } else {
        const pt = lastPartial[isbn] || {};
        set('bookTitle', ''); set('bookAuthor', pt.author || ''); set('bookPages', pt.pages || ''); set('bookYear', pt.year || ''); set('bookPublisher', pt.publisher || '');
        msg.innerText = nf;
        document.getElementById('bookTitle').focus();
      }
    }
    function handleSaveBook(e) {
      e.preventDefault();
      const isbn = cleanIsbn();
      if (!isbn || isbnDone !== isbn) { lookupIsbn(); return; }
      const title = document.getElementById('bookTitle').value.trim();
      if (!title) { showToast('Kitap adı gerekli.', 'error'); return; }
      const n = Math.max(1, parseInt(document.getElementById('bookStock').value) || 1);
      const old = appState.books.find(b => b.isbn === isbn);
      if (old) {
        old.totalStock += n; old.currentStock += n;
        showToast(`"${old.title}" zaten vardı, adet ${n} artırıldı.`, 'success');
      } else {
        appState.books.unshift({
          id: Date.now(), title, author: document.getElementById('bookAuthor').value.trim(),
          category: document.getElementById('bookCategory').value.trim() || 'Genel', isbn,
          totalStock: n, currentStock: n, color: bookPal[Math.floor(Math.random() * bookPal.length)],
          year: document.getElementById('bookYear').value, pages: parseInt(document.getElementById('bookPages').value) || 0,
          publisher: document.getElementById('bookPublisher').value
        });
        showToast(`"${title}" kataloğa eklendi.`, 'success');
      }
      saveState();
      renderBooks();
      closeModal('modalAddBook');
    }

    async function deleteBook(bookId) {
      if (!confirm('Bu kitabı katalogdan silmek istiyor musunuz?')) return;
      try {
        const result = await api('book_delete', { id: bookId });
        if (!result.ok) { showToast(result.j.err || 'Kitap silinemedi.', 'error'); return; }
      } catch (err) { showToast('Kitap silme işlemi sunucuya kaydedilemedi.', 'error'); return; }
      appState.books = appState.books.filter(b => b.id !== bookId);
      saveState();
      renderBooks();
      showToast('Kitap katalogdan silindi.', 'info');
    }

    async function handleIssueLoan(e) {
      e.preventDefault();
      const memberId = parseInt(document.getElementById('loanMemberSelect').value);
      const bookId = parseInt(document.getElementById('loanBookSelect').value);

      const book = appState.books.find(b => b.id === bookId);
      const member = appState.members.find(m => m.id === memberId);
      const mx = maxLimit();
      if (member && member.activeLoans >= mx) {
        showToast('Üye en fazla ' + mx + ' kitap alabilir.', 'error');
        return;
      }

      if (!book || book.currentStock <= 0) {
        showToast('Seçilen kitap stokta mevcut değil!', 'error');
        return;
      }

      let loanResult;
      try {
        loanResult = await api('loan_create', { bookId, memberId, issueDate: document.getElementById('loanStartDate').value, dueDate: document.getElementById('loanDueDate').value });
        if (!loanResult.ok) { showToast(loanResult.j.err || 'Ödünç işlemi tamamlanamadı.', 'error'); return; }
      } catch (err) { showToast('Ödünç işlemi sunucuya kaydedilemedi.', 'error'); return; }
      const newLoan = {
        id: loanResult.j.id,
        bookId,
        memberId,
        issueDate: document.getElementById('loanStartDate').value,
        dueDate: document.getElementById('loanDueDate').value,
        returnDate: null,
        status: 'ACTIVE'
      };

      book.currentStock -= 1;
      member.activeLoans += 1;

      appState.loans.unshift(newLoan);
      saveState();
      renderLoansTable();
      renderBooks();
      closeModal('modalLoanBook');
      showToast(`Kitap ${member.name} isimli üyeye teslim edildi.`, 'success');
    }

    async function handleSaveMember(e) {
      e.preventDefault();
      const newMember = {
        id: Date.now(),
        name: document.getElementById('memberName').value.trim(),
        email: document.getElementById('memberEmail').value.trim(),
        phone: document.getElementById('memberPhone').value.trim(),
        role: document.getElementById('memberRole').value,
        activeLoans: 0,
        avatar: `https://serup.com.tr/enderun/assets/images/clubs/ahenkk.svg`
      };
      const username = document.getElementById('memberUsername').value.trim();
      const password = document.getElementById('memberPassword').value;
      try {
        const result = await api('member_add', { ...newMember, username, password });
        if (!result.ok) { showToast(result.j.err || 'Üye oluşturulamadı.', 'error'); return; }
      } catch (err) { showToast('Üye kaydı sunucuya gönderilemedi.', 'error'); return; }

      appState.members.unshift(newMember);
      saveState();
      renderMembers();
      closeModal('modalAddMember');
      showToast(`${newMember.name} üye olarak kaydedildi.`, 'success');
      document.getElementById('formAddMember').reset();
    }

    async function deleteMember(memberId) {
      if (!confirm('Bu üyeyi ve giriş hesabını silmek istiyor musunuz?')) return;
      try {
        const result = await api('member_delete', { id: memberId });
        if (!result.ok) { showToast(result.j.err || 'Üye silinemedi.', 'error'); return; }
      } catch (err) { showToast('Üye silme işlemi sunucuya kaydedilemedi.', 'error'); return; }
      appState.members = appState.members.filter(m => m.id !== memberId);
      saveState();
      renderMembers();
      showToast('Üye kaydı silindi.', 'info');
    }

    function updateMetrics() {
      document.getElementById('stat-total-books').innerText = appState.books.length;
      document.getElementById('badge-total-books').innerText = appState.books.length;

      const activeLoansCount = appState.loans.filter(l => l.status === 'ACTIVE').length;
      document.getElementById('stat-active-loans').innerText = activeLoansCount;
      document.getElementById('badge-active-loans').innerText = activeLoansCount;

      const overdueCount = appState.loans.filter(l => l.status === 'OVERDUE').length;
      document.getElementById('stat-overdue-loans').innerText = overdueCount;

      document.getElementById('stat-total-members').innerText = appState.members.length;

      const totalPagesRead = appState.loans.filter(l => l.status === 'RETURNED').reduce((sum, l) => {
        const b = appState.books.find(x => x.id === l.bookId);
        return sum + (b ? (parseInt(b.pages) || 0) : 0);
      }, 0);
      const statPagesEl = document.getElementById('stat-total-pages');
      if (statPagesEl) statPagesEl.innerText = totalPagesRead.toLocaleString('tr-TR');

      // Update Loan counts
      document.getElementById('count-loan-all').innerText = appState.loans.length;
      document.getElementById('count-loan-active').innerText = activeLoansCount;
      document.getElementById('count-loan-overdue').innerText = overdueCount;
      document.getElementById('count-loan-returned').innerText = appState.loans.filter(l => l.status === 'RETURNED').length;
    }

    // Toast System
    function showToast(message, type = 'info') {
      const container = document.getElementById('toastContainer');
      const toast = document.createElement('div');

      const bg = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-brand-600';
      const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info';

      toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl text-white text-xs md:text-sm font-semibold shadow-xl ${bg} transform translate-y-4 opacity-0 transition-all duration-300`;
      toast.innerHTML = `<i class="fa-solid ${icon} text-lg"></i> <span>${message}</span>`;

      container.appendChild(toast);

      setTimeout(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
      }, 10);

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    const SET = { name: 'settingLibName', slogan: 'settingLibSlogan', max: 'settingMaxLimit', days: 'settingLoanDays' };
    const maxLimit = () => parseInt(document.getElementById('settingMaxLimit').value) || 3;
    function applyBrand(name, slogan) {
      name = name || 'Fihrist'; slogan = slogan || 'Kütüphane Yönetimi';
      ['brandName', 'loginBrand'].forEach(id => document.getElementById(id).innerText = name);
      ['brandSlogan', 'loginSlogan'].forEach(id => document.getElementById(id).innerText = slogan);
      document.title = name;
    }
    function applySettings() {
      const st = appState.settings || {};
      Object.entries(SET).forEach(([k, id]) => { if (st[k] !== undefined && st[k] !== '') document.getElementById(id).value = st[k]; });
      applyBrand(st.name, st.slogan);
      const gMsg = document.getElementById('geminiKeyMsg');
      if (gMsg) gMsg.innerText = hasGeminiKey ? '✓ Gemini API Anahtarı aktif.' : 'Anahtar girilmemiş (Open Library ve Kitapyurdu yedek motorları kullanılıyor).';
      const iMsg = document.getElementById('isbndbKeyMsg');
      if (iMsg) iMsg.innerText = hasIsbndbKey ? '✓ ISBNdb Anahtarı aktif.' : 'Anahtar girilmemiş.';
    }
    function saveSettings() {
      appState.settings = {};
      Object.entries(SET).forEach(([k, id]) => { appState.settings[k] = document.getElementById(id).value.trim(); });
      applyBrand(appState.settings.name, appState.settings.slogan);
      saveState();
      showToast('Ayarlar kaydedildi.', 'success');
    }

    function resetDataToDefault() {
      if (!confirm('Tüm kitap, üye ve ödünç kayıtları silinecek. Emin misiniz?')) return;
      const st = appState.settings;
      appState = JSON.parse(JSON.stringify(emptyData));
      appState.settings = st;
      saveState();
      renderBooks();
      renderLoansTable();
      renderMembers();
      showToast('Tüm veriler silindi.', 'info');
    }

    // ===== Sunucu bağlantısı, giriş ve yöneticiler =====
    let admins = [], me = null, currentMember = null;
    const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function openSidebar() { document.getElementById('sidebar').classList.add('open'); }
    function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); }
    function showLogin(m) {
      document.getElementById('loginOverlay').classList.remove('hidden');
      document.getElementById('loginMsg').innerText = m || '';
      fetch('api.php?a=brand').then(x => x.json()).then(b => applyBrand(b.name, b.slogan)).catch(() => {});
      setTimeout(() => document.getElementById('loginUser').focus(), 50);
    }
    function hideLogin() { document.getElementById('loginOverlay').classList.add('hidden'); }
    function setMe() {
      document.getElementById('meName').innerText = me ? me.name : 'Yönetici';
      document.getElementById('meUser').innerText = me ? '@' + me.username : '';
      document.getElementById('welcomeName').innerText = me ? me.username : 'Yönetici';
      renderAdmins();
    }
    function renderAdmins() {
      document.getElementById('adminList').innerHTML = admins.map(a => `
        <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/50">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 shrink-0 rounded-full bg-brand-500/15 text-brand-500 flex items-center justify-center font-bold text-sm">${esc(a.name.charAt(0).toUpperCase())}</div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">${esc(a.name)} ${me && a.id === me.id ? '<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-500 font-semibold">Sen</span>' : ''}</p>
              <p class="text-xs text-slate-400 truncate">@${esc(a.username)}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="openAdminModal('${a.id}')" title="Düzenle" class="w-9 h-9 rounded-xl text-slate-500 hover:bg-white dark:hover:bg-slate-700"><i class="fa-solid fa-pen"></i></button>
            ${me && a.id === me.id ? '' : `<button onclick="delAdmin('${a.id}')" title="Sil" class="w-9 h-9 rounded-xl text-rose-500 hover:bg-white dark:hover:bg-slate-700"><i class="fa-solid fa-trash"></i></button>`}
          </div>
        </div>`).join('');
    }
    async function api(action, body) {
      const x = await fetch('api.php?a=' + action, { ...J, body: JSON.stringify(body) });
      if (x.status === 401) { showLogin(); throw 0; }
      return { ok: x.ok, j: await x.json() };
    }
    function openAdminModal(id) {
      const a = admins.find(x => x.id === id);
      document.getElementById('adminId').value = a ? a.id : '';
      document.getElementById('adminName').value = a ? a.name : '';
      document.getElementById('adminUser').value = a ? a.username : '';
      document.getElementById('adminPass').value = '';
      document.getElementById('adminMsg').innerText = '';
      document.getElementById('adminModalTitle').innerText = a ? 'Yöneticiyi Düzenle' : 'Yönetici Ekle';
      document.getElementById('adminPassLabel').innerText = a ? 'Yeni şifre (boş bırakırsanız değişmez)' : 'Şifre (en az 6 karakter)';
      openModal('modalAdmin');
    }
    async function saveAdmin(e) {
      e.preventDefault();
      try {
        const { ok, j } = await api('admin_save', { id: document.getElementById('adminId').value, name: document.getElementById('adminName').value, username: document.getElementById('adminUser').value, password: document.getElementById('adminPass').value });
        if (!ok) { document.getElementById('adminMsg').innerText = j.err || 'Kaydedilemedi'; return; }
        admins = j.admins; me = j.me; setMe(); closeModal('modalAdmin'); showToast('Yönetici kaydedildi.', 'success');
      } catch (err) {}
    }
    async function delAdmin(id) {
      if (!confirm('Bu yönetici silinsin mi?')) return;
      try {
        const { ok, j } = await api('admin_del', { id });
        if (!ok) { showToast(j.err || 'Silinemedi', 'error'); return; }
        admins = j.admins; setMe(); showToast('Yönetici silindi.', 'info');
      } catch (err) {}
    }
    async function changePassword() {
      try {
        const { ok, j } = await api('password', { old: document.getElementById('oldPass').value, new: document.getElementById('newPass').value });
        if (!ok) { showToast(j.err || 'Değiştirilemedi', 'error'); return; }
        document.getElementById('oldPass').value = ''; document.getElementById('newPass').value = '';
        showToast('Şifre değiştirildi.', 'success');
      } catch (err) {}
    }
    async function load() {
      try {
        const x = await fetch('api.php?a=get');
        if (x.status === 401) { showLogin(); return false; }
        const j = await x.json();
        if (j.role === 'member') {
          currentMember = j.member || null;
          renderMemberPortal(j.loans || []);
          return !!currentMember;
        }
        currentMember = null;
        appState = { books: j.b || [], members: j.u || [], loans: j.l || [], settings: (j.s && !Array.isArray(j.s)) ? j.s : {} };
        admins = j.admins || []; me = j.me || null; hasIsbndbKey = !!j.hasKey; hasGeminiKey = !!j.hasGeminiKey;
        normalize();
        applySettings();
        setMe();
        if (j.is_default_password) {
          document.getElementById('defaultPasswordWarning')?.classList.remove('hidden');
        } else {
          document.getElementById('defaultPasswordWarning')?.classList.add('hidden');
        }
        return true;
      } catch (e) { showLogin('Sunucuya bağlanılamadı'); return false; }
    }
    function fillCats() {
      const sel = document.getElementById('bookCategoryFilter'), v = sel.value;
      const cats = [...new Set(appState.books.map(b => b.category).filter(Boolean))].sort();
      sel.innerHTML = '<option value="ALL">Tüm Kategoriler</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      sel.value = cats.includes(v) ? v : 'ALL';
      document.getElementById('catList').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
    }
    function renderAll() {
      fillCats();
      if (!loanTrendChart) initCharts();
      renderBooks(); renderLoansTable(); renderMembers(); updateMetrics(); refreshCharts();
    }
    function renderMemberPortal(loans) {
      const today = new Date().toISOString().slice(0, 10);
      document.getElementById('portalMemberName').innerText = currentMember ? currentMember.name : 'Üye';
      const target = document.getElementById('portalLoans');
      if (!loans.length) { target.innerHTML = '<p class="text-sm text-slate-500">Henüz ödünç geçmişin yok.</p>'; return; }
      target.innerHTML = loans.map(l => {
        const late = l.status !== 'RETURNED' && l.dueDate && l.dueDate < today;
        const status = l.status === 'RETURNED' ? 'İade edildi' : late ? 'Gecikmede' : 'Üzerinde';
        const color = late ? 'text-rose-500' : l.status === 'RETURNED' ? 'text-emerald-600' : 'text-brand-500';
        return '<article class="rounded-xl border border-slate-200 dark:border-dark-border p-4 flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-bold">' + esc(l.title || 'Kitap bilgisi yok') + '</h3><p class="text-xs text-slate-500 mt-1">' + esc(l.author || '') + '</p><p class="text-xs text-slate-500 mt-2">Ödünç: ' + esc(l.issueDate || '-') + ' · Son tarih: ' + esc(l.dueDate || '-') + (l.returnDate ? ' · İade: ' + esc(l.returnDate) : '') + '</p></div><span class="text-xs font-bold ' + color + '">' + status + '</span></article>';
      }).join('');
    }
    function showMemberPortal() {
      hideLogin();
      document.getElementById('appShell').classList.add('hidden');
      document.getElementById('memberPortal').classList.remove('hidden');
    }
    async function boot() { if (await load()) { hideLogin(); if (currentMember) showMemberPortal(); else { document.getElementById('memberPortal').classList.add('hidden'); document.getElementById('appShell').classList.remove('hidden'); renderAll(); } } }
    async function doLogin(e) {
      e.preventDefault();
      try {
        const x = await fetch('api.php?a=login', { ...J, body: JSON.stringify({ username: document.getElementById('loginUser').value, password: document.getElementById('loginPass').value }) });
        if (x.ok) {
          document.getElementById('loginPass').value = '';
          if (await load()) {
            if (currentMember) showMemberPortal();
            else { hideLogin(); document.getElementById('memberPortal').classList.add('hidden'); document.getElementById('appShell').classList.remove('hidden'); renderAll(); }
          }
        } else document.getElementById('loginMsg').innerText = 'Kullanıcı adı veya şifre yanlış';
      } catch (err) { document.getElementById('loginMsg').innerText = 'Sunucuya bağlanılamadı'; }
    }
    async function logout() { try { await fetch('api.php?a=logout'); } catch (e) {} location.reload(); }

    // Initialize Theme and Application Events
    document.addEventListener('DOMContentLoaded', () => {
      // Theme Toggle Logic
      const themeBtn = document.getElementById('themeToggleBtn');
      
      // Auto Light/Dark Check
      if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      themeBtn.addEventListener('click', () => {
        if (document.documentElement.classList.contains('dark')) {
          document.documentElement.classList.remove('dark');
          localStorage.theme = 'light';
        } else {
          document.documentElement.classList.add('dark');
          localStorage.theme = 'dark';
        }
      });

      // Mobile Sidebar Toggle
      document.getElementById('openSidebarMobile').addEventListener('click', () => {
        openSidebar();
      });
      document.getElementById('toggleSidebarMobile').addEventListener('click', () => {
        closeSidebar();
      });

      // Set Current Date Display
      const now = new Date();
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      document.getElementById('currentDateDisplay').innerText = now.toLocaleDateString('tr-TR', options);

      // Global Search Keyboard Shortcut (Ctrl+K or Cmd+K)
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          document.getElementById('globalSearchInput').focus();
        }
      });

      // Global Search input interaction
      document.getElementById('globalSearchInput').addEventListener('input', (e) => {
        const val = e.target.value;
        if (val.trim() !== '') {
          switchTab('books');
          document.getElementById('bookSearchInput').value = val;
          renderBooks();
        }
      });

      // Sunucudan verileri yükle (giriş gerekiyorsa giriş ekranı açılır)
      boot();
    });

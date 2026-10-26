// Fihrist record management helpers; loaded after js/app.js.
async function editBook(id) {
  const b = appState.books.find(x => Number(x.id) === Number(id)); if (!b) return;
  const title = prompt('Kitap adı', b.title); if (title === null) return;
  const author = prompt('Yazar', b.author); if (author === null) return;
  const category = prompt('Kategori', b.category || 'Genel'); if (category === null) return;
  const isbn = prompt('ISBN', b.isbn || ''); if (isbn === null) return;
  const stockText = prompt('Toplam stok (ödünçteki kitaplar korunur)', String(b.totalStock || 1)); if (stockText === null) return;
  const totalStock = Number(stockText); if (!Number.isInteger(totalStock) || totalStock < 1) { showToast('Stok en az 1 olmalı.', 'error'); return; }
  const publisher = prompt('Yayınevi', b.publisher || ''); if (publisher === null) return;
  const year = prompt('Basım yılı', b.year || ''); if (year === null) return;
  const pagesText = prompt('Sayfa sayısı', String(b.pages || 0)); if (pagesText === null) return;
  const pages = Number(pagesText); if (!Number.isInteger(pages) || pages < 0) { showToast('Sayfa sayısı geçersiz.', 'error'); return; }
  const color = prompt('Kapak rengi (hex)', b.color || '#0070f3'); if (color === null) return;
  try {
    const r = await api('book_update', {id:b.id,title:title.trim(),author:author.trim(),category:category.trim(),isbn:isbn.trim(),totalStock,currentStock:b.currentStock,publisher:publisher.trim(),year:year.trim(),pages,color});
    if (!r.ok) { showToast(r.j.err || 'Kitap güncellenemedi.', 'error'); return; }
    Object.assign(b,{title:title.trim(),author:author.trim(),category:category.trim(),isbn:isbn.trim(),totalStock,currentStock:r.j.currentStock,publisher:publisher.trim(),year:year.trim(),pages,color});
    saveState(); renderBooks(); renderLoansTable(); showToast('Kitap bilgileri güncellendi.', 'success');
  } catch(e) { showToast('Kitap güncellenemedi.', 'error'); }
}
function editMember(id) {
  const m = appState.members.find(x => Number(x.id) === Number(id)); if (!m) return;
  document.getElementById('editMemberId').value = m.id;
  document.getElementById('editMemberName').value = m.name || '';
  document.getElementById('editMemberEmail').value = m.email || '';
  document.getElementById('editMemberPhone').value = m.phone || '';
  document.getElementById('editMemberRole').value = m.role || 'Genel Okuyucu';
  document.getElementById('editMemberUsername').value = m.username || '';
  document.getElementById('editMemberPassword').value = '';
  document.getElementById('editMemberError').textContent = '';
  openModal('modalEditMember');
}
async function saveEditedMember(event) {
  event.preventDefault();
  const id = Number(document.getElementById('editMemberId').value);
  const m = appState.members.find(x => Number(x.id) === id); if (!m) return;
  const name = document.getElementById('editMemberName').value.trim();
  const email = document.getElementById('editMemberEmail').value.trim();
  const phone = document.getElementById('editMemberPhone').value.trim();
  const role = document.getElementById('editMemberRole').value.trim();
  const username = document.getElementById('editMemberUsername').value.trim();
  const password = document.getElementById('editMemberPassword').value;
  try {
    const r = await api('member_update',{id,name,email,phone,role,username,password});
    if (!r.ok) { document.getElementById('editMemberError').textContent = r.j.err || 'Üye güncellenemedi.'; return; }
    Object.assign(m,{name,email,phone,role,username});
    document.getElementById('editMemberPassword').value = '';
    closeModal('modalEditMember'); saveState(); renderMembers(); showToast('Üye bilgileri güncellendi.', 'success');
  } catch(e) { document.getElementById('editMemberError').textContent = 'Üye güncellenemedi.'; }
}
async function editLoan(id) {
  const l = appState.loans.find(x => String(x.id) === String(id)); if (!l) return;
  const issueDate = prompt('Ödünç tarihi (YYYY-AA-GG)', l.issueDate || ''); if (issueDate === null) return;
  const dueDate = prompt('Son iade tarihi (YYYY-AA-GG)', l.dueDate || ''); if (dueDate === null) return;
  let returnDate = l.returnDate || '';
  if (l.status === 'RETURNED') { returnDate = prompt('Gerçek iade tarihi (YYYY-AA-GG)', returnDate); if (returnDate === null) return; }
  try {
    const r = await api('loan_update',{id:l.id,issueDate,dueDate,returnDate});
    if (!r.ok) { showToast(r.j.err || 'Ödünç kaydı güncellenemedi.', 'error'); return; }
    Object.assign(l,{issueDate,dueDate,returnDate:returnDate || null}); renderLoansTable(); showToast('Ödünç tarihleri güncellendi.', 'success');
  } catch(e) { showToast('Ödünç kaydı güncellenemedi.', 'error'); }
}
async function deleteLoan(id) {
  if (!confirm('İade edilmiş ödünç kaydı çöp kutusuna taşınsın mı?')) return;
  try {
    const r = await api('loan_delete',{id});
    if (!r.ok) { showToast(r.j.err || 'Ödünç kaydı silinemedi.', 'error'); return; }
    appState.loans = appState.loans.filter(x => String(x.id) !== String(id)); saveState(); renderLoansTable(); showToast('Ödünç kaydı çöp kutusuna taşındı.', 'success');
  } catch(e) { showToast('Ödünç kaydı silinemedi.', 'error'); }
}
async function loadTrash() {
  const target = document.getElementById('trashItems'); if (!target) return;
  target.innerHTML = '<p class="text-sm text-slate-500">Çöp kutusu yükleniyor…</p>';
  try {
    const x = await fetch('api.php?a=trash_list'); const j = await x.json();
    if (!x.ok || !j.ok || !j.items || !j.items.length) { target.innerHTML = '<p class="text-sm text-slate-500">Çöp kutusu boş.</p>'; return; }
    const labels = {books:'Kitap',members:'Üye',admins:'Yönetici',loans:'Ödünç'};
    target.innerHTML = j.items.map(t => '<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-dark-border p-3"><div><p class="text-sm font-semibold">'+esc(t.label)+'</p><p class="text-xs text-slate-500">'+esc(labels[t.entity] || t.entity)+' · '+esc(t.deleted_at)+' · ID '+esc(t.record_id)+'</p></div><button onclick="restoreTrash('+Number(t.id)+')" class="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold">Geri Yükle</button></div>').join('');
  } catch(e) { target.innerHTML = '<p class="text-sm text-rose-500">Çöp kutusu yüklenemedi.</p>'; }
}
async function restoreTrash(id) {
  if (!confirm('Bu kayıt geri yüklensin mi?')) return;
  try {
    const r = await api('trash_restore',{id});
    if (!r.ok) { showToast(r.j.err || 'Kayıt geri yüklenemedi.', 'error'); return; }
    showToast('Kayıt geri yüklendi.', 'success');
    if (typeof boot === 'function') await boot();
    loadTrash();
  } catch(e) { showToast('Kayıt geri yüklenemedi.', 'error'); }
}

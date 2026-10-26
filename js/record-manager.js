// Fihrist recycle-bin and loan-edit helpers. Book/member edit handlers live in app.js.
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

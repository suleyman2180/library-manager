<?php
// TEK SEFERLİK: data/*.json dosyalarını MySQL'e aktarır. İş bitince bu dosyayı sunucudan sil.
// Kullanım: https://siteadi.com/migrate.php?key=config.php içindeki migrate_key
header('Content-Type: text/plain; charset=utf-8');
if (file_exists(__DIR__ . '/.migrated')) {
  http_response_code(403);
  exit("KİLİTLİ: Bu taşıma işlemi daha önce tamamlanmış (.migrated dosyası mevcut). Güvenlik için migrate.php'yi sunucudan silin.\n");
}
require __DIR__ . '/db.php';
$c = cfg();
if (($c['migrate_key'] ?? '') === '' || strpos($c['migrate_key'], 'BURAYA') === 0 || !hash_equals($c['migrate_key'], (string)($_GET['key'] ?? ''))) {
  http_response_code(403); exit("Yetkisiz. config.php içindeki migrate_key değerini ?key= ile gönder.\n");
}
function jr($f) { $p = __DIR__ . "/data/$f"; if (!is_file($p)) return []; $j = json_decode(file_get_contents($p), true); return is_array($j) ? $j : []; }

$p = pdo();
$n = (int)$p->query("SELECT (SELECT COUNT(*) FROM books) + (SELECT COUNT(*) FROM members) + (SELECT COUNT(*) FROM loans)")->fetchColumn();
if ($n > 0 && !isset($_GET['force'])) exit("Veritabanında zaten veri var ($n kayıt). Üzerine yazmak istersen sonuna &force=1 ekle.\n");

$users = jr('users.json'); $books = jr('book.json'); $loans = jr('loans.json'); $S = jr('ayarlar.json');
$p->beginTransaction();
try {
  sync_table('members', $users); sync_table('books', $books); sync_table('loans', $loans);

  $na = 0;
  if (!empty($S['admins']) && is_array($S['admins'])) {
    $p->exec("DELETE FROM admins");
    $st = $p->prepare("INSERT INTO admins (id, pos, username, name, hash) VALUES (?, ?, ?, ?, ?)");
    foreach (array_values($S['admins']) as $i => $a) { $st->execute([$a['id'], $i, $a['username'], $a['name'], $a['hash']]); $na++; }
  }
  kv_set('theme', ($S['theme'] ?? 'dark') === 'light' ? 'light' : 'dark');
  kv_set('app_settings', json_encode($S['settings'] ?? [], JSON_UNESCAPED_UNICODE));
  if (!empty($S['isbndb_key'])) kv_set('isbndb_key', $S['isbndb_key']);
  if (!empty($S['gemini_key'])) kv_set('gemini_key', $S['gemini_key']);

  $nc = 0; $cs = $p->prepare("INSERT INTO isbn_cache (isbn, data, updated_at) VALUES (?, ?, FROM_UNIXTIME(?)) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)");
  foreach (glob(__DIR__ . '/data/cache/v2_*.json') ?: [] as $f) {
    $isbn = substr(basename($f, '.json'), 3); $d = file_get_contents($f);
    if ($d !== false && json_decode($d, true) !== null) { $cs->execute([$isbn, $d, filemtime($f)]); $nc++; }
  }
  $p->commit();
  @file_put_contents(__DIR__ . '/.migrated', "Taşıma tamamlandı: " . date('c'));
} catch (Throwable $e) { $p->rollBack(); http_response_code(500); exit("HATA, hiçbir şey yazılmadı: " . $e->getMessage() . "\n"); }

echo "Tamam.\nÜye: " . count($users) . "\nKitap: " . count($books) . "\nÖdünç: " . count($loans) . "\nYönetici: $na\nÖnbellek: $nc\n\n";
echo "Şimdi uygulamayı aç, giriş yap, verileri kontrol et. Sonra migrate.php'yi ve data/ klasörünü sunucudan sil (içinde şifre özetleri ve API anahtarı var).\n";

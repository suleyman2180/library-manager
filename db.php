<?php
// Veritabanı bağlantısı, tablo kurulumu ve JSON-şekilli okuma/yazma yardımcıları.
function cfg() { static $c; if (!$c) $c = require __DIR__ . '/config.php'; return $c; }

function pdo() {
  static $p;
  if ($p) return $p;
  $c = cfg();
  $p = new PDO("mysql:host={$c['host']};port=" . ($c['port'] ?? 3306) . ";dbname={$c['name']};charset=utf8mb4", $c['user'], $c['pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  try { $p->query('SELECT 1 FROM isbn_cache LIMIT 1'); } catch (PDOException $e) { db_init($p); }
  return $p;
}

function db_init($p) {
  $t = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
  $p->exec("CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(16) NOT NULL PRIMARY KEY, pos INT NOT NULL DEFAULT 0,
    username VARCHAR(64) NOT NULL, name VARCHAR(128) NOT NULL, hash VARCHAR(255) NOT NULL,
    UNIQUE KEY uq_username (username)) $t");
  $p->exec("CREATE TABLE IF NOT EXISTS kv (
    k VARCHAR(64) NOT NULL PRIMARY KEY, v MEDIUMTEXT NULL) $t");
  $p->exec("CREATE TABLE IF NOT EXISTS books (
    id BIGINT NOT NULL PRIMARY KEY, pos INT NOT NULL DEFAULT 0,
    title VARCHAR(500) NULL, author VARCHAR(255) NULL, category VARCHAR(120) NULL, isbn VARCHAR(20) NULL,
    total_stock INT NULL, current_stock INT NULL, color VARCHAR(20) NULL, year VARCHAR(8) NULL,
    pages INT NULL, publisher VARCHAR(255) NULL, extra MEDIUMTEXT NULL,
    KEY idx_isbn (isbn), KEY idx_pos (pos)) $t");
  $p->exec("CREATE TABLE IF NOT EXISTS members (
    id BIGINT NOT NULL PRIMARY KEY, pos INT NOT NULL DEFAULT 0,
    name VARCHAR(255) NULL, email VARCHAR(255) NULL, phone VARCHAR(40) NULL, role VARCHAR(60) NULL,
    active_loans INT NULL, avatar TEXT NULL, username VARCHAR(64) NULL, password_hash VARCHAR(255) NULL, extra MEDIUMTEXT NULL,
    UNIQUE KEY uq_member_username (username), KEY idx_pos (pos)) $t");
  // Migrate existing installations.
  $memberCols = [];
  foreach ($p->query('SHOW COLUMNS FROM members') as $column) $memberCols[$column['Field']] = true;
  if (!isset($memberCols['username'])) $p->exec('ALTER TABLE members ADD COLUMN username VARCHAR(64) NULL');
  if (!isset($memberCols['password_hash'])) $p->exec('ALTER TABLE members ADD COLUMN password_hash VARCHAR(255) NULL');
  try { $p->exec('CREATE UNIQUE INDEX uq_member_username ON members (username)'); } catch (PDOException $e) { /* index already exists */ }
  $p->exec("CREATE TABLE IF NOT EXISTS loans (
    id VARCHAR(40) NOT NULL PRIMARY KEY, pos INT NOT NULL DEFAULT 0,
    book_id BIGINT NULL, member_id BIGINT NULL,
    issue_date VARCHAR(32) NULL, due_date VARCHAR(32) NULL, return_date VARCHAR(32) NULL, status VARCHAR(20) NULL,
    extra MEDIUMTEXT NULL,
    KEY idx_book (book_id), KEY idx_member (member_id), KEY idx_status (status), KEY idx_pos (pos)) $t");
  $p->exec("CREATE TABLE IF NOT EXISTS isbn_cache (
    isbn VARCHAR(20) NOT NULL PRIMARY KEY, data MEDIUMTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) $t");
}

// JSON anahtarı => [sütun, tip]  (i = tamsayı, s = metin)
function col_map($t) {
  static $m = [
    'books' => ['title'=>['title','s'],'author'=>['author','s'],'category'=>['category','s'],'isbn'=>['isbn','s'],
      'totalStock'=>['total_stock','i'],'currentStock'=>['current_stock','i'],'color'=>['color','s'],
      'year'=>['year','s'],'pages'=>['pages','i'],'publisher'=>['publisher','s']],
    'members' => ['name'=>['name','s'],'email'=>['email','s'],'phone'=>['phone','s'],'role'=>['role','s'],
      'activeLoans'=>['active_loans','i'],'avatar'=>['avatar','s']],
    'loans' => ['bookId'=>['book_id','i'],'memberId'=>['member_id','i'],'issueDate'=>['issue_date','s'],
      'dueDate'=>['due_date','s'],'returnDate'=>['return_date','s'],'status'=>['status','s']],
  ];
  return $m[$t];
}

// Gelen diziyi ekler/günceller. Toplu kaydetme isteğinde listede olmayan satırlar SİLİNMEZ; silme yalnızca tekil, yetkilendirilmiş CRUD endpointleriyle yapılmalıdır.
function sync_table($t, $rows) {
  $p = pdo(); $cols = col_map($t); $strId = ($t === 'loans');
  $names = array_merge(['id','pos'], array_column($cols, 0), ['extra']);
  $sql = "INSERT INTO $t (" . implode(',', $names) . ") VALUES (" . implode(',', array_fill(0, count($names), '?')) . ")"
       . " ON DUPLICATE KEY UPDATE " . implode(',', array_map(function($n){ return "$n=VALUES($n)"; }, array_slice($names, 1)));
  $st = $p->prepare($sql); $keep = []; $seen = [];
  foreach (array_values($rows) as $i => $r) {
    if (!is_array($r)) continue;
    $id = $r['id'] ?? null;
    if ($strId) { $id = ($id === null || $id === '') ? 'LN-' . random_int(1000, 999999) : (string)$id; }
    else { $id = ($id === null || $id === '') ? (int)(microtime(true) * 1000) + $i : (int)$id; }
    if (isset($seen[$id])) continue; $seen[$id] = 1; $keep[] = $id;
    $vals = [$id, $i];
    foreach ($cols as $jk => $c) {
      $v = $r[$jk] ?? null;
      $vals[] = ($v === null) ? null : ($c[1] === 'i' ? (int)$v : (is_scalar($v) ? (string)$v : json_encode($v, JSON_UNESCAPED_UNICODE)));
    }
    $extra = array_diff_key($r, $cols, ['id' => 1]);
    $vals[] = $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null;
    $st->execute($vals);
  }
  // Bilerek toplu kayıtta DELETE çalıştırmıyoruz: eski istemci/sekme tüm kayıtları silemesin.
  // Silme işlemleri book_delete/member_delete gibi tekil endpointlerden yapılır.
}

// Tabloyu eski JSON dizisiyle birebir aynı şekilde geri verir.
function read_table($t) {
  $cols = col_map($t); $strId = ($t === 'loans'); $out = [];
  foreach (pdo()->query("SELECT * FROM $t ORDER BY pos, id") as $r) {
    $o = [];
    foreach ($cols as $jk => $c) {
      $v = $r[$c[0]];
      if ($v === null) { if ($jk === 'returnDate') $o[$jk] = null; continue; }
      $o[$jk] = ($c[1] === 'i') ? (int)$v : (string)$v;
    }
    $o['id'] = $strId ? (string)$r['id'] : (int)$r['id'];
    if (!empty($r['extra'])) { $x = json_decode($r['extra'], true); if (is_array($x)) $o = array_merge($x, $o); }
    $out[] = $o;
  }
  return $out;
}

function kv_all() { $o = []; foreach (pdo()->query("SELECT k, v FROM kv") as $x) $o[$x['k']] = $x['v']; return $o; }
function kv_set($k, $v) { pdo()->prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([$k, $v]); }
function kv_del($k) { pdo()->prepare("DELETE FROM kv WHERE k = ?")->execute([$k]); }
function admins_all() { return pdo()->query("SELECT id, username, name, hash FROM admins ORDER BY pos, id")->fetchAll(); }

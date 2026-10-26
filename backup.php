<?php
// Fihrist full backup: authenticated admin only; SQL + JSON database dumps + /data files in one ZIP.
session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS'])]);
session_start();
require_once __DIR__ . '/db.php';

function backup_fail($status, $message) {
  http_response_code($status);
  header('Content-Type: text/plain; charset=utf-8');
  echo $message;
  exit;
}

if (empty($_SESSION['aid'])) {
  backup_fail(401, 'Bu yedek yalnızca yönetici oturumu ile indirilebilir.');
}
if (!class_exists('ZipArchive')) {
  backup_fail(500, 'Sunucuda PHP ZipArchive eklentisi etkin değil. Hosting desteğinden etkinleştirilmesini isteyin.');
}

try {
  $pdo = pdo();
  $adminCheck = $pdo->prepare('SELECT id FROM admins WHERE id = ? LIMIT 1');
  $adminCheck->execute([(string)$_SESSION['aid']]);
  if (!$adminCheck->fetchColumn()) {
    $_SESSION = [];
    session_destroy();
    backup_fail(401, 'Yönetici oturumu geçersiz.');
  }

  // Only fixed, application-owned table names are used in SQL identifiers.
  $tables = ['admins', 'kv', 'books', 'members', 'loans', 'isbn_cache', 'trash'];
  $sql = "-- Fihrist SQL backup\n-- Created: " . date(DATE_ATOM) . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";
  $jsonTables = [];
  foreach ($tables as $table) {
    $createRow = $pdo->query('SHOW CREATE TABLE `' . $table . '`')->fetch(PDO::FETCH_NUM);
    if (!$createRow || empty($createRow[1])) {
      throw new RuntimeException('Tablo şeması alınamadı: ' . $table);
    }
    $sql .= "DROP TABLE IF EXISTS `" . $table . "`;\n" . $createRow[1] . ";\n\n";
    $rows = $pdo->query('SELECT * FROM `' . $table . '`')->fetchAll(PDO::FETCH_ASSOC);
    $jsonTables[$table] = $rows;
    if ($rows) {
      $columns = array_keys($rows[0]);
      $quotedColumns = array_map(function($col) { return '`' . str_replace('`', '``', $col) . '`'; }, $columns);
      $sql .= 'INSERT INTO `' . $table . '` (' . implode(',', $quotedColumns) . ") VALUES\n";
      $values = [];
      foreach ($rows as $row) {
        $cells = [];
        foreach ($columns as $column) {
          $value = $row[$column];
          if ($value === null) {
            $cells[] = 'NULL';
          } elseif (is_int($value) || is_float($value)) {
            $cells[] = (string)$value;
          } else {
            $cells[] = $pdo->quote((string)$value);
          }
        }
        $values[] = '(' . implode(',', $cells) . ')';
      }
      $sql .= implode(",\n", $values) . ";\n\n";
    }
  }
  $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

  $databaseJson = json_encode([
    'app' => 'Fihrist',
    'formatVersion' => 1,
    'createdAt' => date(DATE_ATOM),
    'tables' => $jsonTables,
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_INVALID_UTF8_SUBSTITUTE);
  if ($databaseJson === false) {
    throw new RuntimeException('JSON yedeği oluşturulamadı.');
  }

  $tmpBase = tempnam(sys_get_temp_dir(), 'fihrist-backup-');
  if ($tmpBase === false) throw new RuntimeException('Geçici yedek dosyası oluşturulamadı.');
  $zipPath = $tmpBase . '.zip';
  @unlink($tmpBase);
  $zip = new ZipArchive();
  if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
    throw new RuntimeException('ZIP arşivi oluşturulamadı.');
  }
  $zip->addFromString('database.sql', $sql);
  $zip->addFromString('database.json', $databaseJson);
  $zip->addFromString('manifest.json', json_encode([
    'app' => 'Fihrist',
    'formatVersion' => 1,
    'createdAt' => date(DATE_ATOM),
    'contents' => ['database.sql', 'database.json', 'data/'],
    'note' => 'Yedek hassas veriler, yönetici parola hashleri ve veritabanında saklanan API anahtarları içerebilir. Güvenli saklayın.',
  ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

  $dataDir = __DIR__ . '/data';
  if (is_dir($dataDir)) {
    $base = realpath($dataDir);
    $iterator = new RecursiveIteratorIterator(
      new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS),
      RecursiveIteratorIterator::SELF_FIRST
    );
    foreach ($iterator as $item) {
      $path = $item->getPathname();
      // Avoid following or archiving symlinks that might point outside /data.
      if ($item->isLink()) continue;
      $relative = substr($path, strlen($base) + 1);
      $entry = 'data/' . str_replace(DIRECTORY_SEPARATOR, '/', $relative);
      if ($item->isDir()) {
        $zip->addEmptyDir(rtrim($entry, '/') . '/');
      } elseif ($item->isFile()) {
        if (!$zip->addFile($path, $entry)) throw new RuntimeException('Dosya arşive eklenemedi: ' . $relative);
      }
    }
  } else {
    $zip->addEmptyDir('data/');
  }
  if (!$zip->close()) throw new RuntimeException('ZIP arşivi tamamlanamadı.');

  if (!is_file($zipPath) || filesize($zipPath) === 0) throw new RuntimeException('ZIP yedeği boş oluşturuldu.');
  header('Content-Type: application/zip');
  header('Content-Disposition: attachment; filename="fihrist-tam-yedek-' . date('Y-m-d-His') . '.zip"');
  header('Content-Length: ' . filesize($zipPath));
  header('Cache-Control: no-store, private');
  readfile($zipPath);
  @unlink($zipPath);
  exit;
} catch (Throwable $e) {
  if (isset($zipPath) && is_file($zipPath)) @unlink($zipPath);
  error_log('Fihrist full backup error: ' . $e->getMessage());
  backup_fail(500, 'Yedek oluşturulamadı. Sunucu hata kaydını kontrol edin; hassas bilgiler ekrana yazdırılmadı.');
}

<?php
session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','secure'=>!empty($_SERVER['HTTPS'])]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
require_once __DIR__ . '/db.php';
function out($c,$v){http_response_code($c);echo json_encode($v,JSON_UNESCAPED_UNICODE);exit;}
set_exception_handler(function($e){error_log('Fihrist DB: '.$e->getMessage());out(500,['ok'=>0,'code'=>'DB_ERROR','err'=>'Veritabanı hatası']);});
function pub($S){return array_values(array_map(function($x){return ['id'=>$x['id'],'name'=>$x['name'],'username'=>$x['username']];},$S['admins']));}
function me($S){foreach($S['admins'] as $x)if($x['id']===($_SESSION['aid']??''))return $x;return null;}
function meinfo($S){$m=me($S);return $m?['id'=>$m['id'],'name'=>$m['name'],'username'=>$m['username']]:null;}
$in=json_decode(file_get_contents('php://input'),true);if(!is_array($in))$in=[];
$a=$_GET['a']??'';$post=$_SERVER['REQUEST_METHOD']=='POST';
$pdo=pdo();
if(!admins_all()) {
  // Güvenli ilk kurulum: varsayılan/parola tahmini yapılabilir hesap oluşturma.
  $initialPassword = getenv('FIHRIST_INITIAL_ADMIN_PASSWORD') ?: '';
  if (strlen($initialPassword) < 16) {
    out(503, ['ok'=>0, 'code'=>'INITIAL_SETUP_REQUIRED',
      'err'=>'İlk yönetici hesabı oluşturulmadı. Sunucuda FIHRIST_INITIAL_ADMIN_PASSWORD değişkenine en az 16 karakterlik güçlü bir parola tanımlayın.']);
  }
  $pdo->prepare("INSERT INTO admins (id,pos,username,name,hash) VALUES ('a1',0,'admin','Yönetici',?)")
      ->execute([password_hash($initialPassword, PASSWORD_DEFAULT)]);
  unset($initialPassword);
}
$kv=kv_all();
$S=[
  'admins'=>admins_all(),
  'settings'=>(($t=json_decode($kv['app_settings']??'[]',true))&&is_array($t))?$t:[],
  'theme'=>$kv['theme']??'dark',
  'isbndb_key'=>$kv['isbndb_key']??'',
  'gemini_key'=>$kv['gemini_key']??'',
];
if($a=='brand'){$st=$S['settings'];out(200,['name'=>($st['name']??'')?:'Fihrist','slogan'=>($st['slogan']??'')?:'Kütüphane Yönetimi']);}
if($a=='login'&&$post){
  $u=trim((string)($in['username']??''));$p=(string)($in['password']??'');
  foreach($S['admins'] as $x)if(strcasecmp($x['username'],$u)==0&&password_verify($p,$x['hash'])){session_regenerate_id(true);$_SESSION['aid']=$x['id'];unset($_SESSION['mid']);out(200,['ok'=>1,'role'=>'admin']);}
  $member=$pdo->prepare("SELECT id, username, password_hash FROM members WHERE username=? LIMIT 1");
  $member->execute([$u]); $mx=$member->fetch();
  if($mx && !empty($mx['password_hash']) && password_verify($p,$mx['password_hash'])){session_regenerate_id(true);$_SESSION['mid']=(string)$mx['id'];unset($_SESSION['aid']);out(200,['ok'=>1,'role'=>'member']);}
  sleep(1);out(401,['ok'=>0]);
}
if($a=='logout'){$_SESSION=[];session_destroy();out(200,['ok'=>1]);}
if($a==='get' && !empty($_SESSION['mid'])){
  $st=$pdo->prepare("SELECT id,name,email,role,username FROM members WHERE id=? LIMIT 1");
  $st->execute([(int)$_SESSION['mid']]); $member=$st->fetch();
  if(!$member){$_SESSION=[];session_destroy();out(401,['ok'=>0]);}
  $st=$pdo->prepare("SELECT l.id,l.book_id AS bookId,l.member_id AS memberId,l.issue_date AS issueDate,l.due_date AS dueDate,l.return_date AS returnDate,l.status,b.title,b.author,b.isbn FROM loans l LEFT JOIN books b ON b.id=l.book_id WHERE l.member_id=? ORDER BY l.issue_date DESC");
  $st->execute([(int)$member['id']]); $loans=$st->fetchAll();
  $outLoans=array_map(function($l){return ['id'=>$l['id'],'bookId'=>(int)$l['bookId'],'memberId'=>(int)$l['memberId'],'issueDate'=>$l['issueDate'],'dueDate'=>$l['dueDate'],'returnDate'=>$l['returnDate'],'status'=>$l['status'],'title'=>$l['title'],'author'=>$l['author'],'isbn'=>$l['isbn']];},$loans);
  out(200,['role'=>'member','member'=>['id'=>(int)$member['id'],'name'=>$member['name'],'username'=>$member['username'],'email'=>$member['email'],'role'=>$member['role']],'loans'=>$outLoans]);
}
$me=me($S);if(!$me)out(401,['ok'=>0]);
function trash_record(PDO $pdo, string $entity, $id, string $label): void {
  if(!in_array($entity,['books','members','loans','admins'],true)) throw new RuntimeException('Unsupported trash entity');
  $st=$pdo->prepare("SELECT * FROM {$entity} WHERE id=? LIMIT 1"); $st->execute([$id]); $row=$st->fetch(PDO::FETCH_ASSOC);
  if(!$row) out(404,['ok'=>0,'err'=>'Kayıt bulunamadı']);
  $pdo->prepare('INSERT INTO trash (entity,record_id,label,payload) VALUES (?,?,?,?)')->execute([$entity,(string)$id,substr($label,0,255),json_encode($row,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
  $pdo->prepare("DELETE FROM {$entity} WHERE id=?")->execute([$id]);
}
if($a==='trash_list'){
  $rows=$pdo->query('SELECT id,entity,record_id,label,deleted_at FROM trash ORDER BY deleted_at DESC,id DESC LIMIT 300')->fetchAll(PDO::FETCH_ASSOC);
  out(200,['ok'=>1,'items'=>$rows]);
}
if($a==='trash_restore'&&$post){
  $tid=(int)($in['id']??0); if(!$tid)out(400,['ok'=>0,'err'=>'Çöp kutusu kaydı gerekli']);
  $st=$pdo->prepare('SELECT * FROM trash WHERE id=? LIMIT 1'); $st->execute([$tid]); $t=$st->fetch(PDO::FETCH_ASSOC);
  if(!$t)out(404,['ok'=>0,'err'=>'Çöp kutusu kaydı bulunamadı']);
  $entity=$t['entity']; if(!in_array($entity,['books','members','loans','admins'],true))out(400,['ok'=>0,'err'=>'Geçersiz kayıt türü']);
  $row=json_decode($t['payload'],true); if(!is_array($row)||!isset($row['id']))out(500,['ok'=>0,'err'=>'Yedek kayıt okunamadı']);
  $exists=$pdo->prepare("SELECT COUNT(*) FROM {$entity} WHERE id=?"); $exists->execute([$row['id']]);
  if((int)$exists->fetchColumn()>0)out(409,['ok'=>0,'err'=>'Aynı ID mevcut; mevcut kayıtla çakışıyor.']);
  try {
    $columns=[]; foreach($pdo->query("SHOW COLUMNS FROM {$entity}") as $c)$columns[$c['Field']]=true;
    $row=array_intersect_key($row,$columns); $names=array_keys($row);
    if(!$names)out(400,['ok'=>0,'err'=>'Geri yüklenecek alan bulunamadı']);
    $quoted=array_map(fn($n)=>'`'.$n.'`',$names); $marks=array_fill(0,count($names),'?');
    $pdo->prepare('INSERT INTO `'.$entity.'` ('.implode(',',$quoted).') VALUES ('.implode(',',$marks).')')->execute(array_values($row));
    $pdo->prepare('DELETE FROM trash WHERE id=?')->execute([$tid]);
  } catch(PDOException $e) { if($e->getCode()==='23000')out(409,['ok'=>0,'err'=>'Kullanıcı adı veya benzersiz alan başka bir kayıtta kullanılıyor.']); throw $e; }
  out(200,['ok'=>1,'entity'=>$entity]);
}
if($a=='get'){
  $is_default_password = false;
  if ($me && strcasecmp($me['username'], 'admin') === 0 && password_verify('1234', $me['hash'])) {
    $is_default_password = true;
  }
  $r=['u'=>read_table('members'),'b'=>read_table('books'),'l'=>read_table('loans')];
  $r['theme']=$S['theme'];$r['s']=(object)$S['settings'];$r['admins']=pub($S);$r['me']=meinfo($S);
  $r['hasKey']=!empty($S['isbndb_key']);$r['hasGeminiKey']=!empty($S['gemini_key']);
  $r['is_default_password']=$is_default_password;
  $r['role']='admin';
  out(200,$r);
}

// ---------- Tekil CRUD Endpointleri (Race Condition Çözümü) ----------
if($a=='book_add'&&$post){
  $title=trim((string)($in['title']??''));
  $author=trim((string)($in['author']??''));
  if(!$title||!$author)out(400,['ok'=>0,'err'=>'Kitap adı ve yazar zorunludur']);
  $id=(int)($in['id']??(int)(microtime(true)*1000));
  $tot=max(1,(int)($in['totalStock']??1));
  $cur=max(0,(int)($in['currentStock']??$tot));
  $st=$pdo->prepare("INSERT INTO books (id,pos,title,author,category,isbn,total_stock,current_stock,color,year,pages,publisher) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  $st->execute([$id,0,$title,$author,(string)($in['category']??'Genel'),(string)($in['isbn']??''),$tot,$cur,(string)($in['color']??'#0070f3'),(string)($in['year']??''),(int)($in['pages']??0),(string)($in['publisher']??'')]);
  out(201,['ok'=>1,'id'=>$id]);
}

if($a=='book_update'&&$post){
  $id=(int)($in['id']??0);
  if(!$id)out(400,['ok'=>0,'err'=>'Kitap ID zorunludur']);
  $tot=max(1,(int)($in['totalStock']??1));
  $st=$pdo->prepare("SELECT COUNT(*) FROM loans WHERE book_id=? AND status IN ('ACTIVE','OVERDUE')"); $st->execute([$id]); $borrowed=(int)$st->fetchColumn();
  if($tot<$borrowed)out(400,['ok'=>0,'err'=>'Toplam stok, ödünçteki kitap sayısından az olamaz (ödünçte: '.$borrowed.')']);
  $cur=$tot-$borrowed;
  $st=$pdo->prepare('SELECT extra FROM books WHERE id=?'); $st->execute([$id]); $oldExtra=json_decode((string)($st->fetchColumn() ?: '{}'),true); if(!is_array($oldExtra))$oldExtra=[];
  $incoming=$in['extra']??[]; if(!is_array($incoming) || array_is_list($incoming) && $incoming!==[])out(400,['ok'=>0,'err'=>'Ek alanlar JSON nesnesi olmalı']);
  foreach(['id','title','author','category','isbn','totalStock','currentStock','color','year','pages','publisher'] as $reserved)unset($incoming[$reserved]);
  $extra=array_merge($oldExtra,$incoming);
  $extraJson=$extra?json_encode($extra,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR):null;
  $st=$pdo->prepare("UPDATE books SET title=?, author=?, category=?, isbn=?, total_stock=?, current_stock=?, color=?, year=?, pages=?, publisher=?, extra=? WHERE id=?");
  $st->execute([trim((string)($in['title']??'')),trim((string)($in['author']??'')),(string)($in['category']??'Genel'),(string)($in['isbn']??''),$tot,$cur,(string)($in['color']??'#0070f3'),(string)($in['year']??''),(int)($in['pages']??0),(string)($in['publisher']??''),$extraJson,$id]);
  out(200,['ok'=>1,'currentStock'=>$cur]);
}

if($a=='book_delete'&&$post){
  $id=(int)($in['id']??0);
  if(!$id)out(400,['ok'=>0,'err'=>'Kitap ID zorunludur']);
  $chk=$pdo->prepare("SELECT COUNT(*) FROM loans WHERE book_id=? AND status IN ('ACTIVE','OVERDUE')");
  $chk->execute([$id]);
  if((int)$chk->fetchColumn()>0)out(400,['ok'=>0,'err'=>'Bu kitap ödünçte olduğu için silinemez']);
  $st=$pdo->prepare('SELECT title FROM books WHERE id=?'); $st->execute([$id]); $label=(string)$st->fetchColumn();
  trash_record($pdo,'books',$id,$label ?: ('Kitap #'.$id));
  out(200,['ok'=>1]);
}

if($a=='member_add'&&$post){
  $name=trim((string)($in['name']??'')); $username=trim((string)($in['username']??'')); $password=(string)($in['password']??'');
  if(!$name)out(400,['ok'=>0,'err'=>'Üye adı zorunludur']);
  if(!preg_match('/^[a-zA-Z0-9._-]{3,64}$/',$username))out(400,['ok'=>0,'err'=>'Kullanıcı adı 3-64 karakter olmalı']);
  if(strlen($password)<10)out(400,['ok'=>0,'err'=>'Üye parolası en az 10 karakter olmalı']);
  $st=$pdo->prepare("SELECT COUNT(*) FROM members WHERE username=?"); $st->execute([$username]);
  if((int)$st->fetchColumn()>0)out(409,['ok'=>0,'err'=>'Bu üye kullanıcı adı zaten kullanılıyor']);
  $id=(int)($in['id']??(int)(microtime(true)*1000));
  $st=$pdo->prepare("INSERT INTO members (id,pos,name,email,phone,role,active_loans,avatar,username,password_hash) VALUES (?,?,?,?,?,?,0,?,?,?)");
  $st->execute([$id,0,$name,(string)($in['email']??''),(string)($in['phone']??''),(string)($in['role']??'Genel Okuyucu'),(string)($in['avatar']??''),$username,password_hash($password,PASSWORD_DEFAULT)]);
  out(201,['ok'=>1,'id'=>$id,'username'=>$username]);
}

if($a=='member_update'&&$post){
  $id=(int)($in['id']??0);
  if(!$id)out(400,['ok'=>0,'err'=>'Üye ID zorunludur']);
  $name=trim((string)($in['name']??'')); $username=trim((string)($in['username']??'')); $password=(string)($in['password']??'');
  if($name==='')out(400,['ok'=>0,'err'=>'Üye adı zorunludur']);
  if(!preg_match('/^[a-zA-Z0-9._-]{3,64}$/',$username))out(400,['ok'=>0,'err'=>'Kullanıcı adı 3-64 karakter olmalı']);
  $st=$pdo->prepare('SELECT COUNT(*) FROM members WHERE username=? AND id<>?');$st->execute([$username,$id]);if((int)$st->fetchColumn()>0)out(409,['ok'=>0,'err'=>'Bu üye kullanıcı adı zaten kullanılıyor']);
  if($password!=='' && strlen($password)<10)out(400,['ok'=>0,'err'=>'Yeni parola en az 10 karakter olmalı']);
  $sql="UPDATE members SET name=?, email=?, phone=?, role=?, username=? WHERE id=?";
  $args=[$name,(string)($in['email']??''),(string)($in['phone']??''),(string)($in['role']??'Genel Okuyucu'),$username,$id]; $pdo->prepare($sql)->execute($args);
  if($password!=='')$pdo->prepare('UPDATE members SET password_hash=? WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$id]);
  out(200,['ok'=>1]);
}

if($a=='member_delete'&&$post){
  $id=(int)($in['id']??0);
  if(!$id)out(400,['ok'=>0,'err'=>'Üye ID zorunludur']);
  $chk=$pdo->prepare("SELECT COUNT(*) FROM loans WHERE member_id=? AND status IN ('ACTIVE','OVERDUE')");
  $chk->execute([$id]);
  if((int)$chk->fetchColumn()>0)out(400,['ok'=>0,'err'=>'Bu üyenin üzerinde aktif ödünç kitap var, silinemez']);
  $st=$pdo->prepare('SELECT name FROM members WHERE id=?'); $st->execute([$id]); $label=(string)$st->fetchColumn();
  trash_record($pdo,'members',$id,$label ?: ('Üye #'.$id));
  out(200,['ok'=>1]);
}

if($a=='loan_create'&&$post){
  $book_id=(int)($in['bookId']??0);
  $member_id=(int)($in['memberId']??0);
  if(!$book_id||!$member_id)out(400,['ok'=>0,'err'=>'Kitap ve Üye seçimi zorunludur']);
  $pdo->beginTransaction();
  try{
    $stB=$pdo->prepare("SELECT current_stock FROM books WHERE id=? FOR UPDATE");
    $stB->execute([$book_id]); $stock=$stB->fetchColumn();
    if($stock===false || (int)$stock<1){$pdo->rollBack();out(400,['ok'=>0,'err'=>'Bu kitap stokta kalmadı']);}
    $stM=$pdo->prepare("SELECT active_loans FROM members WHERE id=? FOR UPDATE"); $stM->execute([$member_id]); $memberLoans=$stM->fetchColumn();
    if($memberLoans===false){$pdo->rollBack();out(404,['ok'=>0,'err'=>'Üye bulunamadı']);}
    $maxLoans=max(1,min(20,(int)($S['settings']['max']??3)));
    if((int)$memberLoans >= $maxLoans){$pdo->rollBack();out(400,['ok'=>0,'err'=>'Üye başına ödünç sınırına ulaşıldı']);}
    $pdo->prepare("UPDATE books SET current_stock=current_stock-1 WHERE id=?")->execute([$book_id]);
    $pdo->prepare("UPDATE members SET active_loans=active_loans+1 WHERE id=?")->execute([$member_id]);
    $lid='LN-'.random_int(100000,999999);
    $pdo->prepare("INSERT INTO loans (id,pos,book_id,member_id,issue_date,due_date,status) VALUES (?,0,?,?,?,?,?)")->execute([$lid,$book_id,$member_id,(string)($in['issueDate']??date('Y-m-d')),(string)($in['dueDate']??date('Y-m-d',strtotime('+14 days'))),'ACTIVE']);
    $pdo->commit();
    out(201,['ok'=>1,'id'=>$lid]);
  }catch(Throwable $e){$pdo->rollBack();throw $e;}
}

if($a==='loan_update'&&$post){
  $id=trim((string)($in['id']??'')); $issue=trim((string)($in['issueDate']??'')); $due=trim((string)($in['dueDate']??'')); $return=trim((string)($in['returnDate']??''));
  if($id===''||!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/',$issue)||!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/',$due))out(400,['ok'=>0,'err'=>'Geçerli ödünç ve son tarih girin']);
  $st=$pdo->prepare('SELECT status FROM loans WHERE id=?');$st->execute([$id]);$status=$st->fetchColumn(); if($status===false)out(404,['ok'=>0,'err'=>'Ödünç kaydı bulunamadı']);
  if($status!=='RETURNED')$return='';
  if($return!==''&&!preg_match('/^\\d{4}-\\d{2}-\\d{2}$/',$return))out(400,['ok'=>0,'err'=>'Geçerli iade tarihi girin']);
  $pdo->prepare('UPDATE loans SET issue_date=?,due_date=?,return_date=? WHERE id=?')->execute([$issue,$due,$return!==''?$return:null,$id]); out(200,['ok'=>1]);
}
if($a==='loan_delete'&&$post){
  $id=trim((string)($in['id']??'')); if($id==='')out(400,['ok'=>0,'err'=>'Ödünç ID gerekli']);
  $st=$pdo->prepare('SELECT status,book_id,member_id FROM loans WHERE id=?');$st->execute([$id]);$row=$st->fetch(PDO::FETCH_ASSOC);
  if(!$row)out(404,['ok'=>0,'err'=>'Ödünç kaydı bulunamadı']); if($row['status']!=='RETURNED')out(400,['ok'=>0,'err'=>'Aktif ödünç kayıtları silinemez. Önce kitabı iade alın.']);
  $bk=$pdo->prepare('SELECT title FROM books WHERE id=?');$bk->execute([$row['book_id']]);$book=(string)$bk->fetchColumn(); $mb=$pdo->prepare('SELECT name FROM members WHERE id=?');$mb->execute([$row['member_id']]);$member=(string)$mb->fetchColumn();
  trash_record($pdo,'loans',$id,($book?:'Kitap').' — '.($member?:'Üye').' ('.$id.')'); out(200,['ok'=>1]);
}
if($a=='loan_return'&&$post){
  $lid=(string)($in['id']??'');
  if(!$lid)out(400,['ok'=>0,'err'=>'Ödünç ID zorunludur']);
  $pdo->beginTransaction();
  try{
    $stL=$pdo->prepare("SELECT book_id, member_id, status FROM loans WHERE id=? FOR UPDATE");
    $stL->execute([$lid]);
    $row=$stL->fetch();
    if(!$row){$pdo->rollBack();out(404,['ok'=>0,'err'=>'Ödünç kaydı bulunamadı']);}
    if($row['status']!=='RETURNED'){
      $pdo->prepare("UPDATE books SET current_stock=current_stock+1 WHERE id=?")->execute([$row['book_id']]);
      $pdo->prepare("UPDATE members SET active_loans=GREATEST(0, active_loans-1) WHERE id=?")->execute([$row['member_id']]);
      $pdo->prepare("UPDATE loans SET status='RETURNED', return_date=? WHERE id=?")->execute([date('Y-m-d'),$lid]);
    }
    $pdo->commit();
    out(200,['ok'=>1]);
  }catch(Throwable $e){$pdo->rollBack();throw $e;}
}
// CSV report generated from live loan records.
if($a==='report' && ($_SERVER['REQUEST_METHOD'] ?? 'GET')==='GET'){
  header_remove('Content-Type'); header('Content-Type: text/csv; charset=utf-8');
  header('Content-Disposition: attachment; filename="fihrist-odunc-raporu-'.date('Y-m-d').'.csv"');
  echo "\xEF\xBB\xBF"; $fp=fopen('php://output','w');
  fputcsv($fp,['Ödünç ID','Kitap','Yazar','Üye','E-posta','Ödünç Tarihi','Son İade Tarihi','İade Tarihi','Durum']);
  $q=$pdo->query("SELECT l.id,b.title,b.author,m.name,m.email,l.issue_date,l.due_date,l.return_date,l.status FROM loans l LEFT JOIN books b ON b.id=l.book_id LEFT JOIN members m ON m.id=l.member_id ORDER BY l.issue_date DESC");
  while($r=$q->fetch(PDO::FETCH_NUM)) fputcsv($fp,$r);
  fclose($fp); exit;
}
if($a==='backup' && ($_SERVER['REQUEST_METHOD'] ?? 'GET')==='GET'){
  header_remove('Content-Type'); header('Content-Type: application/json; charset=utf-8');
  header('Content-Disposition: attachment; filename="fihrist-yedek-'.date('Y-m-d-His').'.json"');
  echo json_encode(['app'=>'Fihrist','version'=>1,'createdAt'=>date(DATE_ATOM),'books'=>read_table('books'),'members'=>read_table('members'),'loans'=>read_table('loans'),'settings'=>$S['settings'],'theme'=>$S['theme']],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT); exit;
}
if($a=='save'&&$post){
  $pdo->beginTransaction();
  try{
    if(isset($in['u'])&&is_array($in['u']))sync_table('members',$in['u']);
    if(isset($in['b'])&&is_array($in['b']))sync_table('books',$in['b']);
    if(isset($in['l'])&&is_array($in['l']))sync_table('loans',$in['l']);
    if(isset($in['s'])&&is_array($in['s']))kv_set('app_settings',json_encode($in['s'],JSON_UNESCAPED_UNICODE));
    kv_set('theme',(($in['theme']??'')=='light')?'light':'dark');
    $pdo->commit();
  }catch(Throwable $e){$pdo->rollBack();throw $e;}
  out(200,['ok'=>1]);
}
if($a=='admin_save'&&$post){
  $nm=trim((string)($in['name']??''));$un=trim((string)($in['username']??''));$pw=(string)($in['password']??'');$id=(string)($in['id']??'');
  if($nm===''||$un==='')out(400,['ok'=>0,'err'=>'Ad ve kullanıcı adı gerekli']);
  foreach($S['admins'] as $x)if(strcasecmp($x['username'],$un)==0&&$x['id']!==$id)out(400,['ok'=>0,'err'=>'Bu kullanıcı adı kullanılıyor']);
  if($id===''){
    if(strlen($pw)<6)out(400,['ok'=>0,'err'=>'Şifre en az 6 karakter olmalı']);
    $pdo->prepare("INSERT INTO admins (id,pos,username,name,hash) VALUES (?,?,?,?,?)")->execute([bin2hex(random_bytes(4)),count($S['admins']),$un,$nm,password_hash($pw,PASSWORD_DEFAULT)]);
  }else{
    $found=false;foreach($S['admins'] as $x)if($x['id']===$id)$found=true;
    if(!$found)out(404,['ok'=>0,'err'=>'Yönetici bulunamadı']);
    $pdo->prepare("UPDATE admins SET name=?, username=? WHERE id=?")->execute([$nm,$un,$id]);
    if($pw!==''){
      if(strlen($pw)<6)out(400,['ok'=>0,'err'=>'Şifre en az 6 karakter olmalı']);
      $pdo->prepare("UPDATE admins SET hash=? WHERE id=?")->execute([password_hash($pw,PASSWORD_DEFAULT),$id]);
    }
  }
  $S['admins']=admins_all();out(200,['ok'=>1,'admins'=>pub($S),'me'=>meinfo($S)]);
}
if($a=='admin_del'&&$post){
  $id=(string)($in['id']??'');
  if($id===$me['id'])out(400,['ok'=>0,'err'=>'Kendi hesabınızı silemezsiniz']);
  if(count($S['admins'])<2)out(400,['ok'=>0,'err'=>'En az bir yönetici kalmalı']);
  $target=null; foreach($S['admins'] as $x)if($x['id']===$id)$target=$x;
  if(!$target)out(404,['ok'=>0,'err'=>'Yönetici bulunamadı']);
  trash_record($pdo,'admins',$id,$target['name'].' (@'.$target['username'].')');
  $S['admins']=admins_all();out(200,['ok'=>1,'admins'=>pub($S)]);
}
if($a=='password'&&$post){
  $old=(string)($in['old']??'');$new=(string)($in['new']??'');
  if(!password_verify($old,$me['hash']))out(400,['ok'=>0,'err'=>'Mevcut şifre yanlış']);
  if(strlen($new)<6)out(400,['ok'=>0,'err'=>'Yeni şifre en az 6 karakter olmalı']);
  $pdo->prepare("UPDATE admins SET hash=? WHERE id=?")->execute([password_hash($new,PASSWORD_DEFAULT),$me['id']]);
  out(200,['ok'=>1]);
}

// ---------- API Key İşlemleri (Gemini & ISBNdb) ----------
if($a=='isbndb_key'&&$post){$k=trim((string)($in['key']??''));if($k==='')kv_del('isbndb_key');else kv_set('isbndb_key',$k);out(200,['ok'=>1,'hasKey'=>$k!=='']);}
if($a=='gemini_key'&&$post){$k=trim((string)($in['key']??''));if($k==='')kv_del('gemini_key');else kv_set('gemini_key',$k);out(200,['ok'=>1,'hasKey'=>$k!=='']);}

function clean_pages($val){
  if(is_numeric($val)) return max(0, (int)$val);
  if(is_string($val)){
    $d = preg_replace('/[^0-9]/', '', $val);
    return $d !== '' ? (int)$d : 0;
  }
  return 0;
}

function clean_category($raw, $subjects = []){
  $ignorePatterns = ['arborist', 'merchandising', 'root', 'series:', 'person:', 'place:', 'time:', 'subject:', 'ia:', 'id:'];

  $filterTag = function($str) use ($ignorePatterns) {
    $s = trim((string)$str);
    if($s === '') return null;
    $lower = mb_strtolower($s, 'UTF-8');
    foreach($ignorePatterns as $pat){
      if(strpos($lower, $pat) !== false) return null;
    }
    return $s;
  };

  $clean = $filterTag($raw);

  if(!$clean && !empty($subjects) && is_array($subjects)){
    foreach($subjects as $item){
      $name = is_array($item) ? ($item['name'] ?? '') : (string)$item;
      $cand = $filterTag($name);
      if($cand){
        $clean = $cand;
        break;
      }
    }
  }

  if(!$clean) return 'Genel';

  $map = [
    'fiction' => 'Roman',
    'juvenile fiction' => 'Çocuk Edebiyatı',
    'children\'s books' => 'Çocuk Edebiyatı',
    'literature' => 'Edebiyat',
    'history' => 'Tarih',
    'poetry' => 'Şiir',
    'philosophy' => 'Felsefe',
    'psychology' => 'Psikoloji',
    'science' => 'Bilim',
    'science fiction' => 'Bilim Kurgu',
    'fantasy' => 'Fantastik',
    'biography' => 'Biyografi',
    'autobiography' => 'Biyografi',
    'religion' => 'Din & İnanç',
    'classics' => 'Klasik',
    'art' => 'Sanat',
    'business' => 'İş & Ekonomi',
    'economics' => 'Ekonomi',
    'self-help' => 'Kişisel Gelişim'
  ];

  $lowerClean = mb_strtolower($clean, 'UTF-8');
  foreach($map as $en => $tr){
    if($lowerClean === $en || strpos($lowerClean, $en) !== false){
      return $tr;
    }
  }

  return mb_convert_case($clean, MB_CASE_TITLE, 'UTF-8');
}

// ===== ISBNdb API Motoru =====
function idb($path,$q=[],$post=null){
  global $S;$k=trim((string)($S['isbndb_key']??''));
  if($k==='')return [400,['errorMessage'=>'ISBNdb API anahtarı girilmemiş']];
  $url='https://api2.isbndb.com'.$path.($q?'?'.http_build_query($q):'');
  $h=['Authorization: '.$k,'Accept: application/json'];
  $ch=curl_init($url);
  curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>1,CURLOPT_TIMEOUT=>15,CURLOPT_SSL_VERIFYPEER=>0,CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4,CURLOPT_HTTPHEADER=>$h]);
  if($post!==null){curl_setopt($ch,CURLOPT_POST,1);curl_setopt($ch,CURLOPT_POSTFIELDS,$post);}
  $res=curl_exec($ch);$c=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);curl_close($ch);
  $j=json_decode((string)$res,true);
  return [$c,is_array($j)?$j:[]];
}
function nb($b){
  if(!is_array($b))return null;
  $isbn=(string)($b['isbn13']??$b['isbn']??'');
  $subj=$b['subjects']??[];$au=$b['authors']??[];
  $rawPages = $b['pages'] ?? $b['number_of_pages'] ?? $b['page_count'] ?? 0;
  $rawCat = is_array($subj) && !empty($subj) ? $subj[0] : '';
  return [
    'isbn'=>$isbn,
    'title'=>trim((string)($b['title_long']??$b['title']??'')),
    'author'=>is_array($au)?implode(', ',$au):(string)$au,
    'publisher'=>(string)($b['publisher']??''),
    'year'=>substr((string)($b['date_published']??''),0,4),
    'pages'=>clean_pages($rawPages),
    'category'=>clean_category($rawCat, $subj),
    'image'=>(string)($b['image']??''),
    'source'=>'isbndb'
  ];
}
function search_isbndb_isbn($isbn){
  global $S;
  if(empty($S['isbndb_key'])) return null;
  list($c, $j) = idb('/book/' . $isbn);
  if($c == 200 && !empty($j['book'])){
    $n = nb($j['book']);
    if($n && !empty($n['title'])) return $n;
  }
  return null;
}
function search_isbndb_title($query){
  global $S;
  if(empty($S['isbndb_key'])) return [];
  list($c, $j) = idb('/books/' . rawurlencode($query), ['pageSize' => 20]);
  if($c == 200 && !empty($j['books'])){
    $books = [];
    foreach($j['books'] as $item){
      $n = nb($item);
      if($n && !empty($n['title'])) $books[] = $n;
    }
    return $books;
  }
  return [];
}
function search_isbndb_pubbooks($pubname, $page=1){
  global $S;
  if(empty($S['isbndb_key'])) return [];
  list($c, $j) = idb('/publisher/' . rawurlencode($pubname), ['page' => $page, 'pageSize' => 50]);
  if($c != 200 || empty($j['books'])){
    list($c, $j) = idb('/books/' . rawurlencode($pubname), ['column' => 'publisher', 'page' => $page, 'pageSize' => 50]);
  }
  if($c == 200 && !empty($j['books'])){
    $books = [];
    foreach($j['books'] as $item){
      $n = nb($item);
      if($n && !empty($n['title'])) $books[] = $n;
    }
    return $books;
  }
  return [];
}

// ---------- Arama ve Veri Çekme Motoru (ISBNdb + Gemini API + Open Library + Kitapyurdu + Google Books) ----------
$UAS=[
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'
];
function isbn_norm($raw){
  $d=strtoupper(preg_replace('/[^0-9Xx]/','',(string)$raw));
  if(strlen($d)==10){ // ISBN-10 → ISBN-13
    $c=0;for($i=0;$i<9;$i++){if(!ctype_digit($d[$i]))return null;$c+=(10-$i)*(int)$d[$i];}
    $c+=($d[9]=='X')?10:(int)$d[9];if($c%11!==0)return null;
    $b='978'.substr($d,0,9);$sum=0;for($i=0;$i<12;$i++)$sum+=(int)$b[$i]*($i%2?3:1);
    return $b.((10-$sum%10)%10);
  }
  if(strlen($d)==13&&ctype_digit($d)){$sum=0;for($i=0;$i<12;$i++)$sum+=(int)$d[$i]*($i%2?3:1);return ((10-$sum%10)%10)==(int)$d[12]?$d:null;}
  return null;
}
function http_get($url,$timeout=10){
  global $UAS;$ua=$UAS[array_rand($UAS)];
  $ch=curl_init($url);
  curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>1,CURLOPT_FOLLOWLOCATION=>1,CURLOPT_MAXREDIRS=>4,CURLOPT_TIMEOUT=>$timeout,CURLOPT_CONNECTTIMEOUT=>5,
    CURLOPT_ENCODING=>'',CURLOPT_USERAGENT=>$ua,CURLOPT_SSL_VERIFYPEER=>0,CURLOPT_IPRESOLVE=>CURL_IPRESOLVE_V4,
    CURLOPT_HTTPHEADER=>['Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','Accept-Language: tr-TR,tr;q=0.9,en;q=0.5','Upgrade-Insecure-Requests: 1']]);
  $b=curl_exec($ch);$c=(int)curl_getinfo($ch,CURLINFO_HTTP_CODE);$u=(string)curl_getinfo($ch,CURLINFO_EFFECTIVE_URL);$er=curl_error($ch);curl_close($ch);
  return [$c,is_string($b)?$b:'',$u,$er];
}

// ===== Gemini API Motoru =====
function search_gemini_isbn($isbn){
  global $S;
  $k = trim((string)($S['gemini_key'] ?? ''));
  if($k === '') return null;
  $models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  $prompt = "Target ISBN: {$isbn}\nProvide detailed metadata for the book with this exact ISBN.\nReturn a single valid JSON object with strictly these keys:\n- \"title\" (string, exact book title)\n- \"author\" (string, author name(s))\n- \"publisher\" (string, publishing house / yayınevi)\n- \"year\" (string, 4-digit publication year e.g. \"2021\")\n- \"pages\" (integer, total page count e.g. 350)\n- \"category\" (string, book genre/category e.g. \"Edebiyat\", \"Roman\", \"Tarih\")\n- \"isbn\" (string, standard 13-digit ISBN)\nIf unknown or not found, set error to \"Not found\". Respond ONLY with valid JSON.";
  $payload = json_encode([
    'contents' => [['parts' => [['text' => $prompt]]]],
    'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.1]
  ], JSON_UNESCAPED_UNICODE);
  foreach($models as $m){
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'.$m.':generateContent?key='.urlencode($k);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => 1,
      CURLOPT_POST => 1,
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
      CURLOPT_TIMEOUT => 12,
      CURLOPT_SSL_VERIFYPEER => 0
    ]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if($code === 200 && $res){
      $j = json_decode($res, true);
      $txt = $j['candidates'][0]['content']['parts'][0]['text'] ?? '';
      if($txt){
        $txt = preg_replace('/^```(?:json)?\s*/i', '', trim($txt));
        $txt = preg_replace('/\s*```$/i', '', $txt);
        $b = json_decode($txt, true);
        if(is_array($b) && !empty($b['title']) && empty($b['error'])){
          return [
            'title' => trim((string)$b['title']),
            'author' => trim((string)($b['author'] ?? '')),
            'publisher' => trim((string)($b['publisher'] ?? '')),
            'year' => substr((string)($b['year'] ?? ''), 0, 4),
            'pages' => clean_pages($b['pages'] ?? 0),
            'category' => clean_category($b['category'] ?? 'Genel'),
            'image' => (string)($b['image'] ?? ''),
            'isbn' => $isbn,
            'source' => 'gemini'
          ];
        }
      }
    }
  }
  return null;
}

function search_gemini_title($query){
  global $S;
  $k = trim((string)($S['gemini_key'] ?? ''));
  if($k === '') return [];
  $models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  $prompt = "Search query: \"{$query}\"\nFind up to 10 matching books (especially Turkish literature if query is in Turkish).\nReturn a JSON array of objects, each containing:\n- \"title\" (string)\n- \"author\" (string)\n- \"publisher\" (string)\n- \"year\" (string, 4-digit year)\n- \"pages\" (integer, page count e.g. 350)\n- \"category\" (string)\n- \"isbn\" (string, 13-digit ISBN if known, else empty string)\nRespond ONLY with valid JSON array.";
  $payload = json_encode([
    'contents' => [['parts' => [['text' => $prompt]]]],
    'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2]
  ], JSON_UNESCAPED_UNICODE);
  foreach($models as $m){
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'.$m.':generateContent?key='.urlencode($k);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => 1,
      CURLOPT_POST => 1,
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
      CURLOPT_TIMEOUT => 15,
      CURLOPT_SSL_VERIFYPEER => 0
    ]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if($code === 200 && $res){
      $j = json_decode($res, true);
      $txt = $j['candidates'][0]['content']['parts'][0]['text'] ?? '';
      if($txt){
        $txt = preg_replace('/^```(?:json)?\s*/i', '', trim($txt));
        $txt = preg_replace('/\s*```$/i', '', $txt);
        $arr = json_decode($txt, true);
        if(is_array($arr)){
          $books = [];
          foreach($arr as $b){
            if(!is_array($b) || empty($b['title'])) continue;
            $books[] = [
              'title' => trim((string)$b['title']),
              'author' => trim((string)($b['author'] ?? '')),
              'publisher' => trim((string)($b['publisher'] ?? '')),
              'year' => substr((string)($b['year'] ?? ''), 0, 4),
              'pages' => clean_pages($b['pages'] ?? 0),
              'category' => clean_category($b['category'] ?? 'Genel'),
              'isbn' => (string)($b['isbn'] ?? ''),
              'image' => '',
              'source' => 'gemini'
            ];
          }
          if(!empty($books)) return $books;
        }
      }
    }
  }
  return [];
}

function search_gemini_pubbooks($pubname){
  global $S;
  $k = trim((string)($S['gemini_key'] ?? ''));
  if($k === '') return [];
  $models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  $prompt = "Publisher: \"{$pubname}\"\nList 15 famous or widely published books by this publisher (especially in Turkish).\nReturn a JSON array of objects with fields: title, author, publisher, year, pages, category, isbn.\nRespond ONLY with valid JSON array.";
  $payload = json_encode([
    'contents' => [['parts' => [['text' => $prompt]]]],
    'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2]
  ], JSON_UNESCAPED_UNICODE);
  foreach($models as $m){
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'.$m.':generateContent?key='.urlencode($k);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
      CURLOPT_RETURNTRANSFER => 1,
      CURLOPT_POST => 1,
      CURLOPT_POSTFIELDS => $payload,
      CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
      CURLOPT_TIMEOUT => 15,
      CURLOPT_SSL_VERIFYPEER => 0
    ]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if($code === 200 && $res){
      $j = json_decode($res, true);
      $txt = $j['candidates'][0]['content']['parts'][0]['text'] ?? '';
      if($txt){
        $txt = preg_replace('/^```(?:json)?\s*/i', '', trim($txt));
        $txt = preg_replace('/\s*```$/i', '', $txt);
        $arr = json_decode($txt, true);
        if(is_array($arr)){
          $books = [];
          foreach($arr as $b){
            if(!is_array($b) || empty($b['title'])) continue;
            $books[] = [
              'title' => trim((string)$b['title']),
              'author' => trim((string)($b['author'] ?? '')),
              'publisher' => $pubname,
              'year' => substr((string)($b['year'] ?? ''), 0, 4),
              'pages' => clean_pages($b['pages'] ?? 0),
              'category' => clean_category($b['category'] ?? 'Genel'),
              'isbn' => (string)($b['isbn'] ?? ''),
              'image' => '',
              'source' => 'gemini'
            ];
          }
          if(!empty($books)) return $books;
        }
      }
    }
  }
  return [];
}

// ===== Open Library API Motoru =====
function search_openlibrary_isbn($isbn){
  $url = 'https://openlibrary.org/api/books?bibkeys=ISBN:'.$isbn.'&format=json&jscmd=data';
  list($c, $h) = http_get($url, 8);
  if($c == 200 && $h){
    $j = json_decode($h, true);
    $key = 'ISBN:'.$isbn;
    if(!empty($j[$key])){
      $b = $j[$key];
      $title = trim((string)($b['title'] ?? ''));
      if($title !== ''){
        $authors = [];
        if(!empty($b['authors']) && is_array($b['authors'])){
          foreach($b['authors'] as $a){ if(!empty($a['name'])) $authors[] = $a['name']; }
        }
        $pubs = [];
        if(!empty($b['publishers']) && is_array($b['publishers'])){
          foreach($b['publishers'] as $p){ if(!empty($p['name'])) $pubs[] = $p['name']; }
        }
        $year = '';
        if(!empty($b['publish_date'])){
          if(preg_match('/\b(19|20)\d{2}\b/', $b['publish_date'], $m)) $year = $m[0];
        }
        $rawPages = $b['number_of_pages'] ?? $b['pagination'] ?? $b['pages'] ?? 0;
        $cover = (string)($b['cover']['large'] ?? $b['cover']['medium'] ?? $b['cover']['small'] ?? '');
        $subj = [];
        if(!empty($b['subjects']) && is_array($b['subjects'])){
          foreach($b['subjects'] as $s){ if(!empty($s['name'])) $subj[] = $s['name']; }
        }
        return [
          'title' => $title,
          'author' => implode(', ', $authors),
          'publisher' => implode(', ', $pubs),
          'year' => $year,
          'pages' => clean_pages($rawPages),
          'category' => clean_category('', $subj),
          'image' => $cover,
          'isbn' => $isbn,
          'source' => 'openlibrary'
        ];
      }
    }
  }
  return null;
}

function search_openlibrary_title($query){
  $url = 'https://openlibrary.org/search.json?q='.urlencode($query).'&limit=10';
  list($c, $h) = http_get($url, 10);
  if($c != 200 || !$h) return [];
  $j = json_decode($h, true);
  $docs = $j['docs'] ?? [];
  $books = [];
  foreach($docs as $doc){
    if(empty($doc['title'])) continue;
    $authors = $doc['author_name'] ?? [];
    $pubs = $doc['publisher'] ?? [];
    $isbns = $doc['isbn'] ?? [];
    $coverId = $doc['cover_i'] ?? null;
    $cover = $coverId ? "https://covers.openlibrary.org/b/id/{$coverId}-M.jpg" : '';
    $rawPages = $doc['number_of_pages_median'] ?? $doc['number_of_pages'] ?? 0;
    $subjects = $doc['subject'] ?? [];
    $books[] = [
      'title' => (string)$doc['title'],
      'author' => is_array($authors) ? implode(', ', array_slice($authors, 0, 3)) : (string)$authors,
      'publisher' => is_array($pubs) ? implode(', ', array_slice($pubs, 0, 2)) : (string)$pubs,
      'year' => (string)($doc['first_publish_year'] ?? ''),
      'pages' => clean_pages($rawPages),
      'category' => clean_category('', $subjects),
      'isbn' => !empty($isbns[0]) ? (string)$isbns[0] : '',
      'image' => $cover,
      'source' => 'openlibrary'
    ];
  }
  return $books;
}

// ===== Kitapyurdu Kazıma ve Google Books =====
function parse_ky_book($html,$url=''){
  $d=new DOMDocument();libxml_use_internal_errors(true);
  $d->loadHTML('<?xml encoding="UTF-8">'.$html);libxml_clear_errors();
  $x=new DOMXPath($d);
  $title='';$isbn='';$author='';$publisher='';$year='';$pages=0;$img='';$category='';
  foreach($x->query('//script[@type="application/ld+json"]') as $sc){
    $j=json_decode(trim($sc->textContent),true);if(!$j)continue;
    $nodes=isset($j['@graph'])?$j['@graph']:(isset($j[0])?$j:[$j]);
    foreach($nodes as $n){
      $t=$n['@type']??'';if(is_array($t))$t=implode(',',$t);
      if(stripos($t,'Book')!==false||stripos($t,'Product')!==false){
        if(!empty($n['name']))$title=trim((string)$n['name']);
        if(!empty($n['isbn']))$isbn=(string)$n['isbn'];
        else if(!empty($n['gtin13']))$isbn=(string)$n['gtin13'];
        if(!empty($n['numberOfPages']))$pages=clean_pages($n['numberOfPages']);
        if(!empty($n['author'])){
          $au=$n['author'];$author=is_array($au)?($au['name']??implode(', ',array_filter(array_column($au,'name')))):(string)$au;
        }
        if(!empty($n['publisher'])){
          $pb=$n['publisher'];$publisher=is_array($pb)?($pb['name']??''):(string)$pb;
        }else if(!empty($n['brand'])){
          $br=$n['brand'];$publisher=is_array($br)?($br['name']??''):(string)$br;
        }
        if(!empty($n['datePublished']))$year=substr((string)$n['datePublished'],0,4);
        if(!empty($n['image']))$img=(string)$n['image'];
      }
    }
  }
  if($pages == 0 && $html){
    if(preg_match('/Sayfa\s*Sayısı\s*:\s*<\/td>\s*<td[^>]*>\s*(\d+)/i', $html, $pm)){
      $pages = (int)$pm[1];
    } else if(preg_match('/Sayfa\s*Sayısı\s*:\s*(\d+)/i', $html, $pm)){
      $pages = (int)$pm[1];
    } else if(preg_match('/class=["\']sayfa["\'][^>]*>\s*(\d+)/i', $html, $pm)){
      $pages = (int)$pm[1];
    }
  }
  if($title===''){
    $q=function($e)use($x){$n=$x->query($e);return $n&&$n->length?trim(preg_replace('/\s+/u',' ',$n->item(0)->textContent)):'';};
    $title=$q('//meta[@property="og:title"]/@content')?:$q('//h1');
    $img=$q('//meta[@property="og:image"]/@content');
  }
  if($title==='')return null;
  return ['title'=>$title,'isbn'=>$isbn,'author'=>$author,'publisher'=>$publisher,'year'=>$year,'pages'=>clean_pages($pages),'image'=>$img,'category'=>clean_category($category),'source'=>'kitapyurdu'];
}

function search_ky_books($query,$maxResults=15){
  list($c,$h,$u,$err)=http_get('https://www.kitapyurdu.com/index.php?route=product/search&filter_name='.urlencode($query));
  if($c!=200||!$h)return [];
  preg_match_all('#href=["\']([^"\']*/kitap/[^"\']*)["\']#i',$h,$m);
  $rawUrls=$m[1]??[];$urls=[];
  foreach($rawUrls as $ru){
    if(strpos($ru,'http')!==0)$ru='https://www.kitapyurdu.com'.(strpos($ru,'/')===0?'':'/').$ru;
    $clean=preg_replace('/\?.*$/','',$ru);
    if(!in_array($clean,$urls))$urls[]=$clean;
  }
  $books=[];
  foreach(array_slice($urls,0,$maxResults) as $url){
    list($c2,$h2)=http_get($url);
    if($c2==200&&$h2){
      $b=parse_ky_book($h2,$url);
      if($b)$books[]=$b;
    }
  }
  return $books;
}

function search_google_books($query,$maxResults=20){
  list($c,$h)=http_get('https://www.googleapis.com/books/v1/volumes?q='.urlencode($query).'&printType=books&maxResults='.$maxResults);
  if($c!=200||!$h)return [];
  $j=json_decode($h,true);
  $items=$j['items']??[];$books=[];
  foreach($items as $it){
    $v=$it['volumeInfo']??[];
    $ids=$v['industryIdentifiers']??[];
    $isbnObj=null;
    foreach($ids as $idItem){
      if(($idItem['type']??'')=='ISBN_13'||($idItem['type']??'')=='ISBN_10'){$isbnObj=$idItem;break;}
    }
    $isbn=$isbnObj?$isbnObj['identifier']:'';
    if(!$isbn&&!empty($v['title']))$isbn='GB-'.md5($v['title']);
    if(empty($v['title']))continue;
    $au=$v['authors']??[];
    $rawPages = $v['pageCount'] ?? $v['printedPageCount'] ?? 0;
    $books[]=[
      'title'=>$v['title'].(!empty($v['subtitle'])?': '.$v['subtitle']:''),
      'isbn'=>$isbn,
      'author'=>is_array($au)?implode(', ',$au):(string)$au,
      'publisher'=>(string)($v['publisher']??''),
      'year'=>substr((string)($v['publishedDate']??''),0,4),
      'pages'=>clean_pages($rawPages),
      'image'=>(string)($v['imageLinks']['thumbnail']??$v['imageLinks']['smallThumbnail']??''),
      'category'=>clean_category($v['categories'][0] ?? ''),
      'source'=>'google'
    ];
  }
  return $books;
}

function cache_get($isbn){
  $st=pdo()->prepare("SELECT data FROM isbn_cache WHERE isbn=? AND updated_at > (NOW() - INTERVAL 30 DAY)");$st->execute([$isbn]);
  $d=$st->fetchColumn();if($d===false)return null;$j=json_decode($d,true);return is_array($j)?$j:null;
}
function cache_put($isbn,$v){
  try{pdo()->prepare("INSERT INTO isbn_cache (isbn,data,updated_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE data=VALUES(data), updated_at=NOW()")->execute([$isbn,json_encode($v,JSON_UNESCAPED_UNICODE)]);}catch(Throwable $e){}
}

if($a=='title'){
  $q=trim((string)($_GET['q']??''));
  if(mb_strlen($q)<2)out(400,['ok'=>0,'code'=>'BAD_QUERY','err'=>'Kitap adı en az 2 karakter olmalı']);
  try{
    $idbBooks = search_isbndb_title($q);
    $gemini = search_gemini_title($q);
    $ol = search_openlibrary_title($q);
    $ky = search_ky_books($q, 8);
    $gb = search_google_books($q, 10);
    $seen = []; $merged = [];
    foreach(array_merge($idbBooks, $gemini, $ol, $ky, $gb) as $b){
      $key = $b['isbn'] ?: mb_strtolower($b['title'], 'UTF-8');
      if(isset($seen[$key])) continue;
      $seen[$key] = 1; $merged[] = $b;
    }
    out(200,['ok'=>1,'books'=>$merged]);
  }catch(Throwable $e){out(502,['ok'=>0,'code'=>'SOURCE_ERROR','err'=>'Arama yapılırken hata oluştu']);}
}

if($a=='isbn'){
  $rawIsbn=$_GET['isbn']??'';
  $isbn=isbn_norm($rawIsbn);
  if(!$isbn)out(400,['ok'=>0,'code'=>'INVALID_ISBN','err'=>'Geçersiz ISBN formatı']);
  try{
    $b=cache_get($isbn);

    // 1. ISBNdb API (Öncelikli: Key tanımlı ise ISBNdb'den çeker)
    if(!$b && !empty($S['isbndb_key'])){
      $b = search_isbndb_isbn($isbn);
    }

    // 2. Gemini API (Key tanımlı ise)
    if(!$b && !empty($S['gemini_key'])){
      $b = search_gemini_isbn($isbn);
    }

    // 3. Open Library API (Ücretsiz ve Key gerektirmez)
    if(!$b){
      $b = search_openlibrary_isbn($isbn);
    }

    // 4. Kitapyurdu Kazıma
    if(!$b){
      $ky = search_ky_books($isbn, 1);
      if(!empty($ky[0])) $b = $ky[0];
    }

    // 5. Google Books
    if(!$b){
      $gb = search_google_books('isbn:'.$isbn, 1);
      if(!empty($gb[0])) $b = $gb[0];
    }

    // Eksik alan tamamlama (Yayınevi, Sayfa sayısı vb. boş geldiyse diğer motorlardan tamamlama yapılır)
    if($b && (empty($b['pages']) || empty($b['publisher']) || empty($b['author']) || empty($b['year']))){
      $sources = [];
      if(!empty($S['isbndb_key']) && ($b['source'] ?? '') !== 'isbndb') $sources[] = search_isbndb_isbn($isbn);
      if(!empty($S['gemini_key']) && ($b['source'] ?? '') !== 'gemini') $sources[] = search_gemini_isbn($isbn);
      if(($b['source'] ?? '') !== 'openlibrary') $sources[] = search_openlibrary_isbn($isbn);

      foreach($sources as $alt){
        if(!$alt) continue;
        if(empty($b['author']) && !empty($alt['author'])) $b['author'] = $alt['author'];
        if(empty($b['publisher']) && !empty($alt['publisher'])) $b['publisher'] = $alt['publisher'];
        if(empty($b['pages']) && !empty($alt['pages'])) $b['pages'] = clean_pages($alt['pages']);
        if(empty($b['year']) && !empty($alt['year'])) $b['year'] = $alt['year'];
        if(empty($b['category']) && !empty($alt['category'])) $b['category'] = clean_category($alt['category']);
        if(empty($b['image']) && !empty($alt['image'])) $b['image'] = $alt['image'];
      }
    }

    if($b){
      $b['isbn']=$isbn;
      cache_put($isbn,$b);
      out(200,['ok'=>1,'book'=>$b]);
    }
    out(404,['ok'=>0,'code'=>'NOT_FOUND','err'=>'Kitap bulunamadı']);
  }catch(Throwable $e){out(502,['ok'=>0,'code'=>'SOURCE_ERROR','err'=>'Kaynak sitelere ulaşılamadı: '.$e->getMessage()]);}
}

if($a=='pubs'){
  $q=trim((string)($_GET['q']??''));if($q==='')out(400,['ok'=>0,'err'=>'Arama kelimesi girilmedi']);
  $presets=['Çamlıca Yayınları','Çamlıca Çocuk Yayınları','Hasbahçe Yayınları','Yedi Kıta','İnsan ve Hayat','Fazilet Neşriyat','Semerkand Yayınları','TÜBİTAK Yayınları','Diyanet İşleri Başkanlığı','Timaş Yayınları','Yapı Kredi Yayınları','Can Yayınları','İş Bankası Kültür Yayınları'];
  $matched=[];
  foreach($presets as $p){
    if(mb_stripos($p,$q,0,'UTF-8')!==false||mb_stripos($q,$p,0,'UTF-8')!==false)$matched[]=$p;
  }
  if(empty($matched))$matched[]=$q;
  out(200,['ok'=>1,'names'=>array_values(array_unique($matched))]);
}

if($a=='pubbooks'){
  $nm=trim((string)($_GET['name']??''));$pg=max(1,(int)($_GET['page']??1));
  if($nm==='')out(400,['ok'=>0,'err'=>'Yayınevi adı gerekli']);
  try{
    $idbBooks = search_isbndb_pubbooks($nm, $pg);
    $gemini = search_gemini_pubbooks($nm);
    $ol = search_openlibrary_title($nm);
    $ky = search_ky_books($nm, 15);
    $gb = search_google_books('inpublisher:"'.$nm.'"', 15);
    $seen=[];$merged=[];
    foreach(array_merge($idbBooks,$gemini,$ol,$ky,$gb) as $b){
      $k=$b['isbn']?:mb_strtolower($b['title'],'UTF-8');
      if(isset($seen[$k]))continue;
      $seen[$k]=1;$merged[]=$b;
    }
    out(200,['ok'=>1,'books'=>$merged,'more'=>count($merged)>=15]);
  }catch(Throwable $e){
    out(502,['ok'=>0,'err'=>'Yayınevi kitapları getirilirken hata oluştu: '.$e->getMessage()]);
  }
}

out(404,['ok'=>0,'err'=>'Bilinmeyen istek']);

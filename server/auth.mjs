// アプリ全体を1つのパスワードで保護する仕組み。
//
// パスワードは scrypt でハッシュ化してSQLiteに保存し、平文は残さない。
// ログインが通るとランダムなセッショントークンを発行し、httpOnly Cookieで
// やり取りする。将来インターネットに公開することを想定して、総当たり対策の
// 簡易レート制限とセッションの有効期限も入れてある。
import crypto from 'node:crypto';

/** セッションの有効期限（日数）。 */
const SESSION_DAYS = 30;
/** 同一IPからの連続失敗をこの回数まで許し、超えたら一時的に締め出す。 */
const MAX_ATTEMPTS = 5;
/** 締め出す時間（ミリ秒）。 */
const LOCKOUT_MS = 60_000;

const SCRYPT_KEYLEN = 64;
export const COOKIE_NAME = 'fv_session';

/** IPごとのログイン失敗記録（プロセス内メモリのみ）。 */
const attempts = new Map();

export function initAuthTables(db) {
  // パスワードは1つだけなので id = 1 の単一行に固定する。
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
}

/** パスワードが未設定なら false（初回セットアップ待ち）。 */
export function isConfigured(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM app_auth').get().n > 0;
}

const hash = (password, salt) =>
  crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');

/** パスワードを設定（初回）または変更する。 */
export function setPassword(db, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(
    'INSERT INTO app_auth (id, password_hash, salt, updated_at) VALUES (1, ?, ?, ?) ' +
      'ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, ' +
      'salt = excluded.salt, updated_at = excluded.updated_at',
  ).run(hash(password, salt), salt, new Date().toISOString());
}

/** 保存済みハッシュと突き合わせる。比較はタイミング攻撃に強い方法で行う。 */
export function verifyPassword(db, password) {
  const row = db.prepare('SELECT password_hash, salt FROM app_auth WHERE id = 1').get();
  if (!row) return false;
  const candidate = Buffer.from(hash(password, row.salt), 'hex');
  const stored = Buffer.from(row.password_hash, 'hex');
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

/** 連続失敗しているIPかどうか。締め出し中なら残り秒数を返す。 */
export function checkRateLimit(ip) {
  const rec = attempts.get(ip);
  if (!rec || rec.count < MAX_ATTEMPTS) return { blocked: false };
  const elapsed = Date.now() - rec.last;
  if (elapsed >= LOCKOUT_MS) {
    attempts.delete(ip);
    return { blocked: false };
  }
  return { blocked: true, retryAfterSec: Math.ceil((LOCKOUT_MS - elapsed) / 1000) };
}

export function recordFailure(ip) {
  const rec = attempts.get(ip) ?? { count: 0, last: 0 };
  rec.count += 1;
  rec.last = Date.now();
  attempts.set(ip, rec);
}

export function clearFailures(ip) {
  attempts.delete(ip);
}

/** セッションを発行してトークンを返す。 */
export function createSession(db) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400_000);
  db.prepare('INSERT INTO sessions (token, created_at, expires_at) VALUES (?, ?, ?)').run(
    token,
    now.toISOString(),
    expires.toISOString(),
  );
  // ついでに期限切れを掃除しておく。
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
  return { token, expires };
}

export function isValidSession(db, token) {
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token = ?').get(token);
  return row != null && row.expires_at > new Date().toISOString();
}

export function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** すべてのセッションを無効化する（パスワード変更時に使う）。 */
export function deleteAllSessions(db) {
  db.exec('DELETE FROM sessions');
}

/** Cookieヘッダから目的の値だけ取り出す（cookie-parserを足さずに済ませる）。 */
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/** Set-Cookie を組み立てる。HTTPS運用時は SECURE_COOKIE=1 を設定する。 */
export function sessionCookie(token, expires) {
  const secure = process.env.SECURE_COOKIE === '1' ? '; Secure' : '';
  const expiresPart = expires ? `; Expires=${expires.toUTCString()}` : '; Max-Age=0';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${secure}${expiresPart}`;
}

/**
 * 認証を要求するミドルウェア。未設定・未ログインなら401を返し、
 * クライアントはログイン画面を出す。
 */
export function requireAuth(db) {
  return (req, res, next) => {
    if (!isConfigured(db)) {
      return res.status(401).json({ error: 'setup_required' });
    }
    if (!isValidSession(db, readCookie(req, COOKIE_NAME))) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  };
}

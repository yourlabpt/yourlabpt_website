/**
 * A person editing their own account.
 *
 * Kept apart from the administrator's user editor on purpose. An administrator decides
 * who someone is on the platform — role, access, whether the account is active. A person
 * decides only what describes them and how they sign in. So this accepts exactly the
 * fields a person owns and ignores the rest, and changing the password asks for the
 * current one: a session left open on a shared computer must not be enough to take the
 * account over.
 *
 * Pure: it mutates the user record it is given and returns what changed. The route owns
 * the store, the activity log and the sessions.
 */

// What a person may change about themselves. Anything else in the body is ignored.
const PROFILE_FIELDS = ['name', 'email', 'phone', 'company', 'jobTitle'];

const TEXT_MAX = 120;
const PASSWORD_MIN = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d\s().-]{0,32}$/;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function limited(value, label) {
  const result = text(value);
  if (result.length > TEXT_MAX) throw new Error(`${label} pode ter no máximo ${TEXT_MAX} caracteres.`);
  return result;
}

/**
 * Applies a person's own changes to their user record.
 *
 * @param user     the stored user record, mutated in place
 * @param body     the request body; only PROFILE_FIELDS and the password pair are read
 * @param context  { users, verifyPassword, hashPassword, now }
 * @returns { changed: string[] }
 */
function applyOwnProfile(user, body = {}, context = {}) {
  const { users = [], verifyPassword, hashPassword, now = new Date().toISOString() } = context;
  const input = body && typeof body === 'object' ? body : {};
  const changed = [];

  const set = (field, value) => {
    if ((user[field] || '') === value) return;
    user[field] = value;
    changed.push(field);
  };

  if (typeof input.name === 'string') {
    const name = limited(input.name, 'O nome');
    if (!name) throw new Error('O nome não pode ficar vazio.');
    set('name', name);
  }

  if (typeof input.email === 'string') {
    const email = text(input.email).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw new Error('Introduza um email válido.');
    if (users.some((entry) => entry.id !== user.id && entry.email === email)) {
      throw new Error('Já existe uma conta com este email.');
    }
    set('email', email);
  }

  if (typeof input.phone === 'string') {
    const phone = text(input.phone);
    if (!PHONE_PATTERN.test(phone)) throw new Error('O telefone só pode ter números, espaços e + ( ) - .');
    set('phone', phone);
  }

  if (typeof input.company === 'string') set('company', limited(input.company, 'A empresa'));
  if (typeof input.jobTitle === 'string') set('jobTitle', limited(input.jobTitle, 'A função'));

  const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
  if (newPassword) {
    // An account made through Google has no password yet. Its first one needs only the
    // signed-in session, as there is no current password to ask for.
    if (user.passwordHash) {
      const current = typeof input.currentPassword === 'string' ? input.currentPassword : '';
      if (!current || typeof verifyPassword !== 'function' || !verifyPassword(user.passwordHash, current)) {
        throw new Error('A password actual não está certa.');
      }
    }
    if (newPassword.length < PASSWORD_MIN) {
      throw new Error(`A nova password deve ter pelo menos ${PASSWORD_MIN} caracteres.`);
    }
    user.passwordHash = hashPassword(newPassword);
    changed.push('password');
  }

  if (changed.length) user.updatedAt = now;
  return { changed };
}

module.exports = { applyOwnProfile, PROFILE_FIELDS, PASSWORD_MIN };

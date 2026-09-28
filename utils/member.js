const FAVORITES = ['Jisoo', 'Jennie', 'Rosé', 'Lisa', 'OT4 / All Members'];

function cleanText(value, maxLength, { multiline = false } = {}) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\r\n?/g, '\n');
  const cleaned = multiline
    ? normalized.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
    : normalized.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return cleaned.trim().slice(0, maxLength + 1);
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateMember(body, { creating = false } = {}) {
  const values = {
    first_name: cleanText(body.first_name, 60),
    last_name: cleanText(body.last_name, 60),
    email: cleanText(body.email, 254).toLowerCase(),
    birthdate: cleanText(body.birthdate, 10),
    gender: cleanText(body.gender, 40),
    country: cleanText(body.country, 80),
    city: cleanText(body.city, 80),
    favorite_member: cleanText(body.favorite_member, 30),
    profile_picture_url: cleanText(body.profile_picture_url, 500),
    short_bio: cleanText(body.short_bio, 500, { multiline: true }),
  };
  const password = typeof body.password === 'string' ? body.password : '';
  const errors = [];

  for (const [key, label, max] of [
    ['first_name', 'First name', 60], ['last_name', 'Last name', 60],
    ['country', 'Country', 80], ['city', 'City', 80],
  ]) {
    if (!values[key] || values[key].length > max) errors.push(`${label} is required and must be ${max} characters or fewer.`);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) {
    errors.push('Enter a valid email address.');
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!validDate(values.birthdate) || values.birthdate < '1900-01-01' || values.birthdate > today) {
    errors.push('Enter a valid birthdate between 1900 and today.');
  }
  if (!FAVORITES.includes(values.favorite_member)) errors.push('Choose a favorite BLACKPINK member.');
  if (values.gender.length > 40) errors.push('Gender must be 40 characters or fewer.');
  if (values.short_bio.length > 500) errors.push('Bio must be 500 characters or fewer.');

  if (values.profile_picture_url) {
    try {
      const url = new URL(values.profile_picture_url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid URL');
    } catch {
      errors.push('Profile picture must be a valid http or https URL.');
    }
    if (values.profile_picture_url.length > 500) errors.push('Profile picture URL must be 500 characters or fewer.');
  }
  if (creating && (password.length < 12 || password.length > 128)) {
    errors.push('Initial password must be between 12 and 128 characters.');
  }

  return { values, password, errors };
}

function calculateAge(birthdate, today = new Date()) {
  const [year, month, day] = birthdate.split('-').map(Number);
  let age = today.getUTCFullYear() - year;
  if (today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)) age--;
  return age;
}

function memberId(id) {
  return `BP-${String(id).padStart(5, '0')}`;
}

module.exports = { FAVORITES, validateMember, calculateAge, memberId };

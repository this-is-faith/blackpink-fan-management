const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMember, calculateAge } = require('../utils/member');

const validMember = {
  first_name: 'Mina', last_name: 'Park', email: ' Mina@Example.com ',
  birthdate: '2000-05-10', gender: '', country: 'Singapore', city: 'Singapore',
  favorite_member: 'Lisa', profile_picture_url: '', short_bio: 'First line\r\nSecond line',
  password: 'a-long-password',
};

test('member validation cleans text while preserving bio lines', () => {
  const result = validateMember(validMember, { creating: true });
  assert.deepEqual(result.errors, []);
  assert.equal(result.values.email, 'mina@example.com');
  assert.equal(result.values.short_bio, 'First line\nSecond line');
});

test('member validation rejects impossible dates, invalid choices, URLs, and short passwords', () => {
  const invalid = validateMember({
    ...validMember, birthdate: '2024-02-30', favorite_member: 'Someone else',
    profile_picture_url: 'javascript:alert(1)', password: 'short',
  }, { creating: true });
  assert.equal(invalid.errors.length, 4);
  assert.match(invalid.errors.join(' '), /birthdate/);
  assert.match(invalid.errors.join(' '), /favorite/);
  assert.match(invalid.errors.join(' '), /http or https/);
  assert.match(invalid.errors.join(' '), /password/);
});

test('age changes on the birthday', () => {
  assert.equal(calculateAge('2000-09-28', new Date('2026-09-27T12:00:00Z')), 25);
  assert.equal(calculateAge('2000-09-28', new Date('2026-09-28T12:00:00Z')), 26);
});

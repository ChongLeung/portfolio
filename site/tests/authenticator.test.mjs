import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeBase32,
  pairingUri,
  parseTotpUri,
  totp,
} from '../lib/authenticator.ts';
// Public RFC 6238 test-vector material, never a real account credential.
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const config = {
  issuer: 'Example',
  account: 'test',
  secret,
  algorithm: 'SHA-1',
  digits: 8,
  period: 30,
};
test('RFC 6238 SHA-1 published vectors', async () => {
  for (const [time, expected] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])
    assert.equal(await totp(config, time * 1000), expected);
});
test('RFC 6238 SHA-256 and SHA-512 published vectors', async () => {
  const base32 = (text) => {
    let bits = [...Buffer.from(text)]
      .map((byte) => byte.toString(2).padStart(8, '0'))
      .join('');
    bits = bits.padEnd(Math.ceil(bits.length / 5) * 5, '0');
    return bits
      .match(/.{5}/g)
      .map((part) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(part, 2)])
      .join('');
  };
  const times = [
    59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000,
  ];
  for (const [algorithm, length, expected] of [
    [
      'SHA-256',
      32,
      ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'],
    ],
    [
      'SHA-512',
      64,
      ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'],
    ],
  ])
    for (let i = 0; i < times.length; i++)
      assert.equal(
        await totp(
          {
            ...config,
            algorithm,
            secret: base32('1234567890'.repeat(7).slice(0, length)),
          },
          times[i] * 1000,
        ),
        expected[i],
      );
});
test('pairing URI round-trips issuer, Unicode label and parameters', () => {
  const value = {
    ...config,
    account: 'Example 世界',
    algorithm: 'SHA-256',
    digits: 6,
    period: 60,
  };
  assert.deepEqual(parseTotpUri(pairingUri(value)), value);
});
test('pairing rejects foreign schemes, mismatched issuers and unknown parameters', () => {
  for (const value of [
    `https://example.test/?secret=${secret}`,
    `otpauth://hotp/Example?secret=${secret}`,
    `otpauth://totp/A:test?secret=${secret}&issuer=B`,
    `otpauth://totp/test?secret=${secret}&unknown=1`,
    `otpauth://totp/test?secret=${secret}&period=0`,
    `otpauth://totp/test?secret=${secret}&digits=7`,
    `otpauth://totp/test?secret=${secret}&secret=${secret}`,
  ])
    assert.throws(() => parseTotpUri(value));
});
test('Base32 rejects malformed and undersized values', () => {
  for (const value of [
    '',
    '0000000000000000',
    'ABC',
    'A'.repeat(1025),
    secret + 'B',
  ])
    assert.throws(() => decodeBase32(value));
  assert.equal(decodeBase32(secret).length, 20);
});
test('TOTP rejects invalid time and unsupported parameters', async () => {
  await assert.rejects(totp(config, -1));
  await assert.rejects(totp({ ...config, digits: 12 }, 0));
  await assert.rejects(totp({ ...config, period: 0 }, 0));
});

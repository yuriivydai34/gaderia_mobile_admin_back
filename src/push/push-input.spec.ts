import { BadRequestException } from '@nestjs/common';
import { normalizePushInput } from './push-input';

describe('normalizePushInput', () => {
  it('keeps title, body and trims them', () => {
    expect(
      normalizePushInput({ title: '  Заголовок  ', body: ' Текст ' }),
    ).toEqual({
      title: 'Заголовок',
      body: 'Текст',
      image: null,
      account_id: null,
    });
  });

  it('rejects a missing title or body', () => {
    expect(() => normalizePushInput({ body: 'x' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizePushInput({ title: 'x' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizePushInput({})).toThrow(BadRequestException);
  });

  it('caps title and body length', () => {
    expect(() =>
      normalizePushInput({ title: 'x'.repeat(101), body: 'b' }),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizePushInput({ title: 't', body: 'x'.repeat(501) }),
    ).toThrow(BadRequestException);
  });

  it('takes an http(s) image, rejects anything else', () => {
    expect(
      normalizePushInput({
        title: 't',
        body: 'b',
        image: 'https://example.com/x.jpg',
      }).image,
    ).toBe('https://example.com/x.jpg');
    expect(
      normalizePushInput({
        title: 't',
        body: 'b',
        image: 'http://example.com/x.jpg',
      }).image,
    ).toBe('http://example.com/x.jpg');
    expect(() =>
      normalizePushInput({
        title: 't',
        body: 'b',
        image: 'javascript:alert(1)',
      }),
    ).toThrow(BadRequestException);
    expect(
      normalizePushInput({ title: 't', body: 'b', image: '' }).image,
    ).toBeNull();
  });

  it('takes a positive integer account_id, as number or text', () => {
    expect(
      normalizePushInput({ title: 't', body: 'b', account_id: 42 }).account_id,
    ).toBe(42);
    expect(
      normalizePushInput({ title: 't', body: 'b', account_id: '42' })
        .account_id,
    ).toBe(42);
    expect(() =>
      normalizePushInput({ title: 't', body: 'b', account_id: 0 }),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizePushInput({ title: 't', body: 'b', account_id: -1 }),
    ).toThrow(BadRequestException);
    expect(() =>
      normalizePushInput({ title: 't', body: 'b', account_id: 'abc' }),
    ).toThrow(BadRequestException);
  });

  it('a missing body object is a 400, not a TypeError', () => {
    expect(() =>
      normalizePushInput(undefined as unknown as Record<string, unknown>),
    ).toThrow(BadRequestException);
  });
});

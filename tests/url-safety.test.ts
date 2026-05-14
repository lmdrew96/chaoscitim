import { describe, it, expect } from 'vitest';
import { assertSafeUrl } from '../lib/url-extract';

function safe(url: string) {
  expect(() => assertSafeUrl(new URL(url))).not.toThrow();
}

function blocked(url: string) {
  expect(() => assertSafeUrl(new URL(url))).toThrow('URL target is not permitted.');
}

describe('assertSafeUrl', () => {
  it('allows public https URLs', () => {
    safe('https://ro.wikipedia.org/wiki/Romania');
    safe('https://example.com/article');
    safe('https://blog.example.org/post/123');
  });

  it('allows public http URLs', () => {
    safe('http://example.com/article');
  });

  it('rejects non-http protocols', () => {
    expect(() => assertSafeUrl(new URL('ftp://example.com'))).toThrow('http or https');
    expect(() => assertSafeUrl(new URL('file:///etc/passwd'))).toThrow('http or https');
  });

  it('rejects localhost', () => {
    blocked('http://localhost/');
    blocked('http://localhost:8080/secret');
  });

  it('rejects IPv4 loopback', () => {
    blocked('http://127.0.0.1/');
    blocked('http://127.0.0.2/');
    blocked('http://127.255.255.255/');
  });

  it('rejects AWS IMDS / link-local', () => {
    blocked('http://169.254.169.254/latest/meta-data/');
    blocked('http://169.254.0.1/');
  });

  it('rejects RFC1918 private ranges', () => {
    blocked('http://10.0.0.1/');
    blocked('http://10.255.255.255/');
    blocked('http://172.16.0.1/');
    blocked('http://172.31.255.255/');
    blocked('http://192.168.1.1/');
    blocked('http://192.168.0.0/');
  });

  it('rejects 0.0.0.0', () => {
    blocked('http://0.0.0.1/');
  });

  it('rejects .local and .internal hostnames', () => {
    blocked('http://myserver.local/');
    blocked('http://db.internal/');
    blocked('http://service.localdomain/');
  });

  it('rejects known metadata hostnames', () => {
    blocked('http://metadata.google.internal/computeMetadata/v1/');
  });

  it('rejects IPv6 loopback', () => {
    blocked('http://[::1]/');
  });

  it('rejects IPv6 link-local', () => {
    blocked('http://[fe80::1]/');
    blocked('http://[FE80::abcd]/');
  });

  it('rejects IPv6 unique-local', () => {
    blocked('http://[fc00::1]/');
    blocked('http://[fd12:3456:789a::1]/');
  });
});

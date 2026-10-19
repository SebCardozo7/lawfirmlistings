#!/usr/bin/env node
/**
 * A script that opens a URL must import scripts/_tls.py.
 *
 * Python has no certificate authorities on the machine this pipeline runs on:
 * ssl.get_default_verify_paths().cafile is None, Python does not read the Windows store, and
 * nothing had put a bundle where OpenSSL looks. Every HTTPS request from every crawler failed
 * with CERTIFICATE_VERIFY_FAILED, and failed quietly, because fetch() reports a transport error
 * the same way it reports a host that does not exist. 170 firms were recorded as sites we could
 * not reach. All of them answer 200 to curl from the same machine.
 *
 * _tls.py fixes it for every script that imports it, and its import does nothing visible at the
 * call site, which makes it precisely the import somebody removes while tidying. This refuses
 * that. It is cheaper than finding out again in six months from a number that looks like 170
 * law firms with broken websites.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = 'scripts';
const OPENS_URL = /\burlopen\s*\(/;
const IMPORTS_TLS = /^import _tls\b/m;

const problems = [];
let checked = 0;

for (const name of readdirSync(DIR).sort()) {
  if (!name.endsWith('.py') || name === '_tls.py') continue;
  const src = readFileSync(path.join(DIR, name), 'utf8');
  if (!OPENS_URL.test(src)) continue;
  checked += 1;
  if (!IMPORTS_TLS.test(src)) {
    problems.push(`${name} calls urlopen() and does not import _tls, so every HTTPS request `
      + 'it makes will fail to verify a certificate and be recorded as an unreachable site.');
  }
}

// The module itself has to keep doing the one thing it exists for.
const tls = readFileSync(path.join(DIR, '_tls.py'), 'utf8');
if (!/_create_default_https_context/.test(tls)) {
  problems.push('_tls.py no longer patches the default HTTPS context, which is what reaches '
    + 'the scripts that build no context of their own.');
}
if (!/SSL_CERT_FILE/.test(tls)) {
  problems.push('_tls.py no longer sets SSL_CERT_FILE, which is what reaches code that reads '
    + 'the environment rather than taking a context.');
}

if (problems.length) {
  console.error(problems.map(p => `  ${p}`).join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`${checked} script(s) open URLs, and every one of them imports _tls.`);

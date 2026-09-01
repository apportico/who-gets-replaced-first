/**
 * Cached fetchers for World Bank and ILOSTAT. Node built-ins only.
 *
 * 0007 R9: the Python here was "standard library only, no pip installs". The
 * Node equivalent is zero runtime dependencies -- `fetch` and `node:zlib` are
 * native on Node 24, so nothing new enters `package.json`.
 *
 * The cache layout under `pipeline/raw/` is unchanged, so a checkout that
 * already has the 80MB response cache keeps working offline and free across
 * the port. That is not a nicety: R3 verifies the port against exactly those
 * cached bytes, so a cache the TypeScript could not read would destroy the
 * only strong evidence this spec has.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as C from './config.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Mutable, because the golden-master test repoints it at a temp copy of the
 * fixture cache exactly as the Python suite reassigned `fetch.RAW`.
 */
export const state = { RAW: path.join(HERE, 'raw') };

const UA = { 'User-Agent': 'global-labor-pipeline/1.0 (research; contact via repo)' };
const DELAY = 500; // be polite between live calls

function log(msg: string): void {
  process.stdout.write(`  ${msg}\n`);
}

function sleep(ms: number): void {
  // Synchronous, because the whole pipeline is: making one function async
  // would make every caller async up to `main`, which is a restructuring the
  // port's Non-goals rule out. Only reached on a live fetch, never on a cache
  // hit, so it costs nothing on the offline path this spec is verified over.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Fetch url to dest, using the cached file when present. */
export function get(url: string, dest: string, retries = 3): string {
  if (existsSync(dest) && statSync(dest).size > 0) {
    log(`cached  ${path.basename(dest)}`);
    return dest;
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const body = fetchSync(url);
      writeFileSync(dest, body);
      log(`fetched ${path.basename(dest)} (${body.length.toLocaleString('en-US')} bytes)`);
      sleep(DELAY);
      return dest;
    } catch (e) {
      const wait = 2 ** attempt;
      log(`retry ${attempt + 1}/${retries} after error: ${e} (sleep ${wait}s)`);
      sleep(wait * 1000);
    }
  }
  throw new Error(`failed to fetch ${url}`);
}

/**
 * A blocking fetch, so the ported call graph keeps the Python's shape.
 *
 * `fetch()` is a promise, and the pipeline is a straight-line script. Rather
 * than colour every function async, the request runs in a worker and this
 * thread waits on it -- the same trade the `sleep` above makes, and reached
 * only when the cache misses.
 */
function fetchSync(url: string): Buffer {
  const script = `
    const res = await fetch(${JSON.stringify(url)}, {
      headers: ${JSON.stringify(UA)},
      signal: AbortSignal.timeout(300000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
    const buf = Buffer.from(await res.arrayBuffer());
    process.stdout.write(buf);
  `;
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    maxBuffer: 1024 * 1024 * 1024,
    encoding: 'buffer',
  });
}

/** The cache holds raw bytes; a `.gz` entry is the fixture form. */
function readCached(dest: string): string {
  const raw = readFileSync(dest);
  if (raw[0] === 0x1f && raw[1] === 0x8b) return gunzipSync(raw).toString('utf8');
  return raw.toString('utf8');
}

// ------------------------------------------------------------- World Bank
export interface WbCountry {
  id: string;
  iso2Code?: string;
  name: string;
  region: { id: string; value: string };
  incomeLevel: { id: string; value: string };
  capitalCity?: string;
  latitude?: string;
  longitude?: string;
}

/** ISO3, name, region, income group, capital lat/lon for every WB area. */
export function wbCountryMetadata(): WbCountry[] {
  const dest = path.join(state.RAW, 'worldbank', 'countries.json');
  const url = `${C.WB_API}/country?format=json&per_page=400`;
  get(url, dest);
  const payload = JSON.parse(readCached(dest));
  return payload[1];
}

export interface WbObservation {
  countryiso3code?: string;
  date: string;
  value: number | null;
}

/** All areas x all years for one indicator, following pagination. */
export function wbIndicator(code: string): WbObservation[] {
  const pages: WbObservation[] = [];
  let page = 1;
  for (;;) {
    const dest = path.join(state.RAW, 'worldbank', `${code}_p${page}.json`);
    const url =
      `${C.WB_API}/country/all/indicator/${code}` +
      `?format=json&date=${C.WB_DATE_RANGE}&per_page=15000&page=${page}`;
    get(url, dest);
    const payload = JSON.parse(readCached(dest));
    if (!Array.isArray(payload) || payload.length < 2 || payload[1] === null) break;
    pages.push(...payload[1]);
    if (page >= (payload[0].pages ?? 1)) break;
    page += 1;
  }
  return pages;
}

// ---------------------------------------------------------------- ILOSTAT
/** Bulk SDMX-CSV pull for one confirmed ILOSTAT dataflow. */
export function iloFlow(name: string): string {
  const entry = C.ILO_FLOWS.get(name);
  if (!entry) throw new Error(`unknown ILO flow ${name}`);
  const [flow, version, key, start] = entry;
  const dest = path.join(state.RAW, 'ilostat', `${flow}.csv`);
  const url = `${C.ILO_SDMX},${flow},${version}/${key}?format=csv&startPeriod=${start}`;
  get(url, dest);
  return dest;
}

/** Read a cached file, transparently gunzipping the fixture form. */
export function readCache(dest: string): string {
  return readCached(dest);
}

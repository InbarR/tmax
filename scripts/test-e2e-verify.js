/**
 * End-to-end verification script for the auto-update flow.
 * Exercises the same logic as version-checker.ts against the local test server.
 *
 * Requires test-local-update.js to be running on port 9999.
 */
const http = require('http');

const TEST_URL = process.env.TMAX_UPDATE_TEST_URL || 'http://localhost:9999';

async function test() {
  console.log('=== Auto-Update E2E Verification ===\n');

  // Step 1: Fetch release (same as fetchLatestRelease)
  console.log('1. Fetching release from:', TEST_URL + '/releases/latest');
  const res = await fetch(TEST_URL + '/releases/latest', {
    headers: { 'User-Agent': 'tmax-update-checker' },
  });
  if (!res.ok) throw new Error('Failed to fetch release: HTTP ' + res.status);
  const release = await res.json();
  console.log('   tag_name:', release.tag_name);
  console.log('   assets:', release.assets.map(a => a.name).join(', '));

  // Step 2: Find RELEASES and nupkg (same as checkWindowsUpdate)
  const arch = process.arch;
  const releasesAsset = release.assets.find(
    a => a.name === `RELEASES-${arch}` || a.name === 'RELEASES'
  );
  const nupkgAsset = release.assets.find(a => a.name.endsWith('.nupkg'));

  if (!releasesAsset) throw new Error('No RELEASES asset found');
  if (!nupkgAsset) throw new Error('No nupkg asset found');

  console.log('\n2. Asset resolution:');
  console.log('   RELEASES:', releasesAsset.name, '->', releasesAsset.browser_download_url);
  console.log('   nupkg:', nupkgAsset.name, '->', nupkgAsset.browser_download_url);

  // Step 3: Download RELEASES content (same as downloadText)
  const relRes = await fetch(releasesAsset.browser_download_url, {
    headers: { 'User-Agent': 'tmax-update-checker' },
    redirect: 'follow',
  });
  const releasesContent = await relRes.text();
  console.log('\n3. Raw RELEASES content:');
  console.log('   ' + releasesContent.trim());

  // Step 4: Rewrite RELEASES (same logic as in checkWindowsUpdate)
  const nupkgBaseUrl = nupkgAsset.browser_download_url.substring(
    0, nupkgAsset.browser_download_url.lastIndexOf('/') + 1
  );
  const rewritten = releasesContent.split('\n').map(line => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const filename = parts[1];
      const asset = release.assets.find(a => a.name === filename);
      if (asset) parts[1] = asset.browser_download_url;
      else parts[1] = nupkgBaseUrl + filename;
    }
    return parts.join(' ');
  }).filter(Boolean).join('\n');

  console.log('\n4. Rewritten RELEASES:');
  console.log('   ' + rewritten);

  // Step 5: Start feed server (same as startFeedServer)
  const feedServer = http.createServer((req, res) => {
    if (req.url === '/RELEASES' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(rewritten);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  await new Promise(resolve => feedServer.listen(0, '127.0.0.1', resolve));
  const port = feedServer.address().port;
  console.log('\n5. Feed server started on port', port);

  // Step 6: Simulate Squirrel.Windows fetching /RELEASES
  const squirrelRes = await fetch(`http://127.0.0.1:${port}/RELEASES`);
  const squirrelContent = await squirrelRes.text();
  console.log('\n6. Squirrel would receive:');
  console.log('   ' + squirrelContent.trim());

  // Step 7: Validate RELEASES format
  console.log('\n7. Validating RELEASES format...');
  const lines = squirrelContent.trim().split('\n');
  let allPassed = true;

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      console.log('   FAIL: line has < 3 parts:', line);
      allPassed = false;
      continue;
    }

    const [sha, url, size] = parts;

    // Check SHA1
    const sha1ok = /^[0-9A-Fa-f]{40}$/.test(sha);
    console.log('   SHA1 hash:', sha1ok ? 'PASS' : 'FAIL', `(${sha.substring(0, 10)}..., length=${sha.length})`);
    if (!sha1ok) allPassed = false;

    // Check URL is absolute
    const urlOk = url.startsWith('http://') || url.startsWith('https://');
    console.log('   URL absolute:', urlOk ? 'PASS' : 'FAIL', `(${url.substring(0, 60)}...)`);
    if (!urlOk) allPassed = false;

    // Check size is numeric
    const sizeOk = /^\d+$/.test(size);
    console.log('   Size numeric:', sizeOk ? 'PASS' : 'FAIL', `(${size})`);
    if (!sizeOk) allPassed = false;

    // Check nupkg is actually downloadable
    const headRes = await fetch(url, { method: 'HEAD' });
    const downloadOk = headRes.status === 200;
    const contentLen = headRes.headers.get('content-length');
    console.log('   Downloadable:', downloadOk ? 'PASS' : 'FAIL',
      `(HTTP ${headRes.status}, ${(parseInt(contentLen) / 1024 / 1024).toFixed(1)} MB)`);
    if (!downloadOk) allPassed = false;

    // Check size matches Content-Length
    const sizeMatch = contentLen === size;
    console.log('   Size matches:', sizeMatch ? 'PASS' : 'FAIL',
      `(RELEASES=${size}, actual=${contentLen})`);
    if (!sizeMatch) allPassed = false;
  }

  feedServer.close();

  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('ALL CHECKS PASSED');
    console.log('Squirrel.Windows would successfully parse this RELEASES');
    console.log('file and download the nupkg for update installation.');
  } else {
    console.log('SOME CHECKS FAILED');
    process.exit(1);
  }
  console.log('='.repeat(50));
}

test().catch(e => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});

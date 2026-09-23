const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('kids-3d-playgrand/index.html', 'utf8');
const facadeSource = fs.readFileSync('shared/for-my-sons.js', 'utf8');

test('cloud restore validates and prepares before replacing the current scene', () => {
  const prepare = source.indexOf('remotePrepared=prepareSnapshotRestore(project)');
  const mark = source.indexOf('remoteApplied=true', prepare);
  const commit = source.indexOf("commitPreparedSnapshot(remotePrepared", mark);
  const persist = source.indexOf('localStorage.setItem(SAVE_KEY,JSON.stringify(project))', commit);
  assert.ok(prepare >= 0 && mark > prepare && commit > mark && persist > commit);
});

test('cloud restore keeps an in-memory backup and rolls back on failure', () => {
  assert.match(source, /backupPrepared=prepareSnapshotRestore\(autosaveSnapshot\(\)\)/);
  assert.match(source, /if\(remoteApplied&&backupPrepared&&!backupPrepared\.committed\)/);
  assert.match(source, /commitPreparedSnapshot\(backupPrepared,'元の作品へ戻しました'\)/);
});

test('corrupt local autosave is preserved before the active key is removed', () => {
  const backup = source.indexOf('localStorage.setItem(RECOVERY_KEY,raw)');
  const remove = source.indexOf('localStorage.removeItem(SAVE_KEY)', backup);
  assert.ok(backup >= 0 && remove > backup);
  assert.match(source, /autosaveProtection=true/);
  assert.match(source, /if\(!autosaveReady\|\|autosaveProtection\)return/);
});

test('new project is the explicit path that clears both active and recovery saves', () => {
  assert.match(source, /localStorage\.removeItem\(SAVE_KEY\);localStorage\.removeItem\(RECOVERY_KEY\)/);
});


test('3D cloud saves use a dedicated per-profile file and do not write the shared profile save', () => {
  assert.match(source, /return 'profiles\/'\+profileId\+'\/apps\/'\+APP_ID\+'\/project\.json'/);
  const saveStart = source.indexOf('async function saveCloudProject()');
  const loadStart = source.indexOf('async function loadCloudProject()', saveStart);
  const saveBody = source.slice(saveStart, loadStart);
  assert.match(saveBody, /api\.sync\.readPath\(path\)/);
  assert.match(saveBody, /api\.sync\.writePathKnown\(path,built\.envelopeBytes/);
  assert.doesNotMatch(saveBody, /writeProfileApp/);
});

test('dedicated 3D save envelope is bound to profile, app and version', () => {
  assert.match(source, /parsed\.profileId!==profileId/);
  assert.match(source, /parsed\.appId!==APP_ID/);
  assert.match(source, /parsed\.version!==CLOUD_SAVE_VERSION/);
});

test('legacy embedded 3D save is read-only fallback and migration writes only the dedicated path', () => {
  const loadStart = source.indexOf('async function loadCloudProject()');
  const setupStart = source.indexOf('async function setupCloudSave()', loadStart);
  const loadBody = source.slice(loadStart, setupStart);
  assert.match(loadBody, /api\.sync\.readPath\(path\)/);
  assert.match(loadBody, /api\.sync\.readProfileApp\(profile\.id,APP_ID\)/);
  assert.match(loadBody, /api\.sync\.writePathKnown\(path,built\.envelopeBytes/);
  assert.doesNotMatch(loadBody, /writeProfileApp/);
});


test('cloud overwrite creates an immutable generation before replacing project.json', () => {
  const saveStart = source.indexOf('async function saveCloudProject()');
  const loadStart = source.indexOf('async function loadCloudProject()', saveStart);
  const saveBody = source.slice(saveStart, loadStart);
  const backupWrite = saveBody.indexOf('api.sync.writePathKnown(backupPath,current.content');
  const currentWrite = saveBody.indexOf('api.sync.writePathKnown(path,built.envelopeBytes');
  assert.ok(backupWrite >= 0 && currentWrite > backupWrite);
  assert.match(saveBody, /上書き前バックアップを作れなかったため、セーブを中止しました/);
  assert.match(saveBody, /expectAbsent:true/);
});

test('generation path is immutable and includes timestamp plus source SHA', () => {
  assert.match(source, /cloudHistoryDir\(profileId\).*history/);
  assert.match(source, /String\(sha\|\|'unknown'\)\.slice\(0,12\)/);
});

test('previous-version restore only opens history locally and does not overwrite cloud', () => {
  const historyStart = source.indexOf('async function loadPreviousCloudProject()');
  const setupStart = source.indexOf('async function setupCloudSave()', historyStart);
  const historyBody = source.slice(historyStart, setupStart);
  assert.match(historyBody, /api\.sync\.listDirectory\(cloudHistoryDir\(profile\.id\)\)/);
  assert.match(historyBody, /api\.sync\.readPath\(files\[0\]\.path\)/);
  assert.doesNotMatch(historyBody, /writePath\(/);
  assert.match(historyBody, /これを戻すなら「☁ セーブ」/);
});

test('FMS facade exposes directory listing required for generation restore', () => {
  assert.match(facadeSource, /listDirectory: path => sync\.listDirectory\(path\)/);
});


test('cloud save v2 compresses payload and verifies SHA-256 before restore', () => {
  assert.match(source, /CLOUD_SAVE_VERSION=2/);
  assert.match(source, /new CompressionStream\('gzip'\)/);
  assert.match(source, /new DecompressionStream\('gzip'\)/);
  assert.match(source, /crypto\.subtle\.digest\('SHA-256',bytes\)/);
  assert.match(source, /checksum!==parsed\.checksumSha256/);
  assert.match(source, /3Dセーブの破損を検知しました/);
});

test('cloud save enforces bounded raw and envelope sizes', () => {
  assert.match(source, /CLOUD_FILE_MAX_BYTES=900\*1024/);
  assert.match(source, /CLOUD_RAW_MAX_BYTES=8\*1024\*1024/);
  assert.match(source, /raw\.length>CLOUD_RAW_MAX_BYTES/);
  assert.match(source, /envelopeBytes\.length>CLOUD_FILE_MAX_BYTES/);
});

test('history retention is bounded and pruning is amortized', () => {
  assert.match(source, /HISTORY_LIMIT=10/);
  assert.match(source, /HISTORY_PRUNE_EVERY=5/);
  assert.match(source, /generation%HISTORY_PRUNE_EVERY!==0/);
  assert.match(source, /files\.slice\(HISTORY_LIMIT\)/);
  assert.match(source, /deletePathKnown\(item\.path,item\.sha/);
});

test('cloud save uses low-call direct writes after one current read', () => {
  const saveStart = source.indexOf('async function saveCloudProject()');
  const loadStart = source.indexOf('async function loadCloudProject()', saveStart);
  const saveBody = source.slice(saveStart, loadStart);
  assert.equal((saveBody.match(/api\.sync\.readPath\(path\)/g) || []).length, 1);
  assert.match(saveBody, /writePathKnown\(backupPath,current\.content/);
  assert.match(saveBody, /writePathKnown\(path,built\.envelopeBytes/);
});

test('FMS facade exposes low-call write and delete primitives', () => {
  assert.match(facadeSource, /writePathKnown: \(path, value, options\) => sync\.writePathKnown/);
  assert.match(facadeSource, /deletePathKnown: \(path, sha, options\) => sync\.deletePathKnown/);
});

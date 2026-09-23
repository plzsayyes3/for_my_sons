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
  assert.match(saveBody, /api\.sync\.writePath\(path,payload/);
  assert.doesNotMatch(saveBody, /writeProfileApp/);
});

test('dedicated 3D save envelope is bound to profile, app and version', () => {
  assert.match(source, /parsed\.version!==CLOUD_SAVE_VERSION/);
  assert.match(source, /parsed\.profileId!==profileId/);
  assert.match(source, /parsed\.appId!==APP_ID/);
});

test('legacy embedded 3D save is read-only fallback and migration writes only the dedicated path', () => {
  const loadStart = source.indexOf('async function loadCloudProject()');
  const setupStart = source.indexOf('async function setupCloudSave()', loadStart);
  const loadBody = source.slice(loadStart, setupStart);
  assert.match(loadBody, /api\.sync\.readPath\(path\)/);
  assert.match(loadBody, /api\.sync\.readProfileApp\(profile\.id,APP_ID\)/);
  assert.match(loadBody, /api\.sync\.writePath\(path,payload/);
  assert.doesNotMatch(loadBody, /writeProfileApp/);
});


test('cloud overwrite creates an immutable generation before replacing project.json', () => {
  const saveStart = source.indexOf('async function saveCloudProject()');
  const loadStart = source.indexOf('async function loadCloudProject()', saveStart);
  const saveBody = source.slice(saveStart, loadStart);
  const backupWrite = saveBody.indexOf('api.sync.writePath(backupPath,current.content');
  const currentWrite = saveBody.indexOf('api.sync.writePath(path,payload');
  assert.ok(backupWrite >= 0 && currentWrite > backupWrite);
  assert.match(saveBody, /上書き前バックアップを作れなかったため、セーブを中止しました/);
  assert.match(saveBody, /sha:'__absent__'/);
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

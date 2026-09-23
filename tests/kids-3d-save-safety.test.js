const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('kids-3d-playgrand/index.html', 'utf8');

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

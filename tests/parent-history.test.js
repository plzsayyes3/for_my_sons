const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const historyModule = require('../shared/parent-history-view.js');

function encoded(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

test('Papa history loads child requests, excludes papa, and sorts newest first', async () => {
  const records = {
    'requests/pending/old.json': {
      id:'request-old',
      profileId:'soma',
      appId:'sky-dash',
      gameName:'Sky Dash',
      type:'problem',
      message:'むずかしい',
      createdAt:'2026-09-27T01:00:00.000Z',
      status:'pending'
    },
    'requests/pending/new.json': {
      id:'request-new',
      profileId:'sora',
      appId:'sky-dash',
      gameName:'Sky Dash',
      type:'feature',
      message:'スピードが上がる',
      createdAt:'2026-09-27T03:57:02.910Z',
      status:'done',
      reply:{
        message:'スピードアップを作ったよ！',
        repliedAt:'2026-09-27T07:32:22.412Z',
        readAt:null
      }
    },
    'requests/pending/papa.json': {
      id:'request-papa',
      profileId:'papa',
      appId:'sky-dash',
      gameName:'Sky Dash',
      type:'feature',
      message:'test',
      createdAt:'2026-09-27T05:00:00.000Z',
      status:'pending'
    }
  };
  const api = {
    sync:{
      async listDirectory(path) {
        if (path === 'requests') return [{ name:'pending', path:'requests/pending', type:'dir' }];
        if (path === 'requests/pending') return Object.keys(records).map(path => ({
          name:path.split('/').pop(),
          path,
          type:'file'
        }));
        return [];
      },
      async readPath(path) {
        return { exists:true, content:encoded(records[path]), sha:'sha' };
      }
    }
  };

  const history = await historyModule.loadHistory(api);
  assert.deepEqual(history.map(item => item.id), ['request-new', 'request-old']);
  assert.equal(history[0].reply.message, 'スピードアップを作ったよ！');
  assert.equal(history[0].reply.readAt, null);
  assert.equal(history[0].status, 'done');
});

test('Papa history normalizes read receipts', () => {
  const record = historyModule.normalizeRecord({
    id:'request-read',
    profileId:'riku',
    appId:'wanko-war',
    gameName:'わんこ大戦争',
    type:'feature',
    message:'つよいわんこ',
    createdAt:'2026-09-27T01:00:00.000Z',
    status:'done',
    reply:{
      message:'できたよ',
      repliedAt:'2026-09-27T02:00:00.000Z',
      readAt:'2026-09-27T03:00:00.000Z'
    }
  }, 'requests/pending/read.json');
  assert.equal(record.reply.readAt, '2026-09-27T03:00:00.000Z');
  assert.equal(historyModule.STATUS_LABELS.done, '完了');
});

test('home mounts Papa-only request history UI', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('app.js', 'utf8');
  assert.match(index, /id="parent-request-history"/);
  assert.match(index, /parent-history-view\.js\?v=2/);
  assert.match(index, /app\.js\?v=4/);
  assert.match(app, /ForMySonsParentHistoryView\.mount/);
  assert.match(app, /historyView\.refresh/);
});


test('Papa can reply from history and resets child readAt', async () => {
  const remote = {
    id:'request-reply-ui',
    profileId:'sora',
    appId:'sky-dash',
    gameName:'Sky Dash',
    type:'feature',
    message:'もっとはやく',
    createdAt:'2026-09-27T01:00:00.000Z',
    status:'done',
    reply:{
      message:'前の返事',
      repliedAt:'2026-09-27T02:00:00.000Z',
      readAt:'2026-09-27T03:00:00.000Z'
    }
  };
  let written = null;
  let writeOptions = null;
  const api = {
    profile:{ async current(){ return { id:'papa' }; } },
    sync:{
      async readPath(){ return { exists:true, content:encoded(remote), sha:'sha-old' }; },
      async writePathKnown(path, value, options){
        written = { path, value };
        writeOptions = options;
        return { status:'synced', sha:'sha-new' };
      }
    }
  };
  const saved = await historyModule.saveReply(api, {
    ...remote,
    path:'requests/pending/reply.json'
  }, {
    message:'新しい返事',
    status:'working'
  });
  assert.equal(written.path, 'requests/pending/reply.json');
  assert.equal(written.value.status, 'working');
  assert.equal(written.value.reply.message, '新しい返事');
  assert.equal(written.value.reply.readAt, null);
  assert.equal(writeOptions.sha, 'sha-old');
  assert.equal(saved.status, 'working');
  assert.equal(saved.reply.readAt, null);
});

test('Papa reply writer rejects non-Papa profile', async () => {
  const api = {
    profile:{ async current(){ return { id:'sora' }; } },
    sync:{ async readPath(){ throw new Error('should not read'); }, async writePathKnown(){} }
  };
  await assert.rejects(
    historyModule.saveReply(api, { path:'requests/pending/x.json' }, { message:'返事', status:'done' }),
    /Papa profile is required/
  );
});

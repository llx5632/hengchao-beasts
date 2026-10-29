import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../scripts/publish.mjs';

function harness({ fail = '', behind = 0, staged = '', title = '更新卡牌 "标题" & $(example)', config = '', changes = 'deploy/index.html', updateImages = '' } = {}) {
  const calls = [];
  const events = [];
  let asked = 0;
  const run = (program, args, options) => {
    calls.push({ program, args, options });
    const action = args.find(arg => ['fetch', 'push', 'commit', 'add', '--test', 'scripts/build-deploy.mjs', 'scripts/compress-art.py', 'from PIL import Image'].includes(arg));
    if (action) events.push(action);
    if (action === fail) throw new Error(`Simulated ${fail} failure`);
    if (args[0] === 'branch') return 'main';
    if (args[0] === 'remote') return 'https://github.com/llx5632/hengchao-beasts.git';
    if (args.includes('--diff-filter=U')) return '';
    if (args.includes('-z')) return staged;
    if (args[0] === 'config') return config;
    if (args[0] === 'rev-list') return `${behind}\t1`;
    if (args.includes('--cached')) return changes;
    return '';
  };
  return {
    calls, events, asked: () => asked,
    execute: () => publish({ root: process.cwd(), run, proxy: () => 'http://127.0.0.1:65532',
      listTests: () => ['test/example.test.mjs'],
      askUpdateImages: async () => { events.push('ask-images'); return updateImages; },
      askTitle: async () => { events.push('ask-title'); asked++; return title; }, log: () => {} })
  };
}

test('输入1先更新图片，再询问标题、构建和推送，不执行依赖安装', async () => {
  const h = harness({ updateImages: ' 1 ' });
  assert.deepEqual(await h.execute(), { pushed: true });
  assert.deepEqual(h.events.slice(0, 4), ['ask-images', 'from PIL import Image', 'scripts/compress-art.py', 'ask-title']);
  const compress = h.calls.find(call => call.args.includes('scripts/compress-art.py'));
  assert.equal(compress.program, 'python');
  assert.deepEqual(compress.args, ['-X', 'utf8', 'scripts/compress-art.py', '1024', '85']);
  assert(h.events.indexOf('scripts/compress-art.py') < h.events.indexOf('scripts/build-deploy.mjs'));
  assert(!h.calls.some(call => call.args.includes('pip')));
});

for (const updateImages of ['', '0', '2', 'yes']) {
  test(`图片选择${JSON.stringify(updateImages)}跳过更新，直接询问标题，不调用Python`, async () => {
    const h = harness({ updateImages });
    await h.execute();
    assert.deepEqual(h.events.slice(0, 2), ['ask-images', 'ask-title']);
    assert(!h.calls.some(call => call.program === 'python'));
  });
}

for (const failure of ['from PIL import Image', 'scripts/compress-art.py']) {
  test(`${failure}失败时不询问标题，也不构建或推送`, async () => {
    const h = harness({ updateImages: '1', fail: failure });
    await assert.rejects(h.execute(), failure === 'from PIL import Image' ? /python -m pip install Pillow/ : /Simulated/);
    assert.equal(h.asked(), 0);
    assert(!h.calls.some(call => call.args.some(arg => ['fetch', 'add', 'scripts/build-deploy.mjs', 'push'].includes(arg))));
  });
}

test('更新图片后空标题取消，保留本机图片更新，不提交或推送', async () => {
  const h = harness({ updateImages: '1', title: '' });
  assert.deepEqual(await h.execute(), { cancelled: true });
  assert(h.events.includes('scripts/compress-art.py'));
  assert(!h.events.some(event => ['fetch', 'add', 'push'].includes(event)));
});

test('发布使用同一代理获取和推送，标题作为完整参数传递，截图不加入暂存', async () => {
  const h = harness();
  assert.deepEqual(await h.execute(), { pushed: true });
  for (const action of ['fetch', 'push']) {
    const call = h.calls.find(call => call.args.includes(action));
    assert.deepEqual(call.args.slice(0, 2), ['-c', 'http.proxy=http://127.0.0.1:65532']);
  }
  const commit = h.calls.find(call => call.args.includes('commit'));
  assert.deepEqual(commit.args, ['commit', '-m', '更新卡牌 "标题" & $(example)']);
  assert(!h.calls.find(call => call.args[0] === 'add').args.includes('qa'));
});

for (const failure of ['fetch', '--test', 'scripts/build-deploy.mjs', 'commit']) {
  test(`${failure} 失败时停止，不推送；检查或构建失败也不暂存`, async () => {
    const h = harness({ fail: failure });
    await assert.rejects(h.execute(), /Simulated/);
    assert(!h.calls.some(call => call.args.includes('push')));
    if (failure !== 'commit') assert(!h.calls.some(call => call.args.includes('add')));
  });
}

test('远程领先时停止，不构建、不提交、不自动合并', async () => {
  const h = harness({ behind: 1 });
  await assert.rejects(h.execute(), /远程 main/);
  assert(!h.calls.some(call => call.args.includes('scripts/build-deploy.mjs') || call.args.includes('commit') || call.args.includes('push')));
});

test('空标题取消，没有网络操作或文件变更', async () => {
  const h = harness({ title: '   ' });
  assert.deepEqual(await h.execute(), { cancelled: true });
  assert(!h.calls.some(call => call.args.includes('fetch') || call.args.includes('add')));
});

test('发布范围外的已有暂存文件阻止发布，防止混入截图', async () => {
  const h = harness({ staged: 'qa/screenshot.png\0' });
  await assert.rejects(h.execute(), /暂存区/);
  assert.equal(h.asked(), 0);
  assert(!h.calls.some(call => call.args.includes('fetch') || call.args.includes('commit')));
});

test('Git 已配置代理时保留现有设置', async () => {
  const h = harness({ config: 'http.proxy http://example:7890\nhttp.sslbackend schannel' });
  await h.execute();
  const push = h.calls.find(call => call.args.includes('push'));
  assert.equal(push.args[0], 'push');
});

test('没有新改动仍推送现有提交，支持网络恢复后重试', async () => {
  const h = harness({ changes: '' });
  await h.execute();
  assert(!h.calls.some(call => call.args.includes('commit')));
  assert(h.calls.some(call => call.args.includes('push')));
});

test('推送失败向调用者报告失败，不打印成功结果', async () => {
  const h = harness({ fail: 'push' });
  await assert.rejects(h.execute(), /Simulated push failure/);
});

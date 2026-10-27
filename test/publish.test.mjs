import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../scripts/publish.mjs';

function harness({ fail = '', behind = 0, staged = '', title = '更新卡牌 "标题" & $(example)', config = '', changes = 'deploy/index.html' } = {}) {
  const calls = [];
  let asked = 0;
  const run = (program, args, options) => {
    calls.push({ program, args, options });
    const action = args.find(arg => ['fetch', 'push', 'commit', 'add', '--test', 'scripts/build-deploy.mjs'].includes(arg));
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
    calls, asked: () => asked,
    execute: () => publish({ root: process.cwd(), run, proxy: () => 'http://127.0.0.1:65532',
      listTests: () => ['test/example.test.mjs'], askTitle: async () => { asked++; return title; }, log: () => {} })
  };
}

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

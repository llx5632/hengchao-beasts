// 双击根目录“一键发布.cmd”；仅依赖已安装的 Node.js 和 Git。
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

export const publishPaths = [
  '.github', 'deploy', 'dist', 'scripts', 'test', 'package.json',
  'README.md', 'DEPLOY.md', '.gitignore', 'server.mjs', '一键发布.cmd'
];

function command(program, args, { cwd, capture = false, env = process.env, allowMissing = false } = {}) {
  const result = spawnSync(program, args, {
    cwd, env, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  if (result.error) throw new Error(`无法运行 ${program}：${result.error.message}`);
  if (allowMissing && result.status === 1) return '';
  if (result.status !== 0) {
    throw new Error(`${program} 执行失败（退出码 ${result.status}）${capture ? `\n${result.stderr || result.stdout}` : ''}`);
  }
  return result.stdout?.trim() || '';
}

export function windowsProxy(env = process.env, run = command) {
  if (process.platform !== 'win32' || ['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy'].some(key => env[key])) return '';
  try {
    const output = run('powershell.exe', ['-NoLogo', '-NoProfile', '-Command',
      "$p=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; @{enabled=$p.ProxyEnable;server=$p.ProxyServer}|ConvertTo-Json -Compress"
    ], { capture: true });
    const settings = JSON.parse(output);
    if (settings.enabled !== 1 || !settings.server) return '';
    const server = settings.server.trim();
    const selected = server.includes('=')
      ? Object.fromEntries(server.split(';').map(part => part.trim().split('='))).https
        || Object.fromEntries(server.split(';').map(part => part.trim().split('='))).http
      : server;
    return selected ? (/^[a-z]+:\/\//i.test(selected) ? selected : `http://${selected}`) : '';
  } catch { return ''; }
}

function isPublishPath(path) {
  return publishPaths.some(entry => path === entry || path.startsWith(`${entry}/`));
}

export async function publish({
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  run = command, env = process.env, proxy = windowsProxy,
  listTests = () => readdirSync(resolve(root, 'test')).filter(name => name.endsWith('.test.mjs')).map(name => `test/${name}`),
  askTitle = async () => {
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try { return await input.question('请输入本次提交标题（直接回车取消）：'); }
    finally { input.close(); }
  },
  log = console.log
} = {}) {
  const localGit = (...args) => run('git', args, { cwd: root, capture: true, env });
  if (localGit('branch', '--show-current') !== 'main') throw new Error('请先切换到 main 分支后再发布。');
  const origin = localGit('remote', 'get-url', 'origin');
  if (!/^(https:\/\/github\.com\/|git@github\.com:)llx5632\/hengchao-beasts(?:\.git)?\/?$/.test(origin)) {
    throw new Error('origin 不是 llx5632/hengchao-beasts，请先检查仓库地址。');
  }
  if (localGit('diff', '--name-only', '--diff-filter=U')) throw new Error('存在未解决的合并冲突，请处理后再发布。');
  const staged = localGit('-c', 'core.quotePath=false', 'diff', '--cached', '--name-only', '-z').split('\0').filter(Boolean);
  if (staged.some(path => !isPublishPath(path))) throw new Error('暂存区含发布范围之外的文件，请先单独提交或取消暂存这些文件。');

  const title = String(await askTitle()).trim();
  if (!title) { log('已取消，没有执行提交或推送。'); return { cancelled: true }; }

  // 仅对本次 Git 网络命令应用代理，不改全局或仓库设置。
  const proxyArgs = [];
  if (origin.startsWith('https://')) {
    const configured = run('git', ['config', '--get-urlmatch', 'http', origin], { cwd: root, capture: true, env, allowMissing: true });
    if (!/^http\.proxy\s/m.test(configured)) {
      const detected = proxy(env);
      if (detected) { proxyArgs.push('-c', `http.proxy=${detected}`); log('本次发布使用 Windows 系统代理。'); }
    }
  }
  const networkGit = (...args) => run('git', [...proxyArgs, ...args], { cwd: root, env });
  log('\n[1/5] 检查远程分支…');
  networkGit('fetch', 'origin', 'main');
  const [behind] = localGit('rev-list', '--left-right', '--count', 'origin/main...HEAD').split(/\s+/).map(Number);
  if (behind > 0) throw new Error('远程 main 有本地尚未包含的提交。请先同步并处理可能的冲突，再重新运行。');

  log('\n[2/5] 检查游戏…');
  run(process.execPath, ['--test', ...listTests()], { cwd: root, env });
  log('\n[3/5] 打包最新版本…');
  run(process.execPath, ['scripts/build-deploy.mjs'], { cwd: root, env });
  log('\n[4/5] 提交本地更新…');
  localGit('add', '--all', '--', ...publishPaths);
  if (localGit('diff', '--cached', '--name-only')) {
    // 参数数组直接传给 Git，标题中的引号、&、中文不会交给 shell 执行。
    run('git', ['commit', '-m', title], { cwd: root, env });
  } else {
    log('没有新改动，将重试推送现有提交。');
  }
  log('\n[5/5] 推送到 GitHub…');
  networkGit('push', '-u', 'origin', 'main');
  log('\n推送成功！GitHub Actions 将自动部署网站。');
  log('查看部署结果：https://github.com/llx5632/hengchao-beasts/actions');
  log('部署成功后访问：https://llx5632.github.io/hengchao-beasts/');
  return { pushed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('衡潮群岛 · 一键提交与发布\n');
  publish().catch(error => {
    console.error(`\n发布已停止：${error.message}`);
    console.error('如果提交已完成但推送失败，本地提交仍然保留；恢复网络或登录后重新运行即可。');
    process.exitCode = 1;
  });
}

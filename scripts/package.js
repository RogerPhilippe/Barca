'use strict';
// Gera os pacotes de distribuição: node scripts/package.js [mac|win|linux|all]
const { packager } = require('@electron/packager');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const { version } = require('../package.json');

const common = {
  dir: root,
  name: 'Barca',
  out: dist,
  overwrite: true,
  asar: true,
  appCopyright: 'Copyright © 2026 Roger Philippe Pereira',
  ignore: [/^\/dist($|\/)/, /^\/scripts($|\/)/, /^\/test(-output)?($|\/)/, /^\/build($|\/)/, /^\/docs($|\/)/, /^\/\.git/, /^\/[^/]+\.md$/],
};

const run = (cmd, args, cwd = dist) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

const targets = {
  mac: {
    options: {
      platform: 'darwin',
      arch: 'arm64',
      icon: path.join(root, 'build/icon.icns'),
      appBundleId: 'org.barcaftp.barca',
      appCategoryType: 'public.app-category.utilities',
      extendInfo: path.join(root, 'build/extend-info.plist'),
    },
    archive: `Barca-${version}-macos-arm64.zip`,
    finish(appDir, archive) {
      const app = path.join(appDir, 'Barca.app');
      // O packager deixa só a assinatura do linker, sem os recursos selados; o macOS
      // trataria o app baixado como danificado. Assina o bundle inteiro (ad-hoc).
      run('codesign', ['--force', '--deep', '--sign', '-', app]);
      run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive]);
    },
  },
  win: {
    options: {
      platform: 'win32',
      arch: 'x64',
      icon: path.join(root, 'build/icon.ico'),
      win32metadata: {
        CompanyName: 'Roger Philippe Pereira',
        ProductName: 'Barca',
        FileDescription: 'Barca',
        OriginalFilename: 'Barca.exe',
      },
    },
    archive: `Barca-${version}-windows-x64.zip`,
    finish(appDir, archive) {
      run('zip', ['-qry', '-X', archive, path.basename(appDir)]);
    },
  },
  linux: {
    options: { platform: 'linux', arch: 'x64', executableName: 'barca' },
    archive: `Barca-${version}-linux-x64.tar.gz`,
    finish(appDir, archive) {
      // Sem metadados do macOS (._*, xattrs) e com dono neutro dentro do tar.
      execFileSync(
        'tar',
        ['--no-mac-metadata', '--no-xattrs', '--uid', '0', '--gid', '0', '-czf', archive, path.basename(appDir)],
        { cwd: dist, stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } },
      );
    },
  },
};

function writeChecksums() {
  const archives = fs.readdirSync(dist).filter((f) => f.startsWith(`Barca-${version}-`)).sort();
  const lines = archives.map((f) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, f))).digest('hex');
    return `${hash}  ${f}`;
  });
  fs.writeFileSync(path.join(dist, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

async function main() {
  const which = process.argv[2] || 'all';
  const names = which === 'all' ? Object.keys(targets) : [which];
  for (const name of names) {
    const target = targets[name];
    if (!target) throw new Error(`Alvo desconhecido: ${name} (use mac, win, linux ou all)`);
    const [appDir] = await packager({ ...common, ...target.options });
    fs.rmSync(path.join(dist, target.archive), { force: true });
    target.finish(appDir, target.archive);
    console.log(`✔ ${target.archive}`);
  }
  writeChecksums();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

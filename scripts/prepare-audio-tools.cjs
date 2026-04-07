const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.join(__dirname, '..');
const destRoot = path.join(repoRoot, 'audio-tools');
const destBinDir = path.join(destRoot, 'bin');
const destLibDir = path.join(destRoot, 'lib');

function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        (result.stdout || '').trim(),
        (result.stderr || '').trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return result;
}

function linkedLibraries(binaryPath) {
  const probe = runOrThrow('otool', ['-L', binaryPath]);
  return (probe.stdout || '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(' ')[0])
    .filter(Boolean);
}

function binaryRpaths(binaryPath) {
  const probe = runOrThrow('otool', ['-l', binaryPath]);
  const lines = (probe.stdout || '').split('\n');
  const rpaths = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line !== 'cmd LC_RPATH') continue;
    for (let offset = 1; offset <= 4 && index + offset < lines.length; offset += 1) {
      const candidate = lines[index + offset].trim();
      if (!candidate.startsWith('path ')) continue;
      const rawPath = candidate.split(' ')[1];
      if (rawPath) rpaths.push(rawPath);
      break;
    }
  }

  return rpaths;
}

function isSystemLibrary(link) {
  return (
    link.startsWith('@loader_path/') ||
    link.startsWith('@executable_path/') ||
    link.startsWith('/usr/lib/') ||
    link.startsWith('/System/')
  );
}

function resolveLinkedPath(binaryPath, link) {
  if (link.startsWith('/')) return link;

  if (link.startsWith('@loader_path/')) {
    return path.resolve(path.dirname(binaryPath), link.slice('@loader_path/'.length));
  }

  if (link.startsWith('@executable_path/')) {
    return path.resolve(path.dirname(binaryPath), link.slice('@executable_path/'.length));
  }

  if (link.startsWith('@rpath/')) {
    const suffix = link.slice('@rpath/'.length);
    for (const rpath of binaryRpaths(binaryPath)) {
      let resolvedBase = rpath;
      if (rpath.startsWith('@loader_path/')) {
        resolvedBase = path.resolve(path.dirname(binaryPath), rpath.slice('@loader_path/'.length));
      } else if (rpath.startsWith('@executable_path/')) {
        resolvedBase = path.resolve(path.dirname(binaryPath), rpath.slice('@executable_path/'.length));
      } else if (!path.isAbsolute(rpath)) {
        resolvedBase = path.resolve(path.dirname(binaryPath), rpath);
      }
      const candidate = path.join(resolvedBase, suffix);
      if (fs.existsSync(candidate)) return candidate;
    }

    const commonFallbacks = [
      path.join('/opt/homebrew/lib', suffix),
      path.join('/usr/local/lib', suffix),
      path.join('/opt/homebrew/opt/chromaprint/lib', suffix),
      path.join('/usr/local/opt/chromaprint/lib', suffix),
    ];
    for (const candidate of commonFallbacks) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function resolveFpcalcSource() {
  const explicit = process.env.DJ_ASSIST_FPCALC_PATH?.trim();
  const candidates = [explicit, '/opt/homebrew/bin/fpcalc', '/usr/local/bin/fpcalc'].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  const whichProbe = spawnSync('which', ['fpcalc'], { encoding: 'utf8', stdio: 'pipe' });
  if (whichProbe.status === 0) {
    const resolved = (whichProbe.stdout || '').trim();
    if (resolved && fs.existsSync(resolved)) return resolved;
  }

  throw new Error(
    [
      'No fpcalc binary found for packaging.',
      'Install Chromaprint/fpcalc locally or set DJ_ASSIST_FPCALC_PATH to a working fpcalc binary before building.',
    ].join(' '),
  );
}

function stageFileIfNeeded(sourcePath, destDir) {
  const destination = path.join(destDir, path.basename(sourcePath));
  if (!fs.existsSync(destination)) {
    fs.copyFileSync(sourcePath, destination);
    fs.chmodSync(destination, 0o755);
  }
  return destination;
}

function rewriteDependency(binaryPath, originalLink, replacementLink) {
  runOrThrow('install_name_tool', ['-change', originalLink, replacementLink, binaryPath]);
}

function rewriteOwnId(binaryPath, replacementId) {
  runOrThrow('install_name_tool', ['-id', replacementId, binaryPath]);
}

function adHocSign(targetPath) {
  runOrThrow('codesign', ['--force', '--sign', '-', targetPath]);
}

function stageDependencies(entryBinary) {
  const queue = [entryBinary];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    const currentIsLib = path.dirname(current) === destLibDir;
    for (const link of linkedLibraries(current)) {
      if (isSystemLibrary(link)) continue;

      const resolvedLink = resolveLinkedPath(current, link);
      if (!resolvedLink || !fs.existsSync(resolvedLink)) {
        throw new Error(`Unable to resolve dependency ${link} for ${current}`);
      }

      const stagedLib = stageFileIfNeeded(resolvedLink, destLibDir);
      const replacement = currentIsLib
        ? `@loader_path/${path.basename(stagedLib)}`
        : `@executable_path/../lib/${path.basename(stagedLib)}`;
      rewriteDependency(current, link, replacement);

      if (!visited.has(stagedLib)) {
        rewriteOwnId(stagedLib, `@loader_path/${path.basename(stagedLib)}`);
        queue.push(stagedLib);
      }
    }
  }
}

function verifyStagedFpcalc(binaryPath) {
  const links = linkedLibraries(binaryPath);
  const disallowed = links.filter((link) => !isSystemLibrary(link) && !link.startsWith('@executable_path/../lib/'));
  if (disallowed.length > 0) {
    throw new Error(
      [
        'Bundled fpcalc still links outside the app bundle.',
        `Binary: ${binaryPath}`,
        ...disallowed.map((link) => `- ${link}`),
      ].join('\n'),
    );
  }

  const probe = runOrThrow(binaryPath, ['-version']);
  return (probe.stdout || probe.stderr || '').trim();
}

function main() {
  const sourceFpcalc = resolveFpcalcSource();
  fs.rmSync(destRoot, { recursive: true, force: true });
  fs.mkdirSync(destBinDir, { recursive: true });
  fs.mkdirSync(destLibDir, { recursive: true });

  const stagedFpcalc = stageFileIfNeeded(sourceFpcalc, destBinDir);
  stageDependencies(stagedFpcalc);
  for (const entry of fs.readdirSync(destLibDir)) {
    const fullPath = path.join(destLibDir, entry);
    if (fs.statSync(fullPath).isFile()) {
      adHocSign(fullPath);
    }
  }
  adHocSign(stagedFpcalc);
  const version = verifyStagedFpcalc(stagedFpcalc);

  console.log(`Bundled fpcalc from ${sourceFpcalc}`);
  console.log(`Bundled fpcalc binary: ${stagedFpcalc}`);
  console.log(`fpcalc version: ${version}`);
}

main();

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { loadProjectEnv } = require('./load-env.cjs');

const repoRoot = path.join(__dirname, '..');
const destRoot = path.join(repoRoot, 'python');
const runtimeRoot = path.join(destRoot, 'runtime');

loadProjectEnv();

function resolveStandaloneRoots() {
  const explicitRoot = process.env.DJ_ASSIST_PYTHON_STANDALONE?.trim();
  const explicitExecutable = process.env.DJ_ASSIST_PYTHON_STANDALONE_PYTHON?.trim();
  const candidates = [];

  if (explicitRoot) candidates.push(explicitRoot);
  if (explicitExecutable) candidates.push(path.dirname(path.dirname(explicitExecutable)));
  candidates.push(...localStandaloneCandidates());

  return [...new Set(candidates.filter(Boolean))];
}

function localStandaloneCandidates() {
  const base = path.join(os.homedir(), '.local', 'python-build-standalone');
  const candidates = [];
  const directRoot = path.join(base, 'python');
  if (fs.existsSync(directRoot)) candidates.push(directRoot);
  if (!fs.existsSync(base)) return candidates;

  const stack = [base];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(current, entry.name);
      if (fs.existsSync(path.join(entryPath, 'bin', 'python3')) || fs.existsSync(path.join(entryPath, 'bin', 'python'))) {
        candidates.push(entryPath);
        continue;
      }
      if (fs.existsSync(path.join(entryPath, 'python', 'bin', 'python3')) || fs.existsSync(path.join(entryPath, 'python', 'bin', 'python'))) {
        candidates.push(entryPath);
        continue;
      }
      stack.push(entryPath);
    }
  }

  return candidates;
}

function findPythonExecutable(root) {
  const candidates = [
    path.join(root, 'bin', 'python3'),
    path.join(root, 'bin', 'python'),
    path.join(root, 'python', 'bin', 'python3'),
    path.join(root, 'python', 'bin', 'python'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

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

function isAllowedLinkedLibrary(link) {
  if (link.startsWith('@executable_path/') || link.startsWith('@loader_path/') || link.startsWith('@rpath/')) return true;
  if (link.startsWith('/usr/lib/') || link.startsWith('/System/')) return true;
  return false;
}

function verifyStandaloneInterpreter(executable) {
  const probe = runOrThrow(executable, ['-c', 'import sys; print(sys.version)']);
  const links = linkedLibraries(executable);
  const disallowedLinks = links.filter((link) => !isAllowedLinkedLibrary(link));

  if (disallowedLinks.length > 0) {
    throw new Error(
      [
        'The provided Python runtime is not self-contained.',
        `Interpreter: ${executable}`,
        'These linked libraries point outside the future app bundle:',
        ...disallowedLinks.map((link) => `- ${link}`),
        'Use a relocatable Python distribution, such as a python-build-standalone unpacked runtime.',
      ].join('\n'),
    );
  }

  return (probe.stdout || '').trim();
}

function resolveStandaloneSource() {
  for (const root of resolveStandaloneRoots()) {
    const executable = findPythonExecutable(root);
    if (!executable) continue;
    const version = verifyStandaloneInterpreter(executable);
    return { root, executable, version };
  }

  throw new Error(
    [
      'No self-contained Python runtime found for packaging.',
      'Set DJ_ASSIST_PYTHON_STANDALONE to an unpacked relocatable Python root,',
      'or set DJ_ASSIST_PYTHON_STANDALONE_PYTHON to its interpreter path.',
      `A local cache at ${path.join(os.homedir(), '.local', 'python-build-standalone')} is also checked automatically.`,
      'Do not point this at a Homebrew virtualenv.',
    ].join(' '),
  );
}

function copyStandaloneRuntime(sourceRoot) {
  fs.rmSync(destRoot, { recursive: true, force: true });
  fs.mkdirSync(destRoot, { recursive: true });
  fs.cpSync(sourceRoot, runtimeRoot, {
    recursive: true,
    dereference: false,
    force: true,
    preserveTimestamps: true,
  });

  normalizeRuntimeSymlinks(sourceRoot, runtimeRoot);
}

function normalizeRuntimeSymlinks(sourceRoot, copiedRoot) {
  const stack = [copiedRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }

      if (!entry.isSymbolicLink()) continue;

      const rawTarget = fs.readlinkSync(entryPath);
      const resolvedTarget = path.isAbsolute(rawTarget)
        ? rawTarget
        : path.resolve(path.dirname(entryPath), rawTarget);

      if (resolvedTarget.startsWith(sourceRoot)) {
        const relativeWithinSource = path.relative(sourceRoot, resolvedTarget);
        const mappedTarget = path.join(copiedRoot, relativeWithinSource);
        const relativeLink = path.relative(path.dirname(entryPath), mappedTarget);
        fs.rmSync(entryPath, { force: true });
        fs.symlinkSync(relativeLink, entryPath);
        continue;
      }

      if (!resolvedTarget.startsWith(copiedRoot)) {
        const tmpPath = `${entryPath}.real`;
        fs.copyFileSync(resolvedTarget, tmpPath);
        fs.rmSync(entryPath, { force: true });
        fs.renameSync(tmpPath, entryPath);
      }
    }
  }
}

function installIntoBundledRuntime(runtimePython) {
  runOrThrow(runtimePython, ['-m', 'pip', '--version'], { cwd: repoRoot });
  runOrThrow(runtimePython, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], { cwd: repoRoot });
  runOrThrow(runtimePython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: repoRoot });
}

function verifyBundledEnvironment(runtimePython) {
  const imports = runOrThrow(
    runtimePython,
    [
      '-c',
      [
        'import click',
        'import librosa',
        'import mutagen',
        'import requests',
        'import rich',
        'import tqdm',
        'import sqlalchemy',
        'import dj_assist.cli',
        'print("ok")',
      ].join('; '),
    ],
    { cwd: repoRoot },
  );

  if (!(imports.stdout || '').includes('ok')) {
    throw new Error(`Bundled Python environment verification failed for ${runtimePython}`);
  }

  const links = linkedLibraries(runtimePython);
  const disallowedLinks = links.filter((link) => !isAllowedLinkedLibrary(link));
  if (disallowedLinks.length > 0) {
    throw new Error(
      [
        'The staged runtime interpreter is not relocatable.',
        `Interpreter: ${runtimePython}`,
        ...disallowedLinks.map((link) => `- ${link}`),
      ].join('\n'),
    );
  }
}

function main() {
  const { root, executable, version } = resolveStandaloneSource();
  copyStandaloneRuntime(root);
  const runtimePython = findPythonExecutable(runtimeRoot);
  if (!runtimePython) {
    throw new Error(`Copied runtime is missing its interpreter under ${runtimeRoot}`);
  }

  installIntoBundledRuntime(runtimePython);
  verifyBundledEnvironment(runtimePython);

  console.log(`Bundled self-contained Python runtime from ${root}`);
  console.log(`Source interpreter: ${executable}`);
  console.log(`Source version: ${version}`);
  console.log(`Bundled runtime root: ${runtimeRoot}`);
  console.log(`Bundled runtime interpreter: ${runtimePython}`);
}

main();

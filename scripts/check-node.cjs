const [major] = process.versions.node.split('.').map(Number);

if (major < 20 || major >= 25) {
  console.error(
    [
      `Unsupported Node.js version: ${process.versions.node}`,
      'Use Node 20, 22, or 24 for this project.',
      'Node 25 is producing broken Next.js server chunks in this repo.',
    ].join('\n'),
  );
  process.exit(1);
}

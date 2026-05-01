import { NextRequest, NextResponse } from 'next/server';
import { rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bulkTrackAction, getTracksByIds } from '@/lib/db';
import { resolveWorkingPython } from '@/lib/scan';

export const runtime = 'nodejs';
const execFileAsync = promisify(execFile);
const BULK_REANALYZE_ART_TIMEOUT_MS = 45000;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map((value: unknown) => parseInt(String(value), 10)).filter((value: number) => Number.isFinite(value)) : [];
  const action = String(body.action ?? '');
  const deleteFiles = Boolean(body.deleteFiles);
  if (!ids.length) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }
  if (!['ignore', 'unignore', 'add_tags', 'remove_tags', 'clear_tags', 'add_to_set', 'delete', 'reanalyze_art'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  if (action === 'reanalyze_art') {
    const force = Boolean(body.force);
    const python = await resolveWorkingPython();
    const results: Array<Record<string, unknown>> = [];
    for (const id of ids) {
      try {
        const { stdout, stderr } = await execFileAsync(
          python,
          ['-m', 'dj_assist.cli', 'reanalyze-art', String(id), ...(force ? ['--force'] : []), '--json-output'],
          {
            cwd: process.cwd(),
            env: process.env,
            timeout: BULK_REANALYZE_ART_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
          },
        );
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(stdout || '{}') as Record<string, unknown>;
        } catch {
          parsed = { ok: true, track_id: id, message: String(stdout || '').trim() };
        }
        results.push({
          id,
          ok: true,
          message: String(parsed.message ?? 'Artwork refresh complete.'),
          debug: {
            stdout: parsed,
            stderr: String(stderr || '').trim(),
          },
        });
      } catch (error) {
        const execError = error as Error & { stdout?: string; stderr?: string; signal?: string; code?: number };
        results.push({
          id,
          ok: false,
          message: execError.message || 'Unable to refresh artwork.',
          debug: {
            code: execError?.code ?? null,
            signal: execError?.signal ?? null,
            stdout: String(execError?.stdout ?? '').trim(),
            stderr: String(execError?.stderr ?? '').trim(),
          },
        });
      }
    }
    const successCount = results.filter((item) => item.ok).length;
    return NextResponse.json({
      ok: successCount > 0,
      results,
      processed: results.length,
      succeeded: successCount,
      failed: results.length - successCount,
    });
  }

  if (action === 'delete' && deleteFiles) {
    const tracks = await getTracksByIds(ids);
    const filePaths = [...new Set(tracks.map((track) => String(track.path ?? '').trim()).filter(Boolean))];
    try {
      await Promise.all(filePaths.map((filePath) => rm(filePath, { force: true })));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete one or more files from disk.';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const result = await bulkTrackAction({
      ids,
      action: action as Parameters<typeof bulkTrackAction>[0]['action'],
      tags: Array.isArray(body.tags) ? body.tags.map((value: unknown) => String(value).trim()).filter(Boolean) : [],
      setId: body.setId ? parseInt(String(body.setId), 10) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bulk track action failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

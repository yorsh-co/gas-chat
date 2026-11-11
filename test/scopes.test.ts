import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Apps Script derives a project's OAuth scopes by scanning its code for
 * service names, so one reference here would ask every consumer for an extra
 * scope. Only `UrlFetchApp` (`script.external_request`) and `CacheService`
 * (`script.storage`) are intended.
 */
const FORBIDDEN = [
  'SpreadsheetApp',
  'DocumentApp',
  'SlidesApp',
  'FormApp',
  'DriveApp',
  'GmailApp',
  'MailApp',
  'CalendarApp',
  'Session',
  'ScriptApp',
  'PropertiesService',
];

/** Every shipped `.ts` source: all of `src/` except `internal/` and `.d.ts`. */
function shippedSources(directory = join(ROOT, 'src')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return relative(join(ROOT, 'src'), path) === 'internal'
        ? []
        : shippedSources(path);
    }
    return path.endsWith('.ts') && !path.endsWith('.d.ts') ? [path] : [];
  });
}

/** Identifier names referenced in `source`; comments and strings are excluded. */
function identifiers(source: string): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(
    ts.createSourceFile(
      'source.ts',
      source,
      ts.ScriptTarget.ES2020,
      true,
      ts.ScriptKind.TS,
    ),
  );
  return names;
}

describe('OAuth scopes', () => {
  const files = shippedSources();
  const referenced = files.map((file) => ({
    file,
    names: identifiers(readFileSync(file, 'utf8')),
  }));

  it('finds the sources to scan', () => {
    const names = files.map((file) =>
      relative(ROOT, file).split(sep).join('/'),
    );
    expect(names).toContain('src/gas-chat.class.ts');
    expect(names.some((name) => name.includes('/internal/'))).toBe(false);
    expect(names.some((name) => name.endsWith('.d.ts'))).toBe(false);
  });

  it.each(FORBIDDEN)('never references %s in the code that ships', (name) => {
    const offenders = referenced
      .filter(({ names }) => names.has(name))
      .map(({ file }) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it('references UrlFetchApp, the single external_request scope', () => {
    expect(referenced.some(({ names }) => names.has('UrlFetchApp'))).toBe(true);
  });

  it('catches a reference in code but ignores comments', () => {
    expect(identifiers('SpreadsheetApp.getUi();').has('SpreadsheetApp')).toBe(
      true,
    );
    expect(
      identifiers('// SpreadsheetApp.getUi()\nconst a = 1;').has(
        'SpreadsheetApp',
      ),
    ).toBe(false);
  });
});

"""Reproducible offline import. Writes private artifacts; never touches application data."""

from collections import Counter
import csv
from datetime import date
import gzip
import io
import json
import os
from pathlib import Path
import tempfile

from .audit import audit
from .catalog import SCHEMA, normalize, preview_catalog
from .compatibility import build_compatibility
from .formulas import check_formulas, check_volume
from .mapping import validate_mapping
from .views import check_views
from .xlsx_source import SourceError, canonical, digest, raw_snapshot, read_xlsx

ROOT = Path(__file__).resolve().parents[2]
IMPORTER_VERSION = '1.0.0'


def csv_bytes(rows, fields=None):
    fields = fields or list(rows[0])
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    for row in rows:
        # Reports are spreadsheet-safe; raw cells remain untouched in private JSON.
        writer.writerow({k: "'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@', '\t', '\r')) else v for k, v in row.items()})
    return stream.getvalue().encode()


def artifacts(workbook, tables, summary, findings):
    preview = preview_catalog(tables)
    template = Path(__file__).with_name('preview.html').read_text()
    page_data = {k: v for k, v in preview.items() if k != 'lossless_tables'}
    page_data['source_sha256'] = workbook.sha256
    page = template.replace('__DATA__', canonical(page_data).decode().replace('<', '\\u003c'))
    raw = raw_snapshot(workbook)
    files = {
        'catalog.json': canonical(preview), 'raw-cells.json.gz': gzip.compress(canonical(raw), mtime=0),
        'audit.json': canonical({'summary': summary, 'findings': findings.result()}),
        'index.html': page.encode(),
    }
    sheet_counts = {s.name: s.summary()['stored_cells'] for s in workbook.sheets.values()}
    if {s['name']: len(s['cells']) for s in raw['sheets']} != sheet_counts:
        raise SourceError('Lossless raw cell reconciliation failed')
    for name, rows in tables.items():
        original = workbook.sheets[rows[0]['_source']['sheet']] if rows else None
        source_rows = [n for n, cells in original.rows().items() if n > 4 and any(c.value is not None or c.formula is not None for c in cells.values())] if original else []
        if source_rows != [r['_source']['row'] for r in rows]:
            raise SourceError('Normalized row reconciliation failed: ' + name)
    files['manifest.json'] = canonical({
        'source_spreadsheet_id': '1RbkoiW_6cq4UbojCPBrYmNRmt_sOEA8VMHGpDxoas-0',
        'source_sha256': workbook.sha256, 'source_bytes': workbook.byte_size,
        'schema_version': SCHEMA['version'], 'importer_version': IMPORTER_VERSION, 'stage': 'imported', 'publication_enabled': False,
        'exported_at': None, 'export_date_note': 'No reliable export timestamp in supplied package',
        'document_label': workbook.sheets['00_Навигатор'].cells['A2'].value,
        'row_counts': {k: len(v) for k, v in tables.items()},
        'review_status_counts': {k: dict(Counter(r['review_status'] for r in rows)) for k, rows in tables.items()},
        'lossless_stored_cells': sum(sheet_counts.values()),
        'files_sha256': {name: digest(content) for name, content in sorted(files.items())},
    })
    return files


def write_immutable(destination, files):
    """Same inputs are byte-identical; changed/missing files are a conflict, never overwritten."""
    destination = Path(destination)
    if destination.exists():
        if {p.name for p in destination.iterdir()} != set(files) or any(not (destination / name).is_file() or (destination / name).read_bytes() != data for name, data in files.items()):
            raise SourceError('Existing snapshot differs; refusing to overwrite ' + str(destination))
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.snapshot-', dir=destination.parent))
    for name, data in files.items():
        (temporary / name).write_bytes(data)
    os.rename(temporary, destination)
    return True


def run(source, output_root=None, report_dir=None, audit_date=None):
    source = Path(source).resolve()
    output_root = Path(output_root or ROOT / '.local/smart-trainer').resolve()
    for protected in (ROOT / 'client', ROOT / 'supabase', ROOT / '.git', ROOT / 'docs'):
        if output_root == protected or protected in output_root.parents:
            raise SourceError('Full content output cannot target client, Supabase, Git or public docs')
    workbook = read_xlsx(source)
    if len(workbook.sheets) != 142 or sorted(int(name.split('_', 1)[0]) for name in workbook.sheets) != list(range(142)):
        raise SourceError('Schema v1 expects exactly worksheets 00–141')
    if workbook.privacy_findings:
        raise SourceError('Potential confidential content detected; review redacted part/rule locations before import')
    tables = normalize(workbook)
    summary, findings, _, _ = audit(workbook, tables)
    summary['formula_audit'] = check_formulas(workbook, findings)
    summary['volume_audit'] = check_volume(workbook, tables, findings)
    summary['view_audit'] = check_views(workbook, tables, findings)
    compatibility, coverage, summary['compatibility'] = build_compatibility(tables)
    summary['mapping'] = validate_mapping(ROOT / 'docs/smart-trainer/LEGACY_EXERCISE_MAPPING.csv', workbook, tables, ROOT / 'client/src/data/exercises.ts')
    summary['diagnostic_counts'] = dict(Counter({code: sum(g['count'] for g in findings.result() if g['code'] == code) for code in {g['code'] for g in findings.result()}}))
    payload = artifacts(workbook, tables, summary, findings)
    payload['source.xlsx'] = source.read_bytes()
    if digest(payload['source.xlsx']) != workbook.sha256:
        raise SourceError('Source changed during import')
    destination = output_root / workbook.sha256 / ('schema-' + SCHEMA['version'] + '-importer-' + IMPORTER_VERSION)
    created = write_immutable(destination, payload)
    if report_dir:
        directory = Path(report_dir)
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'summary.json').write_bytes(canonical(summary))
        index = [sheet.summary() for sheet in workbook.sheets.values()]
        for row in index:
            row['cache_states'] = json.dumps(row['cache_states'], sort_keys=True)
        (directory / 'sheet-index.csv').write_bytes(csv_bytes(index))
        (directory / 'program-compatibility.csv').write_bytes(csv_bytes(compatibility))
        (directory / 'coverage.csv').write_bytes(csv_bytes(coverage))
        (directory / 'diagnostics.json').write_bytes(canonical(findings.result()))
        (directory / 'snapshot-receipt.json').write_bytes(canonical({
            'audit_date': audit_date or date.today().isoformat(), 'source_sha256': workbook.sha256,
            'source_bytes': workbook.byte_size, 'exported_at': None,
            'document_date_label': workbook.sheets['00_Навигатор'].cells['A2'].value,
            'sheets': len(workbook.sheets), 'source_file_committed': False,
            'confidentiality_scan': {'credential_or_email_matches': workbook.privacy_findings, 'metadata': workbook.package_metadata},
            'rights': 'Not established; original and full content remain private/ignored',
            'artifacts_sha256': {name: digest(data) for name, data in sorted(payload.items())},
        }))
    return {'source_sha256': workbook.sha256, 'destination': str(destination), 'created': created, 'summary': summary}

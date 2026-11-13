import argparse
import json
from pathlib import Path

from ..import_preview import ROOT, write_immutable
from ..xlsx_source import SourceError, canonical
from .pilot import load_pilot, validate_bundle
from .server import create_server

parser = argparse.ArgumentParser(description='Private pilot content review; no cloud or runtime activation')
sub = parser.add_subparsers(dest='command', required=True)
prepare = sub.add_parser('prepare')
prepare.add_argument('--snapshot', required=True)
prepare.add_argument('--program', default='PRG_000002')
prepare.add_argument('--version', type=int, default=1)
serve = sub.add_parser('serve')
serve.add_argument('--bundle', required=True)
serve.add_argument('--journal', help='Separate private journal; defaults under ignored .local/smart-trainer')
serve.add_argument('--port', type=int, default=5188)
args = parser.parse_args()

try:
    if args.command == 'prepare':
        bundle = load_pilot(args.snapshot, args.program, args.version)
        folder = ROOT / '.local/smart-trainer/trainer-review' / f'{args.program}-v{args.version}' / bundle['bundle_hash']
        write_immutable(folder, {'bundle.json': canonical(bundle)})
        print(json.dumps({'bundle_file': str(folder / 'bundle.json'), 'bundle_hash': bundle['bundle_hash'],
                          'source_sha256': bundle['source_sha256'], 'scope': bundle['scope'],
                          'review_units': len(bundle['units']), 'structural_validation': bundle['structural_validation'],
                          'runtime_enabled': False}, ensure_ascii=False, indent=2))
    else:
        bundle = json.loads(Path(args.bundle).read_text())
        validate_bundle(bundle)
        journal = Path(args.journal) if args.journal else ROOT / '.local/smart-trainer/trainer-review/journals' / f"{bundle['program_id']}-v{bundle['program_version']}.json"
        # Journal paths must stay out of source, public docs and active app folders.
        journal = journal.resolve()
        for protected in (ROOT / 'client', ROOT / 'supabase', ROOT / '.git', ROOT / 'docs', ROOT / 'tools'):
            if journal == protected or protected in journal.parents:
                raise SourceError('Journal must be stored in a private writable directory')
        server = create_server(bundle, journal, args.port)
        print(f'Private local review: http://127.0.0.1:{server.server_port}', flush=True)
        print('Loopback only; no publication. Reviewer is entered explicitly in the UI.', flush=True)
        try:
            server.serve_forever()
        finally:
            server.server_close()
except (SourceError, OSError, ValueError) as exc:
    parser.exit(2, f'Review unavailable: {exc}\n')

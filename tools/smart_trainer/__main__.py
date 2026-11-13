import argparse
import json

from .import_preview import run
from .xlsx_source import SourceError

parser = argparse.ArgumentParser(description='Read-only Smart Trainer XLSX audit and private preview import')
parser.add_argument('--source', required=True, help='Local original XLSX, never a URL')
parser.add_argument('--output-root', help='Private snapshot directory; defaults to ignored .local/smart-trainer')
parser.add_argument('--report-dir', help='Reviewed aggregate reports only; no full source content')
parser.add_argument('--audit-date', help='Date of audit, not a claimed source export date')
args = parser.parse_args()
try:
    result = run(args.source, args.output_root, args.report_dir, args.audit_date)
except (SourceError, OSError, ValueError) as exc:
    parser.exit(2, f'Import refused: {exc}\n')
print(json.dumps(result, ensure_ascii=False, indent=2))

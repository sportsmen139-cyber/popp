"""Small OOXML reader. No Excel evaluation, macros, URL fetches or third party code."""

from collections import Counter
from dataclasses import asdict, dataclass, replace
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
from pathlib import Path
import posixpath
import re
import xml.etree.ElementTree as ET
import zipfile

M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


class SourceError(ValueError):
    pass


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def col_number(letters):
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - 64
    return result


def coordinate(ref):
    match = re.fullmatch(r'([A-Z]+)([1-9][0-9]*)', ref)
    if not match:
        raise SourceError('Invalid cell coordinate')
    row, col = int(match[2]), col_number(match[1])
    if not 1 <= row <= 1048576 or not 1 <= col <= 16384:
        raise SourceError('Cell coordinate outside Excel bounds')
    return row, col


def col_letters(number):
    result = ''
    while number:
        number, rest = divmod(number - 1, 26)
        result = chr(65 + rest) + result
    return result


def translate_formula(formula, anchor, destination):
    """Translate shared A1 references, preserving quoted strings/sheet names and $."""
    ar, ac = coordinate(anchor)
    dr, dc = coordinate(destination)
    token = re.compile(r'''"(?:""|[^"])*"|'(?:''|[^'])*'|(?<![A-Za-z0-9_])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?![A-Za-z0-9_!(])''')

    def shift(match):
        if match[0].startswith(('"', "'")):
            return match[0]
        col, row = col_number(match[2].upper()), int(match[4])
        col += 0 if match[1] else dc - ac
        row += 0 if match[3] else dr - ar
        if not 1 <= col <= 16384 or not 1 <= row <= 1048576:
            raise SourceError('Shared formula reference outside Excel bounds')
        return match[1] + col_letters(col) + match[3] + str(row)
    return token.sub(shift, formula)


@dataclass(frozen=True)
class Cell:
    ref: str
    value: object
    kind: str
    raw: str | None
    formula: str | None = None
    formula_attributes: dict | None = None
    cache_status: str | None = None
    expanded_formula: str | None = None


@dataclass
class Sheet:
    name: str
    state: str
    cells: dict[str, Cell]
    merges: list[str]
    hyperlinks: list[dict]

    def rows(self):
        result = {}
        for ref, cell in self.cells.items():
            row, col = coordinate(ref)
            result.setdefault(row, {})[col] = cell
        return dict(sorted(result.items()))

    def summary(self):
        populated = [coordinate(c.ref) for c in self.cells.values() if c.value is not None or c.formula is not None]
        rows = {r for r, _ in populated}
        return {
            'sheet': self.name, 'state': self.state,
            'first_row': min(rows, default=0), 'last_row': max(rows, default=0),
            'first_column': min((c for _, c in populated), default=0),
            'last_column': max((c for _, c in populated), default=0),
            'populated_rows': len(rows), 'populated_cells': len(populated),
            'stored_cells': len(self.cells), 'merges': len(self.merges),
            'formulas': sum(c.formula is not None for c in self.cells.values()),
            'cache_states': dict(Counter(c.cache_status for c in self.cells.values() if c.formula is not None)),
            'used_range': (col_letters(min(c for _, c in populated)) + str(min(rows)) + ':' + col_letters(max(c for _, c in populated)) + str(max(rows))) if populated else None,
        }


@dataclass
class Workbook:
    sha256: str
    byte_size: int
    sheets: dict[str, Sheet]
    parts: dict[str, str]
    privacy_findings: list[dict]
    package_metadata: dict


def read_xlsx(path):
    source = Path(path).read_bytes()
    if len(source) > 32 * 1024 * 1024:
        raise SourceError('Workbook exceeds 32 MiB limit')
    try:
        archive = zipfile.ZipFile(io.BytesIO(source))
    except zipfile.BadZipFile as exc:
        raise SourceError('Not a readable OOXML ZIP') from exc
    with archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise SourceError('Duplicate ZIP members')
        if len(names) > 5000 or sum(x.file_size for x in archive.infolist()) > 128 * 1024 * 1024:
            raise SourceError('Uncompressed workbook exceeds limits')
        for name in names:
            if name.startswith('/') or '..' in name.split('/') or '\\' in name:
                raise SourceError('Unsafe ZIP member path')
        parts = {}
        privacy = []

        def xml(name):
            try:
                data = archive.read(name)
            except KeyError as exc:
                raise SourceError(f'Missing OOXML part: {name}') from exc
            if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
                raise SourceError('DTD/entity declarations are not supported')
            try:
                return ET.fromstring(data)
            except ET.ParseError as exc:
                raise SourceError(f'Invalid XML part: {name}') from exc

        # Inspect every XML part, including comments/metadata, without exposing matches.
        patterns = {
            'credential': r'(?:\b[0-9]{7,15}:[A-Za-z0-9_-]{30,}\b|\bsb_secret_[A-Za-z0-9_-]{12,}|\bgh[pousr]_[A-Za-z0-9_]{24,}|-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----)',
            'email': r'(?<![\w/])[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}',
        }
        comments = []
        for name in names:
            data = archive.read(name)
            parts[name] = digest(data)
            if name.endswith('.xml'):
                tree = xml(name)
                text = '\n'.join(tree.itertext())
                for rule, pattern in patterns.items():
                    count = len(re.findall(pattern, text))
                    if count:
                        privacy.append({'part': name, 'rule': rule, 'count': count})
                if '/comments' in name:
                    comments.append({'part': name, 'authors': sum(1 for e in tree.iter() if e.tag.endswith('}author')), 'comments': sum(1 for e in tree.iter() if e.tag.endswith('}comment'))})
        if any(name.endswith('vbaProject.bin') for name in names):
            raise SourceError('Macro-enabled source is not supported')
        wb = xml('xl/workbook.xml')
        rels = {e.attrib['Id']: e.attrib for e in xml('xl/_rels/workbook.xml.rels')}
        strings = []
        if 'xl/sharedStrings.xml' in names:
            strings = [''.join(t.text or '' for t in si.iter(M + 't')) for si in xml('xl/sharedStrings.xml')]

        def scalar(kind, raw, inline):
            if kind == 'inlineStr':
                return ''.join(t.text or '' for t in inline.iter(M + 't')) if inline is not None else ''
            if raw is None:
                return None
            if kind == 's':
                try:
                    index = int(raw)
                    if index < 0:
                        raise IndexError
                    return strings[index]
                except (ValueError, IndexError) as exc:
                    raise SourceError('Invalid shared string index') from exc
            if kind == 'b':
                if raw not in ('0', '1'):
                    raise SourceError('Invalid boolean cell')
                return raw == '1'
            if kind in ('str', 'e', 'd'):
                return raw
            try:
                value = Decimal(raw)
                if not value.is_finite():
                    raise SourceError('Nonfinite numeric cell')
                return int(value) if value == value.to_integral_value() else float(value)
            except InvalidOperation as exc:
                raise SourceError('Invalid numeric cell') from exc

        sheets = {}
        sheet_nodes = wb.find(M + 'sheets')
        if sheet_nodes is None or not len(sheet_nodes):
            raise SourceError('Workbook has no worksheets')
        for node in sheet_nodes:
            name = node.attrib['name']
            if name in sheets:
                raise SourceError('Duplicate worksheet name')
            rel = rels[node.attrib[R + 'id']]
            if rel.get('TargetMode') == 'External':
                raise SourceError('External worksheet source is not supported')
            target = rel['Target']
            path_name = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
            if not path_name.startswith('xl/'):
                raise SourceError('Worksheet path escapes xl/')
            tree = xml(path_name)
            cells = {}
            for element in tree.iter(M + 'c'):
                ref = element.attrib['r']
                coordinate(ref)
                if ref in cells:
                    raise SourceError('Duplicate worksheet cell')
                f, v = element.find(M + 'f'), element.find(M + 'v')
                kind = element.attrib.get('t', 'n')
                raw = v.text if v is not None else None
                formula = (f.text or '') if f is not None else None
                cache = ('missing' if v is None else 'empty' if raw is None else 'error' if kind == 'e' else 'present') if f is not None else None
                cells[ref] = Cell(ref, scalar(kind, raw, element.find(M + 'is')), kind, raw, formula, dict(f.attrib) if f is not None else None, cache)
            anchors = {}
            for cell in cells.values():
                attrs = cell.formula_attributes or {}
                if attrs.get('t') == 'shared' and cell.formula:
                    if attrs['si'] in anchors:
                        raise SourceError('Duplicate shared formula anchor')
                    anchors[attrs['si']] = cell
            for ref, cell in list(cells.items()):
                attrs = cell.formula_attributes or {}
                if attrs.get('t') == 'shared':
                    anchor = anchors.get(attrs.get('si'))
                    if anchor is None:
                        raise SourceError('Missing shared formula anchor')
                    cells[ref] = replace(cell, expanded_formula=translate_formula(anchor.formula, anchor.ref, ref))
            sheets[name] = Sheet(name, node.attrib.get('state', 'visible'), cells,
                                 [e.attrib['ref'] for e in tree.iter(M + 'mergeCell')],
                                 [dict(e.attrib) for e in tree.iter(M + 'hyperlink')])
        return Workbook(digest(source), len(source), sheets, parts, privacy, {
            'core_properties_present': 'docProps/core.xml' in names,
            'external_link_parts': [n for n in names if n.startswith('xl/externalLinks/')],
            'comments': comments,
        })


def raw_snapshot(workbook):
    return {
        'source_sha256': workbook.sha256, 'parts_sha256': workbook.parts,
        'sheets': [{'name': s.name, 'state': s.state, 'merges': s.merges,
                    'hyperlinks': s.hyperlinks,
                    'cells': [asdict(c) for c in s.cells.values()]} for s in workbook.sheets.values()],
    }

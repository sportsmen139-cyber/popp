"""Static VLOOKUP checks and independent volume accounting. Never execute Excel."""

import ast
from collections import Counter, defaultdict
import re

from .xlsx_source import coordinate


def arguments(expression):
    depth, quoted, start, result = 0, False, 0, []
    i = 0
    while i < len(expression):
        char = expression[i]
        if char == '"':
            if quoted and i + 1 < len(expression) and expression[i + 1] == '"':
                i += 2
                continue
            quoted = not quoted
        if not quoted:
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
            elif char == ',' and depth == 0:
                result.append(expression[start:i].strip())
                start = i + 1
        i += 1
    return result + [expression[start:].strip()]


def calls(expression, function='VLOOKUP'):
    result = []
    for match in re.finditer(r'\b' + function + r'\(', expression, re.I):
        start = match.end()
        depth, quoted, i = 1, False, start
        while i < len(expression) and depth:
            char = expression[i]
            if char == '"':
                if quoted and i + 1 < len(expression) and expression[i + 1] == '"':
                    i += 2
                    continue
                quoted = not quoted
            if not quoted:
                depth += (char == '(') - (char == ')')
            i += 1
        if depth == 0:
            result.append((match.start(), i, arguments(expression[start:i - 1])))
    return result


class LookupAudit:
    def __init__(self, workbook):
        self.workbook = workbook
        self.indexes = {}

    def lookup(self, args, sheet_name, global_rows=False):
        if len(args) != 4 or args[3].upper() != 'FALSE':
            raise ValueError('unsupported_lookup')
        range_match = re.fullmatch(r"'([^']+)'!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)", args[1])
        if not range_match:
            raise ValueError('unsupported_range')
        target, first_col, first, last_col, last = range_match.groups()
        if target not in self.workbook.sheets:
            raise ValueError('missing_sheet')
        first, last = int(first), int(last)
        col = coordinate(first_col + '1')[1]
        width = coordinate(last_col + '1')[1] - col + 1
        return_col = int(args[2])
        if not (1 <= return_col <= width):
            raise ValueError('invalid_return_column')
        key = self.value(args[0], sheet_name, global_rows)
        index_key = (target, col)
        if index_key not in self.indexes:
            index = defaultdict(list)
            for cell in self.workbook.sheets[target].cells.values():
                row, column = coordinate(cell.ref)
                if column == col and cell.value is not None:
                    index[cell.value].append(row)
            self.indexes[index_key] = index
        all_rows = self.indexes[index_key].get(key, [])
        rows = all_rows if global_rows else [r for r in all_rows if first <= r <= last]
        if not rows:
            raise ValueError(f'range_excludes:{target}:{key}:{all_rows[0]}:{last}' if all_rows else f'missing_key:{target}:{key}')
        if len(rows) != 1:
            raise ValueError(f'ambiguous_key:{target}:{key}')
        row = rows[0]
        column = col + return_col - 1
        cell = next((v for ref, v in self.workbook.sheets[target].cells.items() if coordinate(ref) == (row, column)), None) if column > 26 else self.workbook.sheets[target].cells.get(chr(64 + column) + str(row))
        return cell.value if cell else None

    def value(self, token, sheet_name, global_rows=False):
        if token.startswith('"') and token.endswith('"'):
            return token[1:-1].replace('""', '"')
        if re.fullmatch(r'\$?[A-Z]+\$?[1-9][0-9]*', token):
            cell = self.workbook.sheets[sheet_name].cells.get(token.replace('$', ''))
            return cell.value if cell else None
        nested = calls(token)
        if len(nested) and nested[0][0] == 0 and nested[0][1] == len(token):
            return self.lookup(nested[0][2], sheet_name, global_rows)
        raise ValueError('unsupported_key_expression')


def check_formulas(workbook, findings):
    lookup = LookupAudit(workbook)
    stats = Counter()
    by_sheet = defaultdict(Counter)
    for sheet in workbook.sheets.values():
        for cell in sheet.cells.values():
            if cell.kind == 'e':
                findings.add('CACHED_EXCEL_ERROR', sheet=sheet.name, number=coordinate(cell.ref)[0], field=cell.ref)
            if cell.formula is None:
                continue
            stats['formula_cells'] += 1
            by_sheet[sheet.name]['formula_cells'] += 1
            if cell.cache_status in ('missing', 'empty'):
                stats['empty_or_missing_caches'] += 1
            problems = set()
            for _, _, args in calls(cell.expanded_formula or cell.formula):
                stats['lookup_calls'] += 1
                try:
                    lookup.lookup(args, sheet.name)
                except (ValueError, TypeError) as exc:
                    detail = str(exc)
                    code = 'FORMULA_LOOKUP_RANGE_EXCLUDES_KEY' if detail.startswith('range_excludes:') else 'FORMULA_LOOKUP_REVIEW'
                    problems.add((code, detail))
            if problems:
                stats['affected_cells'] += 1
                by_sheet[sheet.name]['affected_cells'] += 1
                number = coordinate(cell.ref)[0]
                # One occurrence per affected cell; retain concrete referenced key/row.
                code, detail = sorted(problems)[0]
                findings.add(code, sheet=sheet.name, number=number, field=cell.ref.rstrip('0123456789'), detail=cell.ref + ':' + detail)
    return {'counts': dict(stats), 'by_sheet': {k: dict(v) for k, v in by_sheet.items()}}


def arithmetic(expression, lookup, sheet):
    """Only numeric constants/+/-/*// after exact VLOOKUP substitution; no eval()."""
    replacements = calls(expression)
    for start, end, args in reversed(replacements):
        value = lookup.lookup(args, sheet, global_rows=True)
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValueError('nonnumeric operand')
        expression = expression[:start] + str(value) + expression[end:]
    node = ast.parse(expression, mode='eval').body

    def visit(item):
        if isinstance(item, ast.Constant) and isinstance(item.value, (int, float)):
            return item.value
        if isinstance(item, ast.BinOp):
            left, right = visit(item.left), visit(item.right)
            operations = {ast.Add: lambda: left + right, ast.Sub: lambda: left - right, ast.Mult: lambda: left * right, ast.Div: lambda: left / right}
            if type(item.op) in operations:
                return operations[type(item.op)]()
        raise ValueError('unsupported arithmetic')
    return visit(node)


def check_volume(workbook, tables, findings):
    sessions = {s['session_id']: s for s in tables['sessions']}
    roles = defaultdict(list)
    for relation in tables['relations']:
        if relation['relation_type'] == 'MUSCLE':
            roles[(relation['source_id'], relation['source_version'])].append(relation)
    totals = defaultdict(Counter)
    frequency = defaultdict(set)
    for slot in tables['slots']:
        session = sessions.get(slot['session_id'])
        if not session:
            continue
        for relation in roles[(slot['exercise_id'], slot['exercise_version'])]:
            key = (session['program_id'], session['phase_id'], relation['target_id'])
            role = relation['volume_role']
            bucket = 'direct_sets' if role == 'DIRECT' else 'indirect_sets' if role == 'INDIRECT' else 'specific_practice_sets' if relation['role'] in ('PRIMARY', 'SECONDARY') else None
            if bucket:
                totals[key][bucket] += slot['sets']
                frequency[key].add(session['session_id'])
    lookup = LookupAudit(workbook)
    stats = Counter()
    for row in tables['weekly_volume']:
        key = (row['program_id'], row['phase_id'], row['target_id'])
        for field in ('direct_sets', 'indirect_sets', 'specific_practice_sets'):
            value = row[field]
            stats['checked_numeric_volume_fields'] += 1
            if field in row['_formulas']:
                try:
                    computed = arithmetic(row['_formulas'][field]['expression'], lookup, row['_source']['sheet'])
                    stats['supported_sum_formulas'] += 1
                    if computed != value:
                        findings.add('VOLUME_FORMULA_CACHE_MISMATCH', row, field, f'cache={value}, all-source-rows={computed}')
                except (ValueError, SyntaxError, TypeError, ZeroDivisionError):
                    findings.add('UNSUPPORTED_VOLUME_FORMULA', row, field, severity='review')
            if value != totals[key][field]:
                findings.add('VOLUME_ROLE_RECOMPUTATION_REVIEW', row, field, f'cache={value}, role-sum={totals[key][field]}', severity='review')
        if row['sessions_per_week'] != len(frequency[key]):
            findings.add('VOLUME_FREQUENCY_REVIEW', row, 'sessions_per_week', f"cache={row['sessions_per_week']}, distinct-sessions={len(frequency[key])}", severity='review')
        if row['indirect_coefficient'] is None and row['modelled_sets'] is not None:
            findings.add('UNJUSTIFIED_MODELLED_VOLUME', row, 'modelled_sets')
    stats['unknown_modelled_sets'] = sum(r['modelled_sets'] is None for r in tables['weekly_volume'])
    return dict(stats)

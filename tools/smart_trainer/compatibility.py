"""Describe source programs against today's engine. Never register a program."""

from collections import Counter, defaultdict
from itertools import product

from .xlsx_source import canonical, digest


def build_compatibility(tables):
    sessions = defaultdict(list)
    slots = defaultdict(list)
    for row in tables['sessions']:
        sessions[row['program_id']].append(row)
    for row in tables['slots']:
        slots[row['session_id']].append(row)
    exercises = {row['exercise_id']: row for row in tables['exercises']}
    rows = []
    fingerprints = defaultdict(list)
    for program in tables['programs']:
        ss = sessions[program['program_id']]
        positions = [slot for session in ss for slot in slots[session['session_id']]]
        blockers = ['UNREVIEWED_CONTENT', 'SOURCE_PROGRAM_NOT_REGISTERED', 'PHASE_CYCLE_SCHEDULER',
                    'SOURCE_SPECIFIC_PROGRESSION', 'FATIGUE_MISSED_SESSION_ADAPTATION_RULES',
                    'EQUIPMENT_TAXONOMY_MAPPING', 'VERSIONED_HISTORY_BOUNDARY']
        if program['days_per_week'] == 1:
            blockers.append('FREQUENCY_1_NOT_SUPPORTED')
        if program['primary_location'] != 'GYM':
            blockers.append('NO_ACTIVE_' + program['primary_location'] + '_PROGRAM')
        if program['split_structure'] not in ('FULL_BODY', 'UPPER_LOWER'):
            blockers.append('SPLIT_TYPE_NOT_SUPPORTED')
        if program['primary_goal'] in ('STRENGTH', 'MUSCULAR_ENDURANCE', 'POWER'):
            blockers.append('GOAL_NOT_SUPPORTED')
        if program['primary_goal'] in ('HYPERTROPHY', 'EXERCISE_PERFORMANCE'):
            blockers.append('GOAL_TARGET_MAPPING_REQUIRED')
        if any(slot['time_seconds'] is not None for slot in positions):
            blockers.append('SECONDS_RESULT_LOGGING')
        if any(slot['distance_meters'] is not None for slot in positions):
            blockers.append('METERS_RESULT_LOGGING')
        if any(slot['rir_min'] is not None for slot in positions):
            blockers.append('RIR_TRACKING_AND_PROGRESS_CONDITIONS')
        if any(({u for u, f in [('REPS', 'rep_min'), ('SECONDS', 'time_seconds'), ('METERS', 'distance_meters')] if slot[f] is not None} != {exercises.get(slot['exercise_id'], {}).get('measurement_unit')}) for slot in positions):
            blockers.append('SOURCE_MEASUREMENT_UNIT_CONFLICT')
        phases = {(s['phase_id'], s['phase_week_start'], s['phase_week_end']) for s in ss}
        rows.append({
            'program_id': program['program_id'], 'version': program['version'],
            'source_row': program['_source']['row'], 'environment': program['primary_location'],
            'level': program['level'], 'days_per_week': program['days_per_week'], 'goal': program['primary_goal'],
            'review_status': program['review_status'], 'duration_weeks': program['duration_weeks'],
            'phases': len(phases), 'sessions': len(ss), 'slots': len(positions),
            'seconds_slots': sum(s['time_seconds'] is not None for s in positions),
            'distance_slots': sum(s['distance_meters'] is not None for s in positions),
            'engine_compatible': False, 'activation': 'disabled', 'blockers': ';'.join(blockers),
        })
        signature = {k: program[k] for k in ('primary_location', 'level', 'days_per_week', 'primary_goal', 'duration_weeks', 'context', 'specialization', 'format', 'split_structure', 'delivery_method', 'progression_rule', 'fatigue_management', 'missed_session_rule', 'adaptation_limits')}
        signature['cycle'] = [{
            'phase': (s['phase_week_start'], s['phase_week_end']), 'day': s['cycle_day'],
            'slots': [{k: slot[k] for k in ('exercise_id', 'exercise_version', 'order_index', 'priority', 'sets', 'rep_min', 'rep_max', 'time_seconds', 'distance_meters', 'rir_min', 'rir_max', 'rest_min_seconds', 'rest_max_seconds', 'minimum_sets', 'can_skip', 'cut_rank', 'skip_consequence')}
                      for slot in sorted(slots[s['session_id']], key=lambda x: x['order_index'])],
        } for s in sorted(ss, key=lambda x: (x['phase_week_start'], x['cycle_day']))]
        fingerprints[digest(canonical(signature))].append(program['program_id'])
    coverage = []
    for env, level, days, goal in product(('GYM', 'HOME', 'OUTDOOR'), ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'), (1, 2, 3, 4), ('GENERAL_FITNESS', 'HYPERTROPHY', 'STRENGTH', 'MUSCULAR_ENDURANCE', 'EXERCISE_PERFORMANCE', 'POWER')):
        ids = [p['program_id'] for p in rows if (p['environment'], p['level'], p['days_per_week'], p['goal']) == (env, level, days, goal)]
        coverage.append({'environment': env, 'level': level, 'days_per_week': days, 'goal': goal, 'source_count': len(ids), 'engine_compatible_count': 0, 'program_ids': ';'.join(ids)})
    return rows, coverage, {
        'programs': len(rows), 'fully_compatible': 0,
        'blocker_counts': dict(Counter(b for row in rows for b in row['blockers'].split(';'))),
        'same_plan_fingerprint_candidates': [values for values in fingerprints.values() if len(values) > 1],
        'comparison_scope': 'declared cycle/dose/rules, not semantic equivalence or trainer approval',
    }

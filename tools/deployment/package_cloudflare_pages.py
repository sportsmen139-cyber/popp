"""Package an already built, reviewed Alpha. No login, network or deployment."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile


ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ['client/src', 'client/public', 'client/index.html', 'client/package.json',
           'client/package-lock.json', 'client/vite.config.ts', 'client/tsconfig*.json']


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reviewed-commit', required=True,
                        help='Reviewed application revision; packaging/docs may be newer.')
    args = parser.parse_args()
    commit = git('rev-parse', '--verify', args.reviewed_commit + '^{commit}')
    require(git('branch', '--show-current') == 'feature/smart-trainer-catalog-alpha',
            'Use feature/smart-trainer-catalog-alpha; main is not a release input.')
    require(not git('diff', commit, '--', *RUNTIME),
            'Application differs from the reviewed commit. Review and build it first.')
    require(not git('ls-files', '--others', '--exclude-standard', '--', *RUNTIME),
            'Untracked application files found. Review them before packaging.')

    dist = ROOT / 'client/dist'
    require((dist / 'index.html').is_file(), 'Run npm run build in client first.')
    entries = {}
    for path in sorted(dist.rglob('*')):
        require(not path.is_symlink(), 'Symlinks are not allowed in the upload archive.')
        if path.is_dir():
            continue
        name = path.relative_to(dist).as_posix()
        allowed = name in ['index.html', 'favicon.svg', 'icons.svg', 'app-icon.svg', 'apple-touch-icon.png'] or (
            name.startswith('assets/') and path.suffix in ['.js', '.css', '.woff2'])
        require(allowed, f'Unexpected public file: {name}')
        data = path.read_bytes()
        require(len(data) <= 25 * 1024 * 1024, f'File exceeds Pages upload limit: {name}')
        require(not re.search(rb'\b[0-9]{5,16}:[A-Za-z0-9_-]{30,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', data),
                f'Possible credential found in {name}; archive not created.')
        require(b'chatgpt.site' not in data.lower(), f'Old hosting reference found in {name}')
        entries[name] = data
    require(any(name.endswith('.js') for name in entries), 'Compiled application JavaScript is missing.')
    entries['_headers'] = (ROOT / 'deployment/cloudflare-pages/_headers').read_bytes()
    require(len(entries) <= 1000, 'Too many files for Pages dashboard upload.')

    output = ROOT / 'releases'
    output.mkdir(exist_ok=True)
    stem = 'popp-fitness-alpha-' + commit[:7]
    archive = output / (stem + '.zip')
    with zipfile.ZipFile(archive, 'w') as target:
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            target.writestr(info, data)
    with zipfile.ZipFile(archive) as check:
        require(check.testzip() is None and set(check.namelist()) == set(entries), 'Archive verification failed.')
        require(all(check.read(name) == data for name, data in entries.items()), 'Archive contents differ from the build.')

    manifest = {
        'reviewed_application_commit': commit,
        'application_branch': 'feature/smart-trainer-catalog-alpha',
        'archive': archive.name, 'archive_sha256': sha(archive.read_bytes()),
        'archive_bytes': archive.stat().st_size, 'file_count': len(entries),
        'files': {name: {'bytes': len(data), 'sha256': sha(data)} for name, data in sorted(entries.items())},
        'candidate_project_name': 'popp-fitness-alpha',
        'name_reserved': False, 'deployed': False, 'live_https_verified': False,
        'note': 'Local packaging only. No Cloudflare account or project is created. Build before packaging; source identity does not prove a pre-existing dist is fresh.',
    }
    (output / (stem + '.json')).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'archive': str(archive), 'sha256': manifest['archive_sha256'],
                      'files': len(entries), 'bytes': manifest['archive_bytes'], 'deployed': False}))


if __name__ == '__main__':
    main()

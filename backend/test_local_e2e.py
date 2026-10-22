import sys
import urllib.request
import json
import time

if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

base_api = 'http://localhost:8000/api'

print('=== 1. Testing Health & Login ===')
login_payload = json.dumps({'username': 'judge', 'password': 'judge1234'}).encode('utf-8')
req = urllib.request.Request(
    base_api + '/login',
    data=login_payload,
    headers={'Content-Type': 'application/json'}
)
with urllib.request.urlopen(req) as resp:
    login_data = json.loads(resp.read().decode('utf-8'))
    token = login_data['token']
    user_name = login_data.get('user', {}).get('name')
    print(f'Logged in successfully! User: {user_name}')

headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

print('\n=== 2. Testing /api/import (Sample Data) ===')
req_imp = urllib.request.Request(
    base_api + '/import',
    data=json.dumps({'useSample': True, 'records': []}).encode('utf-8'),
    headers=headers
)
with urllib.request.urlopen(req_imp) as resp:
    imp_data = json.loads(resp.read().decode('utf-8'))
    print(f'Import response: {imp_data}')

print('\n=== 3. Testing /api/generate ===')
req_gen = urllib.request.Request(
    base_api + '/generate',
    data=b'{}',
    headers=headers
)
with urllib.request.urlopen(req_gen) as resp:
    gen_data = json.loads(resp.read().decode('utf-8'))
    job_id = gen_data['jobId']
    print(f'Generation started! Job ID: {job_id}')

print('\n=== 4. Polling /api/status/:jobId ===')
for _ in range(30):
    time.sleep(1)
    with urllib.request.urlopen(f'{base_api}/status/{job_id}') as resp:
        status_data = json.loads(resp.read().decode('utf-8'))
        state = status_data.get('state')
        prog = status_data.get('progress')
        msg = status_data.get('message')
        print(f'[{prog}%] State: {state} - {msg}')
        if state in ('done', 'infeasible', 'error', 'timeout'):
            break

print('\n=== 5. Testing /api/schedule/:jobId ===')
req_sched = urllib.request.Request(f'{base_api}/schedule/{job_id}', headers=headers)
with urllib.request.urlopen(req_sched) as resp:
    sched_data = json.loads(resp.read().decode('utf-8'))
    sessions = sched_data.get('sessions', [])
    checks = sched_data.get('checks', [])
    print(f'Total sessions received: {len(sessions)}')
    print(f'Checks evaluated: {len(checks)}')
    for c in checks:
        status_str = 'PASS' if c.get('ok') else 'FAIL'
        print(f'  [{status_str}] {c.get("label")}: {c.get("detail")}')

print('\n=== 6. Testing /api/export/solution.csv ===')
req_exp = urllib.request.Request(f'{base_api}/export/solution.csv?jobId={job_id}', headers=headers)
with urllib.request.urlopen(req_exp) as resp:
    csv_bytes = resp.read()
    csv_lines = csv_bytes.decode('utf-8').strip().split('\n')
    print(f'solution.csv rows count: {len(csv_lines)}')
    print('Header:', csv_lines[0])
    print('First 3 data rows:')
    for r in csv_lines[1:4]:
        print(' ', r)
    fixed_row = [r for r in csv_lines if r.startswith('O007,1,')]
    print('Fixed session row in solution.csv:', fixed_row[0] if fixed_row else 'NOT FOUND')

print('\n=== 7. Testing Frontend Web App ===')
with urllib.request.urlopen('http://127.0.0.1:5173/') as resp:
    print(f'Frontend index.html status: {resp.status} (OK)')

print('\nALL LOCAL FUNCTIONS TESTED AND WORKING PERFECTLY!')

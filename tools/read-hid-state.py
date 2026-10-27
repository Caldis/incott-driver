"""Read-only queries from the archived driver; no settings or firmware writes.

Requires hidapi in the project-local .local/hid-diagnostics directory. On
Windows, select the report-9 collection (Col02), not the report-8 collection.
Opaque device paths and serial numbers are never printed.
"""
from pathlib import Path
import json
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
if __name__ == '__main__' and '--worker' not in sys.argv:
    try:
        result = subprocess.run([sys.executable, __file__, '--worker'], timeout=12)
        raise SystemExit(result.returncode)
    except subprocess.TimeoutExpired:
        print('Read-only HID query timed out after 12 seconds.', file=sys.stderr)
        raise SystemExit(2)
sys.path.insert(0, str(root / '.local/hid-diagnostics'))
import hid

devices = [entry for entry in hid.enumerate(0x093A, 0)
           if entry['product_id'] in (0x622C, 0x522C)
           and entry.get('usage_page') == 0xFF05
           and entry.get('usage') == 1]
output = []
for entry in devices:
    if b'col02' not in entry['path'].lower() and b'&col' in entry['path'].lower():
        continue
    result = {'pid': hex(entry['product_id']), 'interface': entry.get('interface_number'), 'responses': []}
    device = hid.device()
    stage = 'open'
    try:
        device.open_path(entry['path'])
        stage = 'descriptor'
        if hasattr(device, 'get_report_descriptor'):
            result['descriptor'] = list(device.get_report_descriptor())
        for command in (0x8F, 0x89, 0x83, 0x8E, 0x83):
            # Every command has its read bit set and is present in the vendor
            # class. This is the same 8-byte query as WebHID, plus report ID 9.
            stage = 'send-' + hex(command)
            device.send_feature_report(bytes([9, command, 0, 0, 0, 0, 0, 0, 0]))
            time.sleep(0.05)
            stage = 'receive-' + hex(command)
            data = device.get_feature_report(9, 9)
            result['responses'].append({'command': hex(command), 'bytes': data})
    except Exception as error:
        result['error_type'] = type(error).__name__
        result['error_stage'] = stage
    finally:
        device.close()
    output.append(result)
print(json.dumps(output, indent=2))

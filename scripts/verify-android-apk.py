"""Verify the real signed release APK; never installs it or uses signing secrets."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
app = json.loads((ROOT / 'mobile/app.json').read_text(encoding='utf-8'))['expo']
apk = ROOT / 'public/downloads' / f"kaojiang-v{app['version']}.apk"
sdk = Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or r'C:\aceexam-rp\android-sdk')
tools = sorted((sdk / 'build-tools').iterdir(), key=lambda p: tuple(int(n) for n in re.findall(r'\d+', p.name)), reverse=True)
tools = next(p for p in tools if (p / ('aapt.exe' if os.name == 'nt' else 'aapt')).is_file())

def run(tool, *args):
    binary = str(tools / tool)
    command = [binary, *map(str, args)]
    if tool.endswith('.bat'):
        command = ['cmd.exe', '/d', '/s', '/c', subprocess.list2cmdline(command)]
    result = subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return result.stdout + result.stderr

signature = run('apksigner.bat' if os.name == 'nt' else 'apksigner', 'verify', '--print-certs', apk)
certificate = re.search(r'Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]+)', signature).group(1).lower()
expected = re.search(r'SHA-256[：:]\s*`?([a-fA-F0-9]{64})', (ROOT / 'mobile/RELEASE_SIGNING.md').read_text(encoding='utf-8')).group(1).lower()
assert certificate == expected, 'Release certificate differs from the published production identity'
assert 'CN=Android Debug' not in signature, 'Debug signing is not a production release'
badging = run('aapt.exe' if os.name == 'nt' else 'aapt', 'dump', 'badging', apk)
package = re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
assert package and package.groups() == (app['android']['package'], str(app['android']['versionCode']), app['version']), 'APK identity/version differs from source'
permissions = run('aapt.exe' if os.name == 'nt' else 'aapt', 'dump', 'permissions', apk)
assert 'android.permission.VIBRATE' in permissions, 'Correct-answer vibration permission is missing'

with zipfile.ZipFile(apk) as archive:
    names = archive.namelist()
    abis = sorted({name.split('/')[1] for name in names if name.startswith('lib/') and name.endswith('.so')})
    assert abis == sorted(['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']), 'Missing supported native ABI'
    font_hashes = {hashlib.sha256(archive.read(name)).hexdigest() for name in names if name.endswith('.ttf')}
    for name in ['NotoSansSC_400Regular.ttf', 'NotoSansSC_500Medium.ttf', 'NotoSansSC_700Bold.ttf']:
        assert hashlib.sha256((ROOT / 'mobile/assets/fonts' / name).read_bytes()).hexdigest() in font_hashes, f'Missing bundled font: {name}'
    licenses = [name for name in names if name.endswith('/OFL-NotoSansSC.txt')]
    assert licenses and archive.read(licenses[0]) == (ROOT / 'mobile/assets/fonts/OFL-NotoSansSC.txt').read_bytes(), 'Font license missing or changed'
    sound_hashes = {hashlib.sha256(archive.read(name)).hexdigest() for name in names if name.endswith('.wav')}
    for style in ['soft', 'crisp', 'warm']:
        sound = ROOT / 'mobile/assets/sounds' / f'answer-correct-{style}.wav'
        assert hashlib.sha256(sound.read_bytes()).hexdigest() in sound_hashes, f'Missing confirmation sound: {style}'
    bundle = archive.read('assets/index.android.bundle')
    for marker in ['https://aceexam.top/api', app['version'], 'points-v1', 'backend-connection-notice',
                   'android-ai-confirm-sheet', 'android-modal-safe-area', 'location-learning-header', 'profile-points-value',
                   'android-check-in-screen', 'android-about-screen', 'android-wrong-screen',
                   'wrong-knowledge-grid', 'wrong-question-stem', 'about-full-letter', 'about-font-license',
                   'kaojiang-practice-outbox-v1', 'practice-record-sync', 'practice-sync-notice', 'points-debt-notice', 'answer-feedback-settings', 'kaojiang-answer-feedback-v1']:
        assert marker.encode() in bundle or marker.encode('utf-16-le') in bundle, f'Expected release code not found in bundle: {marker}'
    for marker in ['__setFontScale', '__setAndroidTheme', '__setThemeMode', '__answerFeedbackEvents', '__answerFeedbackSettings']:
        assert marker.encode() not in bundle, f'Browser-test control leaked into the APK: {marker}'
    safe_area_native = any(b'RNCSafeAreaProvider' in archive.read(name) for name in names if name.endswith('.dex'))
    assert safe_area_native, 'Native safe-area provider is missing from the signed APK'

digest = hashlib.sha256(apk.read_bytes()).hexdigest()
assert (apk.with_suffix('.apk.sha256')).read_text(encoding='utf-8').split()[0].lower() == digest, 'APK checksum mismatch'
assert (ROOT / 'mobile' / apk.name).read_bytes() == apk.read_bytes(), 'Mobile and download copies differ'
policy = json.loads((ROOT / 'server/mobile-release.json').read_text(encoding='utf-8'))
assert policy['apkSha256'].lower() == digest and policy['apkBytes'] == apk.stat().st_size, 'Public version metadata does not match the APK'
assert policy['apkMd5'].lower() == hashlib.md5(apk.read_bytes()).hexdigest(), 'Download integrity metadata mismatch'
result = {'passed': True, 'version': app['version'], 'versionCode': app['android']['versionCode'], 'package': package.group(1),
          'productionCertificateMatches': True, 'certificateSha256': certificate, 'sha256': digest,
          'bytes': apk.stat().st_size, 'abis': abis, 'bundledFonts': 3, 'fontLicense': True, 'nativeSafeAreaProvider': safe_area_native,
          'backendUrl': 'https://aceexam.top/api', 'bundledAnswerSounds': 3, 'vibrationPermission': True, 'deviceInstalled': False, 'deployed': False}
output = ROOT / 'test-output/native-release-verification.json'
output.parent.mkdir(exist_ok=True)
temporary = output.with_suffix('.json.new')
temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
temporary.replace(output)
print(json.dumps(result, ensure_ascii=False))

"""Check the locally built APK against source, Android tool output and merged manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile


def check(condition, message):
    if not condition:
        raise SystemExit(message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apk", required=True, type=Path)
    parser.add_argument("--badging", required=True, type=Path)
    parser.add_argument("--signature", required=True, type=Path)
    parser.add_argument("--merged-manifest", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    mobile = root / "mobile"
    version = json.loads((mobile / "package.json").read_text(encoding="utf-8"))["version"]
    config = json.loads((mobile / "app.json").read_text(encoding="utf-8"))["expo"]
    code = config["android"]["versionCode"]
    package = config["android"]["package"]
    expected_certificate = "986e4d8a00ce694362b2ac7883588e2775d3259201900c92b88978e797957a3b"
    badging = args.badging.read_text(encoding="utf-8-sig")
    signature = args.signature.read_text(encoding="utf-8-sig")
    check("Verifies" in signature, "Android signature verification did not succeed")
    check(expected_certificate in signature.lower(), "APK certificate differs from the existing release certificate")
    check(f"name='{package}'" in badging and f"versionName='{version}'" in badging
          and f"versionCode='{code}'" in badging, "APK identity/version differs from current source")
    check("sdkVersion:'24'" in badging and "targetSdkVersion:'36'" in badging, "Unexpected Android SDK levels")
    check("application-debuggable" not in badging, "Release APK is debuggable")

    asset_name = "assets/kaojiang-route-player.rplroute.json"
    source_route = mobile / "modules/route-player/android/src/main" / asset_name
    expected_route = source_route.read_bytes()
    route_hash = hashlib.sha256(expected_route).hexdigest()
    check(route_hash == "8a3fc98a9886572f3d28dd0d29b577adc5d5dbf603df7f92cd672633ccff4edb", "Bundled route source differs from the supplied route")
    route_specs = [
        {"asset": "kaojiang-route-player.rplroute.json", "id": "route-player-fixed", "name": "瞎JB乱跑", "points": 24,
         "speedKmh": 12, "sha256": route_hash},
        {"asset": "stadium-route.rplroute.json", "id": "route-player-stadium", "name": "操场循环跑", "points": 4,
         "speedKmh": 20, "sha256": "4b9725171d9b3067e5757f74df90725ffe5758fea973215072fdcb426a51e7e3"},
        {"asset": "heart-route.rplroute.json", "id": "route-player-heart", "name": "爱心", "points": 22,
         "speedKmh": 20, "sha256": "9cb3d3c939eecdb0f10e324e9cb703e998bb7ddeb0281e5385eec9b085b9e44c"},
    ]
    with zipfile.ZipFile(args.apk) as apk:
        check(apk.read(asset_name) == expected_route, "APK contains an incorrect or missing fixed route")
        check(apk.read("assets/route-player-LICENSE.txt") == (mobile / "modules/route-player/LICENSE").read_bytes(),
              "APK must preserve the upstream MIT license")
        abis = sorted({name.split("/")[1] for name in apk.namelist() if name.startswith("lib/") and name.endswith(".so")})
        check(abis == ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"], "APK does not contain all four intended ABIs")
        dex = b"".join(apk.read(name) for name in apk.namelist() if re.fullmatch(r"classes\d*\.dex", name))
        for component in ["RoutePlayerModule", "routes/RoutePlayerActivity", "routes/BuiltInRoutes", "routes/BuiltInRouteStore", "setup/SetupActivity", "location/MockLocationService"]:
            check(f"Lcom/kaojiang/routeplayer/{component};".encode() in dex, f"Missing native component: {component}")
        for spec in route_specs:
            route_bytes = (mobile / "modules/route-player/android/src/main/assets" / spec["asset"]).read_bytes()
            check(hashlib.sha256(route_bytes).hexdigest() == spec["sha256"], f"Supplied route changed: {spec['name']}")
            check(apk.read("assets/" + spec["asset"]) == route_bytes, f"Missing or incorrect APK route: {spec['name']}")
            document = json.loads(route_bytes)
            draft = document["draft"]
            check(document["coordinateSystem"] == "WGS84" and len(draft["pathPoints"]) == spec["points"]
                  and draft["speed"] == spec["speedKmh"] and draft["repeat"] == "ONCE", f"Incorrect source route: {spec['name']}")
            check(spec["name"].encode("utf-8") in dex and spec["id"].encode() in dex, f"Route catalog absent from APK: {spec['name']}")
            spec["repeat"] = "RESTART"
            spec["sourceRepeat"] = "ONCE"
        check(b"RESTART" in dex and b"restartOnLoop" in dex, "Restart-loop playback is absent from APK")
        check(b"Lorg/robolectric/Robolectric" not in dex, "Test framework unexpectedly included in release")
        bundle = apk.read("assets/index.android.bundle")
        qr_source = mobile / "modules/route-player/android/src/main/res/drawable-nodpi/author_friend_code.jpg"
        # Release resource optimization shortens filenames; verify the original bytes.
        qr_entry = next((name for name in apk.namelist() if name.startswith('res/') and name.endswith('.jpg')
                         and apk.read(name) == qr_source.read_bytes()), None)
        check(qr_entry is not None, "APK differs from the supplied author friend QR image")
        check(b"https://aceexam.top/api" in bundle, "Missing production API in release bundle")
        check(version.encode() in bundle and b"AceExamRoutePlayer" in bundle, "Release bundle lacks its version or native bridge")
        check(b"/mobile/announcement" in bundle and b"kaojiang-public-announcement-v1" in bundle,
              "Release bundle lacks the remote announcement endpoint or persistent cache")
        check(b"/admin/mobile/users" in bundle and b"/admin/mobile/announcement" in bundle,
              "Release bundle lacks mobile account or announcement administration")
        check(b"/auth/profile" in bundle and b"launch-announcement" in bundle,
              "Release bundle lacks profile completion or the launch notice")
        check(b"device-backups" not in bundle, "Cancelled contacts/app backup code remains in release")
        check("每一步，都有进度".encode("utf-8") not in bundle and "每一步，都有进度".encode("utf-16le") not in bundle,
              "Release bundle still contains the removed home headline")
        for forbidden in [b"http://127.0.0.1:", b"http://localhost:", b"http://10.0.2.2:"]:
            check(forbidden not in bundle, "A development endpoint leaked into the release bundle")
        resources = apk.read("resources.arsc")
        for text in ["虚拟定位学习", "仅供学习使用", "严禁用于校园跑作弊", "同意并继续", "不同意，返回", "显示悬浮按钮", "结束 · %1$d%%", "定位提醒", "等待定位成功后再开启虚拟定位", "求助作者", "添加作者微信", "选择路线", "循环，到终点跳回起点"]:
            check(text.encode("utf-8") in resources or text.encode("utf-16le") in resources,
                  f"Missing native disclaimer resource: {text}")

    ns = "{http://schemas.android.com/apk/res/android}"
    manifest = ET.parse(args.merged_manifest).getroot()
    check(manifest.get("package") == package, "Merged manifest has a different application identity")
    permissions = {item.get(ns + "name") for item in manifest.findall("uses-permission")}
    check(not {"android.permission.READ_CONTACTS", "android.permission.QUERY_ALL_PACKAGES"} & permissions,
          "Cancelled contacts/app-list permissions remain in APK")
    for permission in ["INTERNET", "ACCESS_FINE_LOCATION", "ACCESS_MOCK_LOCATION", "FOREGROUND_SERVICE_LOCATION", "POST_NOTIFICATIONS", "SYSTEM_ALERT_WINDOW"]:
        check("android.permission." + permission in permissions, f"Missing host/module permission: {permission}")
    app = manifest.find("application")
    for tag, component in [("activity", "routes.RoutePlayerActivity"), ("activity", "setup.SetupActivity"), ("service", "location.MockLocationService")]:
        full_name = "com.kaojiang.routeplayer." + component
        node = next((item for item in app.findall(tag) if item.get(ns + "name") == full_name), None)
        check(node is not None and node.get(ns + "exported") == "false", f"Component missing or externally exported: {full_name}")
        if tag == "service":
            check(node.get(ns + "foregroundServiceType") == "location", "Service lacks its location foreground type")
    launchers = [item.get(ns + "name") for item in app.findall("activity")
                 if any(category.get(ns + "name") == "android.intent.category.LAUNCHER"
                        for category in item.findall("intent-filter/category"))]
    check(launchers == ["com.kaojiang.app.MainActivity"], "Unexpected standalone feature launcher")
    draft = json.loads(expected_route)["draft"]
    check(len(draft["pathPoints"]) == 24 and draft["speed"] == 12 and draft["repeat"] == "ONCE", "Fixed route configuration is incorrect")
    report = {
        "apk": str(args.apk.resolve()), "package": package, "versionName": version, "versionCode": code,
        "sizeBytes": args.apk.stat().st_size, "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(),
        "certificateSha256": expected_certificate, "minSdk": 24, "targetSdk": 36, "abis": abis,
        "fixedRouteSha256": route_hash, "routePoints": 24, "speedKmh": 12, "repeat": "RESTART", "routes": route_specs,
        "routeSelection": "passed", "nativeLoopBehavior": "see matching native unit-test report",
        "releaseBundleAndNativeBridge": "passed", "disclaimerResources": "passed", "remoteAnnouncement": "passed", "mobileAdministration": "passed", "simplifiedHome": "passed",
        "authorHelpQr": "passed", "launchAnnouncement": "passed", "profileCompletion": "passed", "cancelledContactsAndAppsAbsent": "passed",
        "mergedManifest": "passed", "deviceValidation": "not performed",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

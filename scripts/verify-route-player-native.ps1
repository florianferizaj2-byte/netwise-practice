param(
    [string]$SdkPath = 'C:\Users\周凯鑫\AppData\Local\Android\Sdk',
    [string]$JavaPath = 'C:\jdk17',
    [string]$BuildRoot = 'C:\aceexam-rp',
    [string]$GradleHome = 'C:\aceexam-route-gradle',
    [switch]$BuildApk
)
$ErrorActionPreference = 'Stop'
$taskMobile = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\mobile')).TrimEnd('\')
$taskBuild = [IO.Path]::GetFullPath($BuildRoot).TrimEnd('\')
if ($taskBuild -notmatch '^[\x00-\x7F]+$' -or $taskBuild -eq $taskMobile -or $taskBuild.StartsWith($taskMobile+'\',[StringComparison]::OrdinalIgnoreCase)) {
    throw '请使用源码目录外的独立英文构建目录。'
}
$taskCopy = Join-Path $taskBuild 'mobile'
$taskSdk = (Resolve-Path -LiteralPath $SdkPath).Path
$taskJava = (Resolve-Path -LiteralPath $JavaPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $taskJava 'bin\java.exe'))) { throw '未找到 JDK。' }
New-Item -ItemType Directory -Force -Path $taskCopy | Out-Null
& robocopy $taskMobile $taskCopy /E /XD (Join-Path $taskMobile 'node_modules') (Join-Path $taskMobile 'android') (Join-Path $taskMobile '.expo') (Join-Path $taskMobile 'dist') build .gradle .kotlin .cxx /XF *.apk .env .env.* /NJH /NJS /NFL /NDL /NP
if ($LASTEXITCODE -ge 8) { throw '移动端源码复制失败。' }
& robocopy (Join-Path $taskMobile 'android') (Join-Path $taskCopy 'android') /E /XD .gradle build .kotlin .cxx /XF local.properties *.keystore *.jks release-signing.properties /NJH /NJS /NFL /NDL /NP
if ($LASTEXITCODE -ge 8) { throw '安卓工程复制失败。' }
# Package distributions use their build/ directories; keep these JavaScript files.
$taskDependencyNativeBuilds = @(& rg --files (Join-Path $taskMobile 'node_modules') --no-ignore -g build.gradle -g build.gradle.kts | ForEach-Object { Join-Path (Split-Path -Parent $_) 'build' })
& robocopy (Join-Path $taskMobile 'node_modules') (Join-Path $taskCopy 'node_modules') /E /XD .gradle .cxx .git .cache @taskDependencyNativeBuilds /NJH /NJS /NFL /NDL /NP
if ($LASTEXITCODE -ge 8) { throw '移动端依赖复制失败。' }
$taskAlias = Join-Path $taskBuild 'android-sdk'
if (-not (Test-Path -LiteralPath $taskAlias)) { New-Item -ItemType Junction -Path $taskAlias -Target $taskSdk | Out-Null }
$taskLink = Get-Item -LiteralPath $taskAlias
if ($taskLink.LinkType -ne 'Junction' -or $taskLink.Target -notcontains $taskSdk) { throw 'SDK 映射与指定路径不匹配。' }
$taskSdkProperty = $taskAlias.Replace('\','/').Replace(':','\:')
# CMake writes tool paths into JSON; a junction still exposes a Chinese Ninja path.
$taskCmake = Join-Path $taskBuild 'cmake\3.22.1'
& robocopy (Join-Path $taskSdk 'cmake\3.22.1') $taskCmake /E /NJH /NJS /NFL /NDL /NP
if ($LASTEXITCODE -ge 8) { throw 'CMake 英文路径复制失败。' }
$taskCmakeProperty = $taskCmake.Replace('\','/').Replace(':','\:')
Set-Content -LiteralPath (Join-Path $taskCopy 'android\local.properties') -Value @("sdk.dir=$taskSdkProperty", "cmake.dir=$taskCmakeProperty") -Encoding ascii
$taskOldJava = $env:JAVA_HOME
$taskOldCache = $env:GRADLE_USER_HOME
$taskOldTemp = $env:TEMP
$taskOldTmp = $env:TMP
$taskOldSdk = $env:ANDROID_HOME
$taskOldSdkRoot = $env:ANDROID_SDK_ROOT
$taskOldNodeEnv = $env:NODE_ENV
$taskOldApi = $env:EXPO_PUBLIC_API_URL
$taskOldDotEnv = $env:EXPO_NO_DOTENV
try {
    $env:JAVA_HOME = $taskJava
    $env:GRADLE_USER_HOME = if ($GradleHome) { [IO.Path]::GetFullPath($GradleHome) } else { Join-Path $taskBuild 'gradle-home' }
    $taskTemp = Join-Path $taskBuild 'temp'
    New-Item -ItemType Directory -Force -Path $taskTemp | Out-Null
    $env:TEMP = $taskTemp
    $env:TMP = $taskTemp
    $env:ANDROID_HOME = $taskAlias
    $env:ANDROID_SDK_ROOT = $taskAlias
    $env:NODE_ENV = 'production'
    $env:EXPO_PUBLIC_API_URL = 'https://aceexam.top/api'
    $env:EXPO_NO_DOTENV = '1'
    Push-Location -LiteralPath (Join-Path $taskCopy 'android')
    try {
        $taskTargets = @(':aceexam-route-player:testDebugUnitTest', ':aceexam-route-player:lintDebug')
        if ($BuildApk) {
            $taskTargets += ':app:assembleRelease'
            $taskTargets += '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64'
        } else {
            $taskTargets += @(':app:processDebugMainManifest', ':app:compileDebugKotlin', '-PreactNativeArchitectures=arm64-v8a')
        }
        & '.\gradlew.bat' @taskTargets --no-daemon --console=plain
        if ($LASTEXITCODE -ne 0) { throw '原生模块或宿主编译检查失败。' }
        $taskLintFile = Join-Path $taskCopy 'modules\route-player\android\build\reports\lint-results-debug.xml'
        if (-not (Test-Path -LiteralPath $taskLintFile)) { throw '未找到原生模块静态检查结果。' }
        [xml]$taskLint = Get-Content -LiteralPath $taskLintFile -Raw
        if ($taskLint.SelectNodes("//issue[@severity='Error' or @severity='Fatal']").Count -gt 0) { throw '原生模块静态检查仍有错误。' }
        if ($BuildApk) {
            $taskApk = Join-Path $taskCopy 'android\app\build\outputs\apk\release\app-release.apk'
            if (-not (Test-Path -LiteralPath $taskApk)) { throw '未找到正式构建安装包。' }
            $taskReports = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\test-output'))
            New-Item -ItemType Directory -Force -Path $taskReports | Out-Null
            $taskTools = Join-Path $taskAlias 'build-tools\36.0.0'
            $taskSignature = & (Join-Path $taskTools 'apksigner.bat') verify --verbose --print-certs $taskApk
            if ($LASTEXITCODE -ne 0) { throw '安装包签名校验失败。' }
            $taskSignatureFile = Join-Path $taskReports 'route-player-apk-signature.txt'
            $taskSignature | Set-Content -LiteralPath $taskSignatureFile -Encoding utf8
            $taskBadging = & (Join-Path $taskTools 'aapt.exe') dump badging $taskApk
            if ($LASTEXITCODE -ne 0) { throw '安装包身份读取失败。' }
            $taskBadgingFile = Join-Path $taskReports 'route-player-apk-badging.txt'
            $taskBadging | Set-Content -LiteralPath $taskBadgingFile -Encoding utf8
            $taskMergedManifest = Get-ChildItem -LiteralPath (Join-Path $taskCopy 'android\app\build\intermediates') -Recurse -Filter AndroidManifest.xml |
                Where-Object { $_.FullName -match 'merged_manifests?\\release\\' } | Select-Object -First 1
            if (-not $taskMergedManifest) { throw '未找到宿主合并后的清单。' }
            & python (Join-Path $PSScriptRoot 'verify-route-player-apk.py') --apk $taskApk --badging $taskBadgingFile --signature $taskSignatureFile --merged-manifest $taskMergedManifest.FullName --report (Join-Path $taskReports 'route-player-apk-verification.json')
            if ($LASTEXITCODE -ne 0) { throw '安装包内容与功能接入校验失败。' }
            $taskVersion = (Get-Content -LiteralPath (Join-Path $taskMobile 'package.json') -Raw | ConvertFrom-Json).version
            $taskDelivery = Join-Path $taskMobile "kaojiang-v$taskVersion.apk"
            Copy-Item -LiteralPath $taskApk -Destination $taskDelivery
            $taskHash = (Get-FileHash -LiteralPath $taskDelivery -Algorithm SHA256).Hash.ToLowerInvariant()
            "$taskHash  kaojiang-v$taskVersion.apk" | Set-Content -LiteralPath "$taskDelivery.sha256" -Encoding ascii
            Write-Output "已校验并保存：$taskDelivery"
        }
    } finally { Pop-Location }
} finally {
    $env:JAVA_HOME = $taskOldJava
    $env:GRADLE_USER_HOME = $taskOldCache
    $env:TEMP = $taskOldTemp
    $env:TMP = $taskOldTmp
    $env:ANDROID_HOME = $taskOldSdk
    $env:ANDROID_SDK_ROOT = $taskOldSdkRoot
    $env:NODE_ENV = $taskOldNodeEnv
    $env:EXPO_PUBLIC_API_URL = $taskOldApi
    $env:EXPO_NO_DOTENV = $taskOldDotEnv
}

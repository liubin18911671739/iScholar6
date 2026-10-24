# -*- mode: python ; coding: utf-8 -*-

a = Analysis(
    ["src/ischolar_desktop/app.py"],
    pathex=["src"],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="iScholar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=True,
    target_arch="arm64",
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=True, name="iScholar")
app = BUNDLE(
    coll,
    name="iScholar.app",
    icon=None,
    bundle_identifier="com.ischolar.desktop",
    info_plist={
        "CFBundleName": "iScholar",
        "CFBundleDisplayName": "iScholar",
        "CFBundleIdentifier": "com.ischolar.desktop",
        "CFBundleShortVersionString": "0.1.0",
        "CFBundleVersion": "1",
        "LSMinimumSystemVersion": "12.0",
        "NSHighResolutionCapable": True,
    },
)

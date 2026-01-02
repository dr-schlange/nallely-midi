# nallely.spec
from pathlib import Path

block_cipher = None

trevor_ui_dir = 'trevor-ui'
trevor_ui_data = [(str(Path(trevor_ui_dir)), trevor_ui_dir)]

a = Analysis(
    ['nallely/cli.py'],
    pathex=[],
    binaries=[],
    datas=trevor_ui_data,
    hiddenimports=['ruamel.yaml', 'mido.backends.rtmidi', 'psutil'],
    hookspath=[],
    excludes=[
        'tkinter', 'test', 'unittest', 'doctest', 'lib2to3',
        'multiprocessing', 'xmlrpc', 'xml.etree',
        'concurrent', 'asyncio', 'email.mime', 'logging.config', 'logging.handlers', 'pygame'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='nallely.bin',
    debug=True,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    exclude_binaries=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name='nallely.bin',
)
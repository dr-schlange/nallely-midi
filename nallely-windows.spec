# nallely.spec
from pathlib import Path

block_cipher = None

trevor_ui_dir = 'trevor-ui'
trevor_ui_data = [(str(Path(trevor_ui_dir)), trevor_ui_dir)]

a = Analysis(
    ['nallely/cli.py'],
    datas=trevor_ui_data,
    hiddenimports=['ruamel.yaml', 'mido.backends.rtmidi', 'psutil'],
    hookspath=[],
    excludes=[
        'tkinter', 'test', 'unittest', 'doctest', 'lib2to3',
        'multiprocessing', 'xmlrpc', 'xml.etree',
        'concurrent', 'asyncio', 'email.mime', 'logging.config',
        'logging.handlers', 'pygame', 'pydoc',
        'idlelib',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    name='nallely',
    debug=False,
    strip=False,
    upx=True,
    console=True,
    exclude_binaries=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    name='nallely',
)
Import("env")
from pathlib import Path
root = Path(env.subst("$PROJECT_DIR"))
(root / "hal_drivers.cpp").write_text((root / "hal_drivers.c").read_text(), encoding="utf-8")

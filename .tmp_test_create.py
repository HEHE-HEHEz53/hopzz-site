import os, sys, json, tempfile, pathlib
root = tempfile.mkdtemp(prefix="studio-test-")
os.environ["STUDIO_ROOT"] = os.path.join(root, "files")
os.environ["DB_PATH"] = os.path.join(root, "studio.db")
os.environ["STATIC_DIR"] = os.path.join(root, "static")
os.environ["COOKIE_SECRET"] = "test-secret"
os.environ["STUDIO_PASSWORD"] = "root-test-pass"
pathlib.Path(os.environ["STATIC_DIR"]).mkdir(parents=True, exist_ok=True)

sys.path.insert(0, r"D:\DSH\work\studio\server")
from fastapi.testclient import TestClient
import app as appmod

c = TestClient(appmod.app)

r = c.get("/api/setup-state")
print("setup-state", r.status_code, r.text)
r = c.post("/api/login", json={"password": "root-test-pass"})
print("login", r.status_code, r.text[:200])

r = c.get("/api/modules")
print("modules", r.status_code)
mods = r.json()
print("defaults music:", mods.get("defaults", {}).get("music"))
print("module keys:", list(mods.get("modules", {}).keys()))

# exact payload frontend builds for music default checked boxes
payload = {"name": "鲸落", "type": "music", "tags": ["电子", "女声"],
           "modules": ["meta", "audio", "lyrics", "chords", "sections"]}
r = c.post("/api/projects", json=payload)
print("create(full modules)", r.status_code, r.text[:500])

payload2 = {"name": "无模块", "type": "music", "tags": []}
r2 = c.post("/api/projects", json=payload2)
print("create(no modules)", r2.status_code, r2.text[:300])

# what does GET list return
r3 = c.get("/api/projects")
print("list", r3.status_code, r3.text[:300])

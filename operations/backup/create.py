#!/usr/bin/env python3
"""Create an encrypted backup of the EK Axis Supabase staging project."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener

from bundle import digest, seal


PROJECT = "lfmuxtnurxaanixxflwc"
DATABASE = (
    "host=aws-0-ap-northeast-2.pooler.supabase.com port=5432 "
    f"user=postgres.{PROJECT} dbname=postgres sslmode=require"
)
API = f"https://{PROJECT}.supabase.co"
STORAGE_QUERY = """
SELECT jsonb_build_object(
  'buckets', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id)
                       FROM storage.buckets b), '[]'::jsonb),
  'objects', COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.bucket_id,o.name)
                       FROM storage.objects o), '[]'::jsonb)
)
"""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def storage_inventory():
    result = subprocess.check_output(
        ["psql", "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1", "-d", DATABASE,
         "-c", STORAGE_QUERY], encoding="utf-8",
        env={**os.environ, "PGCLIENTENCODING": "UTF8"},
    )
    return json.loads(result)


def collect_objects(directory, storage, key):
    opener = build_opener(NoRedirect())
    objects = []
    for index, item in enumerate(storage["objects"]):
        name = item["name"]
        if name.split("/")[-1] == ".emptyFolderPlaceholder":
            continue
        bucket = quote(item["bucket_id"], safe="")
        object_name = "/".join(quote(part, safe="") for part in name.split("/"))
        request = Request(
            f"{API}/storage/v1/object/authenticated/{bucket}/{object_name}",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
        )
        relative = f"objects/{index:08d}"
        path = directory / relative
        with opener.open(request, timeout=60) as response, path.open("xb") as output:
            shutil.copyfileobj(response, output)
        size = path.stat().st_size
        expected_size = (item.get("metadata") or {}).get("size")
        if expected_size is not None and size != int(expected_size):
            raise ValueError(f"Downloaded size differs for object {index}")
        objects.append({
            "bucket": item["bucket_id"], "name": name, "file": relative,
            "size": size, "sha256": digest(path),
        })
    return objects


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--recipient", required=True, type=Path)
    parser.add_argument("--repo", required=True, type=Path)
    args = parser.parse_args()
    destination = args.destination.resolve()
    recipient = args.recipient.resolve(strict=True)
    key = os.environ.get("EKAXIS_STAGING_STORAGE_KEY")
    if not key:
        parser.error("Set EKAXIS_STAGING_STORAGE_KEY for the staging project.")
    if destination.exists():
        parser.error("The destination already exists.")

    git = ["git", "-C", str(args.repo.resolve(strict=True))]
    revision = subprocess.check_output([*git, "rev-parse", "HEAD"], text=True).strip()
    started = datetime.now(timezone.utc).isoformat()
    with tempfile.TemporaryDirectory(dir=destination.parent) as temp:
        directory = Path(temp)
        (directory / "objects").mkdir()
        before = storage_inventory()
        database_dump = directory / "database.dump"
        subprocess.run(
            ["pg_dump", "-w", "--format=custom", "--dbname", DATABASE,
             "--file", database_dump], check=True,
        )
        subprocess.run(
            ["pg_restore", "--list", database_dump], check=True, stdout=subprocess.DEVNULL,
        )
        objects = collect_objects(directory, before, key)
        if before != storage_inventory():
            raise RuntimeError("Storage changed during export. Retry the backup.")
        source = directory / "source.bundle"
        subprocess.run([*git, "bundle", "create", source, "HEAD"], check=True)
        refs = subprocess.check_output(
            ["git", "bundle", "list-heads", source], text=True,
        ).splitlines()
        if f"{revision} HEAD" not in refs:
            raise RuntimeError("Git HEAD changed during export. Retry the backup.")
        write_json(directory / "files.json", {
            "buckets": before["buckets"], "objects": objects,
            "storage_metadata": before["objects"],
        })
        write_json(directory / "inventory.json", {
            "project": PROJECT, "git_commit": revision, "started_at": started,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "object_count": len(objects),
        })
        seal(SimpleNamespace(source=directory, destination=destination, recipient=recipient))
    print(f"Encrypted staging backup created: {destination}")


if __name__ == "__main__":
    main()

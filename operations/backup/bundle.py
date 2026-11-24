#!/usr/bin/env python3
"""Seal and verify an EK Axis staging backup package."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


REQUIRED = ("database.dump", "files.json", "source.bundle", "inventory.json")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def inventory(directory):
    paths = {}
    for path in sorted(directory.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symbolic link in backup input: {path}")
        if path.is_file():
            paths[path.relative_to(directory).as_posix()] = digest(path)
        elif not path.is_dir():
            raise ValueError(f"Unsupported backup input: {path}")
    if not all(name in paths for name in REQUIRED):
        raise ValueError("Backup inputs are incomplete")
    return paths


def seal(args):
    source = args.source.resolve(strict=True)
    destination = args.destination.resolve()
    if destination.is_relative_to(source):
        raise ValueError("Choose a destination outside the input directory")
    with tempfile.TemporaryDirectory(dir=destination.parent) as temp:
        work = Path(temp)
        members = inventory(source)
        if "manifest.json" in members:
            raise ValueError("manifest.json is reserved")
        manifest = work / "manifest.json"
        manifest.write_text(json.dumps({"format": 1, "sha256": members}, indent=2))
        archive = work / "backup.tar"
        with tarfile.open(archive, "w") as bundle:
            bundle.add(manifest, arcname="manifest.json")
            for name in members:
                bundle.add(source / name, arcname=name, recursive=False)
        encrypted = work / "backup.cms"
        subprocess.run(
            ["openssl", "cms", "-encrypt", "-binary", "-aes-256-gcm",
             "-in", archive, "-outform", "DER", "-out", encrypted, args.recipient], check=True
        )
        destination.hardlink_to(encrypted)


def unpack(args):
    destination = args.destination.resolve()
    with tempfile.TemporaryDirectory(dir=destination.parent) as temp:
        work = Path(temp)
        archive = work / "backup.tar"
        subprocess.run(
            ["openssl", "cms", "-decrypt", "-binary", "-inform", "DER",
             "-in", args.source, "-out", archive, "-recip", args.recipient,
             "-inkey", args.key],
            check=True
        )
        contents = work / "contents"
        contents.mkdir()
        with tarfile.open(archive, "r") as bundle:
            names = set()
            for member in bundle:
                name = Path(member.name)
                if (not member.isfile() or name.is_absolute() or
                        ".." in name.parts or name in names):
                    raise ValueError(f"Invalid archive member: {member.name}")
                names.add(name)
                target = contents / name
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as stream, target.open("xb") as output:
                    shutil.copyfileobj(stream, output)
        manifest = contents / "manifest.json"
        expected = json.loads(manifest.read_text())
        manifest.unlink()
        if expected != {"format": 1, "sha256": inventory(contents)}:
            raise ValueError("Backup verification failed")
        destination.mkdir(mode=0o700)
        for path in contents.iterdir():
            path.rename(destination / path.name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("seal", "unpack"):
        sub = commands.add_parser(command)
        sub.add_argument("source", type=Path)
        sub.add_argument("destination", type=Path)
        sub.add_argument("--recipient", required=True, type=Path)
        if command == "unpack":
            sub.add_argument("--key", required=True, type=Path)
    args = parser.parse_args()
    {"seal": seal, "unpack": unpack}[args.command](args)


if __name__ == "__main__":
    main()

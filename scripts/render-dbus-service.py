#!/usr/bin/env python3
"""Render a per-user D-Bus activation entry with an absolute executable path."""
import pathlib
import sys

if len(sys.argv) != 4:
    raise SystemExit("Usage: render-dbus-service.py TEMPLATE BINARY OUTPUT")

template, executable, output = map(pathlib.Path, sys.argv[1:])
if not executable.is_absolute() or "\n" in str(executable):
    raise SystemExit("Executable path must be absolute")
# D-Bus Exec= is command-line syntax; quoted paths preserve whitespace.
quoted = '"' + str(executable).replace('\\', '\\\\').replace('"', '\\"') + '"'
text = template.read_text(encoding="utf-8")
if text.count("@EXEC_PATH@") != 1:
    raise SystemExit("Expected one @EXEC_PATH@ placeholder")
rendered = text.replace("@EXEC_PATH@", quoted)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(rendered, encoding="utf-8")

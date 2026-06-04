import json
import sys

import click

from .types import Issue, Result
from .validate import validate_file


def _issue_to_dict(i: Issue) -> dict:
    d = {"code": i.code, "severity": i.severity, "message": i.message, "path": i.path}
    if i.frame is not None:
        d["frame"] = i.frame
    if i.spec_ref is not None:
        d["spec_ref"] = i.spec_ref
    if i.data:
        d["data"] = i.data
    return d


def _result_to_dict(r: Result) -> dict:
    return {
        "valid": r.valid,
        "errors": [_issue_to_dict(e) for e in r.errors],
        "warnings": [_issue_to_dict(w) for w in r.warnings],
        "summary": r.summary,
    }


def _print_human(file, res):
    if res.valid and not res.warnings:
        click.echo(f"ok   {file}")
        return
    mark = "warn" if res.valid else "fail"
    click.echo(f"{mark} {file}")
    for i in res.errors + res.warnings:
        loc = f"{i.path} ({i.frame})" if i.frame else i.path
        click.echo(f"  {i.severity:5} {i.code} {loc}\n        {i.message}")
    click.echo(f"  {res.summary['errors']} error(s), {res.summary['warnings']} warning(s)")


@click.command()
@click.argument("files", nargs=-1, required=True)
@click.option("--json", "as_json", is_flag=True, help="machine-readable output")
@click.option("--quiet", is_flag=True, help="exit code only")
@click.option("--strict", is_flag=True, help="treat warnings as errors")
def main(files, as_json, quiet, strict):
    worst = 0
    results = {}
    for f in files:
        res = validate_file(f)
        results[f] = res
        if res.errors or (strict and res.warnings):
            worst = 1
        if not as_json and not quiet:
            _print_human(f, res)
    if as_json:
        click.echo(json.dumps({f: _result_to_dict(r) for f, r in results.items()}, indent=2))
    sys.exit(worst)


if __name__ == "__main__":
    main()

"""MappingConfig (DB row) -> lookup tables the rule engine uses. Empty parts fall back to Phase-1 defaults."""
import json
from dataclasses import dataclass, field, replace

from server.app.modules.mapping.normalizer import keyed
from server.app.schemas.row import COLUMN_FIELDS

# Every template column may be re-pointed at a Jira column, or cleared with an empty source.
MAPPABLE = frozenset(COLUMN_FIELDS.values())


@dataclass(frozen=True)
class ResolvedMapping:
    status: dict[str, str] = field(default_factory=dict)  # keyed() tables; empty = default
    progress: dict[str, str] = field(default_factory=dict)
    phase: dict[str, str] = field(default_factory=dict)
    bucket: dict[str, int] = field(default_factory=dict)  # raw phase -> step
    sources: dict[str, tuple[str, ...]] = field(default_factory=dict)  # field_id -> jira columns, first non-empty wins
    kinds: dict[str, str] = field(default_factory=dict)  # field_id -> source_type, every column of the config

    def cols(self, field_id: str, default: tuple[str, ...]) -> tuple[str, ...]:
        return self.sources.get(field_id, default)

    def matched(self, file_cols: set[str]) -> int:
        """Columns with a usable source: computed/constant ones, and Jira ones whose column exists in the file."""
        return sum(
            1 for fid, kind in self.kinds.items()
            if fid != "x" and (kind in ("derived", "constant") or any(c in file_cols for c in self.sources.get(fid, ())))
        )

    def used(self, file_cols: set[str]) -> int:
        """File columns this mapping reads (configured sources + the fixed parsers' inputs)."""
        fixed = {"Summary", "Issue key", "Parent key", "Description", "Custom field (Progress Report)", "Custom field (Risk Notes)"}
        return len((fixed | {c for cols in self.sources.values() for c in cols}) & file_cols)


def resolve_mapping(cfg, src_overrides: dict[str, str] | None = None, vm_overrides=None) -> ResolvedMapping:
    """Accepts a MappingConfig, a ResolvedMapping or None (= defaults).

    `src_overrides` {field_id: Jira column} and `vm_overrides` (ValueMappings) are unsaved previews layered on top.
    """
    if cfg is None:
        base = ResolvedMapping()
    elif isinstance(cfg, ResolvedMapping):
        base = cfg
    else:
        vm = json.loads(cfg.value_mappings_json or "{}")
        cols = json.loads(cfg.columns_json or "[]")
        base = ResolvedMapping(
            keyed(vm.get("status_map", {})), keyed(vm.get("progress_map", {})), dict(vm.get("phase_map", {})),
            dict(vm.get("phase_bucket", {})),
            {c["field_id"]: (c["source_field"], *c.get("fallbacks", []))
             for c in cols if c.get("source_type") == "jira" and c.get("source_field")}
            | {c["field_id"]: () for c in cols if c.get("source_type") == "manual"},  # () = cleared / hand-filled
            {c["field_id"]: c["source_type"] for c in cols},
        )
    if src_overrides:
        base = replace(
            base, sources={**base.sources, **{f: ((c,) if c else ()) for f, c in src_overrides.items()}},
            kinds={**base.kinds, **{f: ("jira" if c else "manual") for f, c in src_overrides.items()}},
        )
    if vm_overrides is not None:
        base = replace(
            base, status=keyed(vm_overrides.status_map), progress=keyed(vm_overrides.progress_map),
            phase=dict(vm_overrides.phase_map), bucket=dict(vm_overrides.phase_bucket),
        )
    return base

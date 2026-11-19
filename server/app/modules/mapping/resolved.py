"""MappingConfig (DB row) -> lookup tables the rule engine uses. Empty parts fall back to Phase-1 defaults."""
import json
from dataclasses import dataclass, field

from server.app.modules.mapping.normalizer import keyed


@dataclass(frozen=True)
class ResolvedMapping:
    status: dict[str, str] = field(default_factory=dict)  # keyed() tables; empty = default
    progress: dict[str, str] = field(default_factory=dict)
    phase: dict[str, str] = field(default_factory=dict)
    sources: dict[str, tuple[str, ...]] = field(default_factory=dict)  # field_id -> jira columns, first non-empty wins

    def cols(self, field_id: str, default: tuple[str, ...]) -> tuple[str, ...]:
        return self.sources.get(field_id, default)


def resolve_mapping(cfg) -> ResolvedMapping:
    """Accepts a MappingConfig, a ResolvedMapping or None (= defaults)."""
    if cfg is None:
        return ResolvedMapping()
    if isinstance(cfg, ResolvedMapping):
        return cfg
    vm = json.loads(cfg.value_mappings_json or "{}")
    sources = {
        c["field_id"]: (c["source_field"], *c.get("fallbacks", []))
        for c in json.loads(cfg.columns_json or "[]")
        if c.get("source_type") == "jira" and c.get("source_field")
    }
    return ResolvedMapping(keyed(vm.get("status_map", {})), keyed(vm.get("progress_map", {})),
                           dict(vm.get("phase_map", {})), sources)

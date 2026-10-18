# Changelog

## ratchet 0.1.3

- check-comments scans C-style languages (C#, Java, Kotlin, Swift, Go, C, C++, Unity shaders), PHP, hash-comment languages (shell, Ruby, YAML, TOML, PowerShell, GDScript) and XML when added with `--ext`.
- check-sources accepts marker words in their other forms (measures, verifies, estimated) and `Source:` followed by a space.

## ratchet 0.1.2

- check-sources takes `--skip-dirs` for folders such as raw research notes.
- check-sources accepts unverified, proposed, proposal and example as honest labels for a figure that is not a measurement.

## ratchet 0.1.1

- check-sources counts a bare domain with a path, such as `example.com/pricing`, as a source.

## 0.1.0

First release.

- content-audit: the content audit skill, with references on citation defects and copied sentences.
- ratchet: `check-comments` and `check-sources`, with baselines.
- required-reading: the blocking hook and its setup skill.
- audit-hygiene: the `known-issues` and `guard-check` skills, and a register template.
- found-bugs: the `found-bugs` skill and its Stop hook.

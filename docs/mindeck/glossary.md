---
description: "Mindeck business terms and their distinction from Harness implementation types."
---

# Mindeck glossary

English | [中文](glossary.zh.md)

## Summary

This reference defines the business terms used in Mindeck requirements. These definitions do not select database schemas, APIs, or a first-release implementation. Harness technical terms remain owned by the [upstream glossary](../glossary.md).

## Table of Contents

- [Terms](#terms)
- [Maintenance](#maintenance)
- [Dev Note](#dev-note)

<a id="terms"></a>

## Terms

Use these meanings when discussing scope and acceptance.

| Term | Meaning |
|---|---|
| Project | A business grouping in which people share materials, role agents, conversations, and outputs. |
| Member | A person participating in a project; detailed membership and permission rules require design. |
| Role agent | An agent configured with role and system instructions; the role is not an authorization grant. |
| Knowledge base | Reusable source material organized for retrieval and use by agents. |
| File library | Persistent storage and organization of reusable source files and output files. |
| Output | Work produced during collaboration, including text and files; retention rules require design. |
| Harness Workspace | The upstream directory-and-session grouping described in the [Workspace reference](../subsystems/workspace.md). |

<a id="maintenance"></a>

## Maintenance

Add a term when its meaning affects a requirement, API, or design decision. Keep one definition here, link to upstream definitions where appropriate, and update both languages together. Specify the mapping from a business term to an implementation type in the owning architecture or package document.

<a id="dev-note"></a>

## Dev Note

The mapping between a Project and Harness Workspaces or Sessions is open. Knowledge indexing, file versioning, and output review terminology should be added only when the corresponding product decisions need it.

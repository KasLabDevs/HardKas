---
title: hardkas kcc
---

# `hardkas kcc`

## `hardkas kcc dispatch`

### Synopsis (Generated)

**Purpose:** The KCC-1 dispatch tag of a function signature written with dispatch type names, e.g. 'transfer(&#123;int,byte[32],byte,byte,byte[32],byte[32]&#125;[],byte[])': Hash(UTF8(signature))[0:4]

#### Arguments

- `&lt;signature&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas kcc template-hash`

### Synopsis (Generated)

**Purpose:** The KCC-1 template hash Hash(LE64(len(prefix)) || prefix || LE64(len(suffix)) || suffix) of a template

#### Options

- `--prefix &lt;hex&gt;`: Template prefix (hex; empty is '')
- `--suffix &lt;hex&gt;`: Template suffix (hex; empty is '')
- `--json` (Default: `false`): Output as JSON

---


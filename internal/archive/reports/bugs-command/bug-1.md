# Bug in Command: hardkas artifact list

## Execution Status
- **Type**: CLI
- **Exit Code**: 1
- **Duration**: 1356ms

## Error Output
```
error: unknown command 'list'

Usage: hardkas artifact [options] [command]

Manage HardKAS artifacts

Options:
  -h, --help                      display help for command

Commands:
  create [options] <type>         Create a new HardKAS artifact [37malpha[39m
  inspect [options] <id_or_path>  Deep inspect an artifact by ID or path
                                  [32mstable[39m
  verify [options] <path>         Verify an artifact's integrity and schema
                                  [32mstable[39m
  explain [options] <path>        Provide a human-readable operational summary
                                  of an artifact [32mstable[39m
  lineage [options] <path>        Show the provenance and operational history
                                  of an artifact [32mstable[39m
  help [command]                  display help for command

```
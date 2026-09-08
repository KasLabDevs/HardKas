# Chapter 9: Troubleshooting

When things go wrong in HardKAS, diagnostic tools are available to help you understand the state of the workspace.

```bash execute
hardkas init troubleshoot-project
cd troubleshoot-project
```

The primary diagnostic tool is the `doctor` command, which scans the workspace for missing configurations, corrupt artifacts, or unreachable nodes.

```bash execute
cd troubleshoot-project
hardkas doctor
```

If you encounter a `NotInitializedError`, it's because you haven't run `hardkas init` in the current directory. HardKAS enforces strict boundaries and will refuse to operate on arbitrary paths.

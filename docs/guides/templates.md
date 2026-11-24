---
title: "Project templates"
sidebar_label: "Chapter 5: Templates"
description: "The templates bundled with HardKAS, and how hardkas create scaffolds a Kaspa application from one into a new folder."
---

# Chapter 5: Templates

HardKAS comes with bundled templates to accelerate your Kaspa projects.
You can scaffold a full application in seconds (`create` takes the template, then a destination folder that must not exist yet):

```bash execute
hardkas create payment-app my-payment-app
```

The template is fully isolated and ready to go. `create` pins its `@hardkas/*` dependencies to your CLI's version; install them, since its config imports `@hardkas/sdk` and `@hardkas/core`:

```bash
npm install --prefix my-payment-app
```

Then read its configuration from inside the project:

```bash execute
cd my-payment-app
hardkas config show
```

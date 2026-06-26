# Predicted Friction Points

- Raw TypeErrors might be thrown instead of structured `HardkasError`s with `code`.
- `simulate` with an unsigned plan might crash internally instead of throwing a validation error.

## Actual Friction Encounters

1. **Unstructured Errors**: All errors triggered during transaction planning, signing, and execution threw standard JavaScript `Error` instances with plain text messages, instead of the structured `HardkasError` with a distinct `code` property. This makes it very hard for external apps to reliably catch specific expected errors without doing flaky regex string matching against the message.
2. **Missing Input Validation Error**: Calling `simulate({})` threw `Cannot simulate signed artifact without parent plan or embedded plan data.`, showing a lack of early schema validation (it assumed it was a valid artifact but missed the parent plan, rather than failing with "Invalid artifact schema provided to simulate").

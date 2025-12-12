# LLM Context Files

This folder contains documentation artifacts designed to help local LLM models (Qwen, Ollama, DeepSeek, LLaMA, etc.) understand the SVG Grouper codebase without needing to scan source files.

## Purpose

These files provide compressed, high-signal context about:
- Project architecture and data flow
- API contracts and function signatures
- Custom data structures and formats
- Key patterns and conventions

This enables local LLMs to make useful recommendations for bug fixes, features, and refactoring without full source access.

## Files Overview

| File | Purpose | When to Use |
|------|---------|-------------|
| `CODEBASE.md` | Project overview, structure, tech stack, dev commands | Start here for general orientation |
| `API.md` | Function signatures, parameters, return types | When working with specific modules |
| `DATA_FORMATS.md` | Custom types, interfaces, data structures | When dealing with data transformations |
| `ARCHITECTURE.md` | System design, data flow, component relationships | For architectural decisions |

## Usage Examples

### Getting Started
```
"I'm working on the SVG Grouper codebase. Here's the context:
[paste CODEBASE.md]

I need to add a new export format. Where should I start?"
```

### API Questions
```
"Given this API documentation:
[paste API.md]

How do I implement a new fill pattern that integrates with the existing system?"
```

### Data Structure Work
```
"Here are the data formats used:
[paste DATA_FORMATS.md]

I need to add a new property to track stroke width on SVGNode. What else needs to change?"
```

### Architecture Decisions
```
"Based on this architecture:
[paste ARCHITECTURE.md]

What's the best place to add undo/redo functionality?"
```

## Combining Context

For complex tasks, combine multiple files:

```
"Context for SVG Grouper:
[paste CODEBASE.md]
[paste relevant sections from API.md]

Task: Add a new boolean operation to MergeTab..."
```

## Note for Claude Code

**Claude should ignore this folder unless explicitly asked.** These files are optimized for local LLMs with limited context windows and may be redundant when Claude has direct source access.

If a user asks Claude to reference these files specifically, Claude can read them normally.

## Keeping Updated

These files should be updated when:
- New major features are added
- API signatures change significantly
- Data structures are modified
- Architecture evolves

The goal is accuracy over completeness. Focus on what's most useful for making code changes.
